const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
process.env.TOOLKIT_EMAIL_DNS_CHECK = 'off'; // synthetic example.com addresses
process.env.TOOLKIT_EMAIL_VERIFICATION = 'off'; // these suites test other features; verification has its own suite (mail.test.cjs)
const { startLocalRuntime } = require('../server/local-runtime');
test('browser/desktop reuse one server; independent startup cannot overwrite shared accounts', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-shared-'));
  const runtime = await startLocalRuntime({ dataDir, port: 0 });
  try {
    const reused = await startLocalRuntime({ dataDir, port: 0 });
    assert.equal(reused.origin, runtime.origin); assert.equal(reused.reused, true);
    const registered = await fetch(runtime.origin + '/api/auth/register', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'test' },
      body: JSON.stringify({ name: 'Shared test', email: 'shared@example.com', password: 'violet-harbor-lamp-42', acceptTerms: true }) });
    assert.equal(registered.status, 201);
    require('../server/store').flush();
    const dbPath = path.join(dataDir, 'db.json'), snapshot = fs.readFileSync(dbPath, 'utf8');
    assert.equal((await fetch(runtime.origin + '/__toolkit_runtime')).status, 403);
    const badHost = await new Promise(resolve => {
      require('node:http').get(runtime.origin, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
    });
    assert.equal(badHost, 403);
    // Async child probe runs while this process continues serving requests.
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, [path.resolve(__dirname, '../server/start.cjs')],
      { env: { ...process.env, TOOLKIT_DATA_DIR: dataDir, PORT: '0' }, windowsHide: true });
    let output = ''; child.stdout.on('data', chunk => output += chunk);
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    assert.equal(code, 0); assert.match(output, /already running/);
    assert.equal(fs.readFileSync(dbPath, 'utf8'), snapshot, 'Joining process never loads/writes a separate database');
    await reused.close(); assert.equal((await fetch(runtime.origin)).status, 200, 'Joining client does not close owner server');
  } finally { await runtime.close(); }
  assert.equal(fs.existsSync(path.join(dataDir, 'runtime.json')), false);
});
