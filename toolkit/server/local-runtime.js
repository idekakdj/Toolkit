// Browser and desktop share one loopback server and one in-memory database.
// The lock prevents separate processes from overwriting the same JSON store.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataDirectory } = require('./storage-path');
function probe(record) {
  if (!record || !Number.isInteger(record.port) || record.port < 1 || record.port > 65535 || typeof record.key !== 'string') return Promise.resolve(false);
  return new Promise(resolve => {
    const req = http.get({ hostname: '127.0.0.1', port: record.port, path: '/__toolkit_runtime',
      headers: { 'X-Toolkit-Runtime': record.key }, timeout: 1000 }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; if (text.length > 4096) req.destroy(); });
      res.on('end', () => { try { resolve(res.statusCode === 200 && JSON.parse(text).instance === record.key); } catch { resolve(false); } });
    });
    req.on('timeout', () => req.destroy()); req.on('error', () => resolve(false));
  });
}
function alive(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}
async function startLocalRuntime({ dataDir = dataDirectory(), assetRoot, port = Number(process.env.PORT || 4310), publicOrigin } = {}) {
  if (publicOrigin) publicOrigin = require('./remote-origin').remoteOrigin(publicOrigin);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid Toolkit port');
  dataDir = path.resolve(dataDir);
  const lock = path.join(dataDir, 'runtime.json');
  fs.mkdirSync(dataDir, { recursive: true });
  let record;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const fd = fs.openSync(lock, 'wx');
      record = { pid: process.pid, port, key: crypto.randomBytes(32).toString('hex'), publicOrigin: publicOrigin || null };
      fs.writeFileSync(fd, JSON.stringify(record)); fs.closeSync(fd);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      let existing;
      try { existing = JSON.parse(fs.readFileSync(lock, 'utf8')); } catch { /* Another process may still be writing the lock. */ }
      if (existing && await probe(existing)) {
        if ((existing.publicOrigin || null) !== (publicOrigin || null)) throw new Error('This database is already open in a different server mode. Stop that server first.');
        return { origin: `http://127.0.0.1:${existing.port}`, reused: true, close: async () => {} };
      }
      if (existing && !alive(existing.pid)) { fs.unlinkSync(lock); continue; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  if (!record) throw new Error('Toolkit data is already in use by an unresponsive server. Close that server before trying again.');
  const release = () => {
    try { if (JSON.parse(fs.readFileSync(lock, 'utf8')).key === record.key) fs.unlinkSync(lock); } catch { /* Already removed. */ }
  };
  process.env.TOOLKIT_DATA_DIR = dataDir;
  if (assetRoot) process.env.TOOLKIT_ASSET_ROOT = assetRoot;
  process.env.TOOLKIT_LOCAL_ONLY = publicOrigin ? '0' : '1';
  if (publicOrigin) process.env.NODE_ENV = 'production';
  let application;
  try { application = require('./index'); } catch (err) { release(); throw err; }
  const server = http.createServer((req, res) => {
    const allowed = [`127.0.0.1:${record.port}`, `localhost:${record.port}`];
    if (publicOrigin) allowed.push(new URL(publicOrigin).host);
    if (!allowed.includes(req.headers.host)) { res.writeHead(403); return res.end('Invalid local host'); }
    if (req.url === '/__toolkit_runtime') {
      if (publicOrigin && req.headers.host === new URL(publicOrigin).host) { res.writeHead(404); return res.end(); }
      const supplied = Buffer.from(String(req.headers['x-toolkit-runtime'] || ''));
      const expected = Buffer.from(record.key);
      if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) { res.writeHead(403); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ instance: record.key }));
    }
    application(req, res);
  });
  // Bound how long a client may hold a connection open without finishing a request
  // (slow-header / slow-body attacks), and cap request headers.
  server.headersTimeout = 15000;
  server.requestTimeout = 180000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 100;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    record.port = server.address().port;
    fs.writeFileSync(lock, JSON.stringify(record));
  } catch (err) { release(); throw new Error('Cannot start shared Toolkit server: ' + err.message); }
  process.once('exit', release);
  return { origin: publicOrigin || `http://127.0.0.1:${record.port}`, reused: false, close: () => new Promise(resolve => {
    require('./store').flush();
    server.close(() => { release(); resolve(); }); server.closeAllConnections();
  }) };
}
module.exports = { startLocalRuntime };
