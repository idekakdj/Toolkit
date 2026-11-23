const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-desktop-'));
const { _electron } = require(process.env.TOOLKIT_PLAYWRIGHT_PATH || 'playwright');
const env = { ...process.env, TOOLKIT_DESKTOP_TEST_DIR: profile, TOOLKIT_EMAIL_DNS_CHECK: 'off', TOOLKIT_EMAIL_VERIFICATION: 'off' };
delete env.ELECTRON_RUN_AS_NODE;
const packaged = process.env.TOOLKIT_DESKTOP_EXE;
const executablePath = packaged || require('electron');
async function launch() {
  return _electron.launch({ executablePath, args: packaged ? [] : [path.resolve(__dirname, '../desktop/main.cjs')], env, timeout: 30000 });
}
(async () => {
  let desktop = await launch();
  try {
    let page = await desktop.firstWindow();
    await page.waitForURL('http://127.0.0.1:*/');
    const origin = new URL(page.url()).origin;
    assert.equal((await fetch(origin)).status, 200, 'Browser can access the shared local server');
    assert.equal((await fetch(origin + '/api/projects')).status, 401, 'Browser API still requires sign-in');
    assert.equal((await fetch(origin + '/__toolkit_runtime')).status, 403, 'Runtime control remains private');
    const prefs = await desktop.evaluate(({ BrowserWindow }) => {
      const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return { sandbox: p.sandbox, nodeIntegration: p.nodeIntegration, contextIsolation: p.contextIsolation, webSecurity: p.webSecurity };
    });
    assert.deepEqual(prefs, { sandbox: true, nodeIntegration: false, contextIsolation: true, webSecurity: true });
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    const api = (url, method, body) => page.evaluate(async ({ url, method = 'GET', body }) => {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'desktop-test' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, data: await res.json() };
    }, { url, method, body });
    const registered = await api('/api/auth/register', 'POST', { name: 'Desktop test', email: 'desktop@example.com', password: 'Violet-Harbor-Lamp-42', acceptTerms: true });
    assert.equal(registered.status, 201);
    assert.equal((await api('/api/auth/me')).status, 200, 'Production desktop auth cookie works');
    const webLogin = await fetch(origin + '/api/auth/login', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'web-test' },
      body: JSON.stringify({ email: 'desktop@example.com', password: 'Violet-Harbor-Lamp-42' }) });
    assert.equal(webLogin.status, 200, 'Desktop account works in browser session');
    const webCookie = webLogin.headers.get('set-cookie').split(';')[0];
    for (const url of ['/sigma/dashboard', '/pigment', '/imagevendor', '/placeholder/convert.html']) {
      await page.goto(origin + url); assert.ok(await page.title());
    }
    const created = await api('/api/projects', 'POST', { name: 'Desktop persisted design' });
    assert.equal(created.status, 201);
    await page.goto(origin + '/sigma/editor/' + created.data.project.id);
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');
    await page.locator('[data-tool="rect"]').click();
    const box = await page.locator('#viewport').boundingBox();
    await page.mouse.move(box.x + 100, box.y + 100); await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 170, { steps: 5 }); await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');
    const stored = await api('/api/projects/' + created.data.project.id);
    assert.equal(stored.data.project.document.nodes.length, 1);
    const webStored = await fetch(origin + '/api/projects/' + created.data.project.id, { headers: { Cookie: webCookie } });
    assert.deepEqual((await webStored.json()).project, stored.data.project, 'Both clients see identical saved artwork');
    const webRename = await fetch(origin + '/api/projects/' + created.data.project.id, {
      method: 'PUT', headers: { Cookie: webCookie, 'Content-Type': 'application/json', 'X-Requested-With': 'web-test' },
      body: JSON.stringify({ name: 'Changed from browser', baseRevision: stored.data.project.revision }),
    });
    assert.equal(webRename.status, 200);
    assert.equal((await api('/api/projects/' + created.data.project.id)).data.project.name, 'Changed from browser');
    const exportData = await page.evaluate(async () => {
      const { rasterize } = await import('/sigma/js/editor/export.js');
      const blob = await rasterize('artboard', 1, 'image/png');
      return { type: blob.type, size: blob.size };
    });
    assert.equal(exportData.type, 'image/png'); assert.ok(exportData.size > 0);
    const exportPath = path.join(profile, 'desktop-export.png');
    await desktop.evaluate(({ session }, exportPath) => {
      session.fromPartition('persist:toolkit').once('will-download', (_event, item) => item.setSavePath(exportPath));
    }, exportPath);
    await page.locator('#export-btn').click();
    await page.locator('#export-format').selectOption('png');
    await page.locator('#export-go').click();
    await page.waitForFunction(() => document.querySelector('#export-go')?.disabled === false);
    for (let attempt = 0; attempt < 50 && !fs.existsSync(exportPath); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(fs.existsSync(exportPath), 'Desktop download writes the exported artwork');
    assert.equal(fs.readFileSync(exportPath).subarray(1, 4).toString(), 'PNG');
    await desktop.close(); desktop = null;
    const dbFile = path.join(profile, 'data', 'db.json');
    const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    assert.equal(db.projects[0].document.nodes.length, 1);
    desktop = await launch(); page = await desktop.firstWindow();
    await page.waitForURL('http://127.0.0.1:*/');
    const restored = await page.evaluate(async () => (await fetch('/api/auth/me')).status);
    assert.equal(restored, 200, 'Desktop session survives restart and changing local port');
    const resumed = await page.evaluate(async () => (await (await fetch('/api/projects')).json()).projects);
    assert.equal(resumed[0].id, created.data.project.id);
    await desktop.close(); desktop = null;
    // A standalone web server may already own the database when desktop opens.
    const shared = await require('../server/local-runtime').startLocalRuntime({
      dataDir: path.join(profile, 'data'), assetRoot: path.resolve(__dirname, '../..'), port: 0,
    });
    try {
      desktop = await launch(); page = await desktop.firstWindow();
      await page.waitForURL(shared.origin + '/');
      assert.equal(await page.evaluate(async () => (await fetch('/api/auth/me')).status), 200);
      await desktop.close(); desktop = null;
      assert.equal((await fetch(shared.origin)).status, 200, 'Desktop leaves an independently started web server running');
    } finally { await shared.close(); }
    console.log('PASS desktop: sandbox, authenticated shared browser/desktop server, bidirectional saved artwork, PNG download and session/account persistence across restart' + (packaged ? ' (packaged executable)' : ''));
  } finally { if (desktop) await desktop.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
