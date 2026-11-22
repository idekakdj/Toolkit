const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-test-'));
process.env.TOOLKIT_DATA_DIR = temp;
process.env.TOOLKIT_EMAIL_DNS_CHECK = 'off'; // synthetic example.com addresses; DNS is covered by security.test.cjs
process.env.TOOLKIT_EMAIL_VERIFICATION = 'off'; // these suites test other features; verification has its own suite (mail.test.cjs)
const app = require('../server/index');
let server, base, cookie;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });
async function request(url, method = 'GET', body, session = cookie) {
  const headers = { 'X-Requested-With': 'test' };
  if (session) headers.Cookie = session;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(base + url, { method, headers, redirect: 'manual', body: body === undefined ? undefined : JSON.stringify(body) });
}
test('all direct editor URLs enforce the shared sign-in', async () => {
  for (const url of ['/sigma/dashboard', '/sigma/dashboard.html', '/sigma/editor.html', '/pigment/app', '/pigment/app.html', '/imagevendor/app', '/imagevendor/app.html', '/placeholder/convert.html']) {
    assert.equal((await request(url, 'GET', undefined, '')).status, 302, url);
  }
});
test('malformed cookies and JSON fail safely; CSRF stays enforced', async () => {
  assert.equal((await fetch(base + '/api/auth/me', { headers: { Cookie: 'toolkit_session=%ZZ' } })).status, 401);
  assert.equal((await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'X-Requested-With': 'test', 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST' })).status, 403);
  assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'test', Origin: 'https://foreign.example' } })).status, 403);
});
test('rejected updates are atomic across all three document stores', async () => {
  const registered = await request('/api/auth/register', 'POST', { name: 'Test user', email: 'test@example.com', password: 'violet-harbor-lamp-42', acceptTerms: true }, '');
  assert.equal(registered.status, 201);
  cookie = registered.headers.get('set-cookie').split(';')[0];
  for (const [collection, key] of [['projects', 'project'], ['paintings', 'painting'], ['images', 'image']]) {
    const created = await request('/api/' + collection, 'POST', { name: 'Original' });
    const id = (await created.json())[key].id;
    const url = '/api/' + collection + '/' + id;
    assert.equal((await request(url, 'PUT', { name: 'Should not stick', document: {} })).status, 400);
    assert.equal((await request(url, 'PUT', { name: 'Should not stick', thumbnail: 'invalid' })).status, 400);
    assert.equal((await request(url, 'PUT', { thumbnail: 'data:image/png;base64,\" onerror=alert(1)' })).status, 400);
    const current = await request(url);
    assert.equal(current.headers.get('cache-control'), 'no-store');
    assert.equal((await current.json())[key].name, 'Original');
    assert.equal((await request(url, 'GET', undefined, '')).status, 401);
  }
});
test('image layer IDs and raster sources are validated', () => {
  const { dimensions, safeTree, validLayers } = require('../server/validation');
  assert.equal(dimensions({ w: 1.5, h: 100 }), false);
  assert.equal(safeTree({ src: 'javascript:alert(1)' }), false);
  const layer = { id: 'one', name: 'Layer', visible: true, opacity: 1, data: '' };
  assert.equal(validLayers([layer]), true);
  assert.equal(validLayers([layer, layer]), false);
});
test('a corrupt database is never overwritten at startup or shutdown', () => {
  const { spawnSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-corrupt-'));
  const file = path.join(dir, 'db.json');
  fs.writeFileSync(file, '{ damaged database');
  const child = spawnSync(process.execPath, ['-e', "require('./server/store')"], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, TOOLKIT_DATA_DIR: dir }, encoding: 'utf8',
  });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /refusing to overwrite/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{ damaged database');
});

test('revision guards reject stale tabs atomically, validate bases, and support legacy clients', async () => {
  const { db } = require('../server/store');
  for (const [collection, key] of [['projects','project'],['paintings','painting'],['images','image']]) {
    const created = (await (await request('/api/' + collection, 'POST', { name: 'Concurrency' })).json())[key];
    assert.equal(created.revision, 0);
    const url = '/api/' + collection + '/' + created.id;
    const record = db[collection].find(p => p.id === created.id);
    delete record.revision; // A persisted pre-revision record, in the isolated test DB.
    const first = (await (await request(url)).json())[key];
    assert.equal(first.revision, 0);
    const listed = (await (await request('/api/' + collection)).json())[collection];
    assert.equal(listed.find(p => p.id === created.id).revision, 0);
    const updated = await request(url, 'PUT', { baseRevision: 0, name: 'First tab', document: first.document });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json())[key].revision, 1);
    const snapshot = JSON.stringify(record);
    const stale = await request(url, 'PUT', { baseRevision: 0, name: 'Stale tab', document: first.document, thumbnail: null });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).revision, 1);
    assert.equal(JSON.stringify(record), snapshot);
    for (const baseRevision of [null, -1, 0.5, '1', true, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal((await request(url, 'PUT', { baseRevision, name: 'Invalid' })).status, 400);
      assert.equal(JSON.stringify(record), snapshot);
    }
    assert.equal((await request(url, 'PUT', { baseRevision: 1, document: {} })).status, 400);
    assert.equal(JSON.stringify(record), snapshot);
    const legacy = await request(url, 'PUT', { name: 'Legacy import' });
    assert.equal((await legacy.json())[key].revision, 2);
    assert.equal((await request(url, 'PUT', { baseRevision: 1, name: 'Late tab' })).status, 409);
    const final = await request(url, 'PUT', { baseRevision: 2, name: 'Reloaded' });
    assert.equal((await final.json())[key].revision, 3);
  }
});
