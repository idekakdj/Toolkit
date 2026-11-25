// Minimal HTTP client for the running Toolkit server, authenticated with a personal access token.
//
// Where Toolkit is: TOOLKIT_URL if set; otherwise the port recorded in runtime.json in the
// Toolkit data folder (TOOLKIT_DATA_DIR, or the default the desktop app and
// `node toolkit/server/start.cjs` share); otherwise http://127.0.0.1:4310. It is looked up
// on every request, so restarting Toolkit on another port needs no MCP restart.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DEFAULT_PORT = 4310;
const TOKEN_RE = /^tkp_[A-Za-z0-9_-]{43}$/;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const TIMEOUT_MS = 30000;

class ToolkitError extends Error {
  constructor(message, { status = 0, code = null, data = null } = {}) {
    super(message);
    this.status = status; this.code = code; this.data = data;
  }
}

function dataDirectory() {
  if (process.env.TOOLKIT_DATA_DIR) return path.resolve(process.env.TOOLKIT_DATA_DIR);
  const home = process.platform === 'win32'
    ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    : process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(home, 'Toolkit', 'data');
}

// Only the port is read from runtime.json; its instance key is never used or sent anywhere.
function runtimePort() {
  try {
    const rec = JSON.parse(fs.readFileSync(path.join(dataDirectory(), 'runtime.json'), 'utf8'));
    if (Number.isInteger(rec.port) && rec.port > 0 && rec.port < 65536) return rec.port;
  } catch { /* not running, or another data folder */ }
  return null;
}

// A token must never travel in clear text off this machine: plain http is loopback-only.
function checkBaseUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new ToolkitError(`TOOLKIT_URL is not a valid URL: ${raw}`); }
  if (u.protocol === 'http:' && !LOOPBACK.has(u.hostname)) throw new ToolkitError('TOOLKIT_URL must use https unless it points at this computer (127.0.0.1 or localhost).');
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new ToolkitError('TOOLKIT_URL must start with http:// or https://.');
  if (u.username || u.password) throw new ToolkitError('TOOLKIT_URL must not contain a user name or password.');
  return u.origin;
}

function baseUrl() {
  if (process.env.TOOLKIT_URL) return checkBaseUrl(process.env.TOOLKIT_URL);
  return `http://127.0.0.1:${runtimePort() || DEFAULT_PORT}`;
}

function tokenProblem(token) {
  if (!token) return 'No Toolkit access token is configured. Create one on your Toolkit account page (Account > Access tokens) and set it as TOOLKIT_TOKEN in this MCP server\'s environment.';
  if (!TOKEN_RE.test(token)) return 'TOOLKIT_TOKEN does not look like a Toolkit access token (it should start with "tkp_"). Copy it again from your Toolkit account page.';
  return null;
}

function createClient({ token = process.env.TOOLKIT_TOKEN, fetchImpl = fetch } = {}) {
  token = typeof token === 'string' ? token.trim() : '';
  async function request(method, urlPath, body) {
    const problem = tokenProblem(token);
    if (problem) throw new ToolkitError(problem, { code: 'no_token' });
    const base = baseUrl();
    const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json', 'User-Agent': 'toolkit-mcp/0.1' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetchImpl(base + urlPath, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw new ToolkitError(`Could not reach Toolkit at ${base} (${err.cause && err.cause.code || err.name || 'network error'}). Make sure Toolkit is running: open the Toolkit desktop app, or run "node toolkit/server/start.cjs".`, { code: 'unreachable' });
    }
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) {
      const msg = (data && data.error) || `Toolkit answered ${res.status}.`;
      throw new ToolkitError(msg, { status: res.status, code: data && data.code, data });
    }
    return data;
  }
  return {
    get: p => request('GET', p),
    post: (p, b) => request('POST', p, b),
    put: (p, b) => request('PUT', p, b),
    baseUrl,
    tokenProblem: () => tokenProblem(token),
  };
}

module.exports = { createClient, ToolkitError, baseUrl, dataDirectory, checkBaseUrl, TOKEN_RE };
