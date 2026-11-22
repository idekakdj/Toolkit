const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
process.env.TOOLKIT_EMAIL_DNS_CHECK = 'off'; // synthetic example.com addresses
process.env.TOOLKIT_EMAIL_VERIFICATION = 'off'; // these suites test other features; verification has its own suite (mail.test.cjs)
const { startLocalRuntime } = require('../server/local-runtime');
test('hosted devices share accounts and documents with secure cookies and conflict protection', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-hosted-'));
  const server = await startLocalRuntime({ dataDir, port: 0, publicOrigin: 'https://shared.example.com' });
  const port = JSON.parse(fs.readFileSync(path.join(dataDir, 'runtime.json'))).port;
  function request(url, method = 'GET', body, cookie, extra = {}) {
    return new Promise((resolve, reject) => {
      const raw = body === undefined ? undefined : JSON.stringify(body);
      const req = http.request({ hostname: '127.0.0.1', port, path: url, method, headers: {
        Host: 'shared.example.com', 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.10',
        'X-Requested-With': 'test', Origin: 'https://shared.example.com',
        ...(raw ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } : {}),
        ...(cookie ? { Cookie: cookie } : {}), ...extra,
      } }, res => {
        let data = ''; res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: () => JSON.parse(data) }));
      });
      req.on('error', reject); req.end(raw);
    });
  }
  try {
    await assert.rejects(startLocalRuntime({ dataDir, port: 0 }), /different server mode/);
    const account = { name: 'Shared', email: 'shared@example.com', password: 'test-password-123', acceptTerms: true };
    const first = await request('/api/auth/register', 'POST', account);
    assert.equal(first.status, 201);
    assert.match(first.headers['set-cookie'][0], /HttpOnly; SameSite=Strict/);
    assert.match(first.headers['set-cookie'][0], /; Secure/);
    const a = first.headers['set-cookie'][0].split(';')[0];
    const second = await request('/api/auth/login', 'POST', account);
    assert.equal(second.status, 200);
    const b = second.headers['set-cookie'][0].split(';')[0];
    assert.notEqual(a, b);
    assert.equal((await request('/__toolkit_runtime')).status, 404);
    assert.equal((await request('/api/auth/logout', 'POST', undefined, a, { Origin: 'https://attacker.example' })).status, 403);
    for (const [collection, key] of [['projects', 'project'], ['paintings', 'painting'], ['images', 'image']]) {
      const created = await request('/api/' + collection, 'POST', { name: 'Device A' }, a);
      assert.equal(created.status, 201);
      const id = created.data()[key].id, url = '/api/' + collection + '/' + id;
      assert.equal((await request(url, 'GET', undefined, b)).data()[key].name, 'Device A');
      assert.equal((await request(url, 'PUT', { name: 'Device B', baseRevision: 0 }, b)).status, 200);
      assert.equal((await request(url, 'GET', undefined, a)).data()[key].name, 'Device B');
      assert.equal((await request(url, 'PUT', { name: 'Stale', baseRevision: 0 }, a)).status, 409);
      assert.equal((await request(url)).status, 401);
    }
    const other = await request('/api/auth/register', 'POST', { ...account, email: 'other@example.com' });
    const c = other.headers['set-cookie'][0].split(';')[0];
    assert.deepEqual((await request('/api/projects', 'GET', undefined, c)).data().projects, []);
  } finally { await server.close(); }
});
