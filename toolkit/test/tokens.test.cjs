// Personal access tokens: creation (with re-authentication), hashing at rest, scopes,
// where tokens are and are not accepted, revocation, expiry, rate limits and auditing.
// Uses an isolated temporary data directory; never touches real accounts.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-tokens-'));
process.env.TOOLKIT_DATA_DIR = temp;
process.env.TOOLKIT_EMAIL_DNS_CHECK = 'off';
process.env.TOOLKIT_EMAIL_VERIFICATION = 'off';
const app = require('../server/index');
const { db, flushStrict } = require('../server/store');
const audit = require('../server/audit');
const { TOKEN_RE } = require('../server/tokens');
const sec = require('../server/security');
// Token creation shares the 10-per-15-minutes "sensitive" bucket; tests make many on purpose.
function resetSensitive() { for (const u of db.users) sec.sensitiveLimiter.resetKey('u:' + u.id); }

const PASSWORD = 'Violet-Harbor-Lamp-42';
let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(r => server.close(r)); fs.rmSync(temp, { recursive: true, force: true }); });

// Browser-style call: session cookie plus the CSRF header.
async function call(url, { method = 'GET', body, cookie, headers = {} } = {}) {
  const h = { 'X-Requested-With': 'test', ...headers };
  if (cookie) h.Cookie = cookie;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers: h, redirect: 'manual', body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; try { data = await res.clone().json(); } catch { /* not JSON */ }
  return { res, status: res.status, data };
}
// Tool-style call: bearer token only, no cookie and no CSRF header.
async function bearer(url, token, { method = 'GET', body, headers = {} } = {}) {
  const h = { Authorization: 'Bearer ' + token, ...headers };
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers: h, redirect: 'manual', body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; try { data = await res.clone().json(); } catch { /* not JSON */ }
  return { res, status: res.status, data };
}
let userCount = 0;
async function newUser() {
  userCount++;
  const r = await call('/api/auth/register', { method: 'POST', body: { name: 'Token user ' + userCount, email: `tokens${userCount}@example.com`, password: PASSWORD, acceptTerms: true } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.res.headers.get('set-cookie').split(';')[0];
}
async function makeToken(cookie, scopes = ['read', 'write'], extra = {}) {
  resetSensitive();
  const r = await call('/api/account/tokens', { method: 'POST', cookie, body: { name: 'MCP', scopes, currentPassword: PASSWORD, ...extra } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data;
}
function auditEntries() {
  const out = [];
  for (const f of fs.readdirSync(audit.AUDIT_DIR)) {
    for (const line of fs.readFileSync(path.join(audit.AUDIT_DIR, f), 'utf8').split('\n').filter(Boolean)) out.push(JSON.parse(line));
  }
  return out;
}

test('creating a token needs a session and the current password; only a hash is stored', async () => {
  const cookie = await newUser();
  assert.equal((await call('/api/account/tokens', { method: 'POST', body: { name: 'x', scopes: ['read'], currentPassword: PASSWORD } })).status, 401);
  assert.equal((await call('/api/account/tokens', { method: 'POST', cookie, body: { name: 'x', scopes: ['read'] } })).status, 400);
  assert.equal((await call('/api/account/tokens', { method: 'POST', cookie, body: { name: 'x', scopes: ['read'], currentPassword: 'wrong-password-1' } })).status, 403);
  for (const bad of [{ scopes: [] }, { scopes: ['admin'] }, { scopes: 'read' }, { scopes: ['read', 'read'] }, { name: '' }, { name: 'x'.repeat(61) }, { expiresInDays: 3 }, { expiresInDays: '30' }]) {
    resetSensitive();
    const r = await call('/api/account/tokens', { method: 'POST', cookie, body: { name: 'ok', scopes: ['read'], currentPassword: PASSWORD, ...bad } });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  const made = await makeToken(cookie, ['write', 'read']);
  assert.match(made.token, TOKEN_RE);
  assert.deepEqual(made.record.scopes, ['read', 'write']);
  assert.ok(made.record.expiresAt > Date.now() + 89 * 86400000, 'defaults to a 90-day expiry');
  assert.equal(made.record.hint, made.token.slice(0, 8));

  const listed = await call('/api/account/tokens', { cookie });
  assert.equal(listed.status, 200);
  assert.equal(listed.data.tokens.length, 1);
  assert.equal(JSON.stringify(listed.data).includes(made.token), false, 'the secret is never shown again');
  assert.equal('hash' in listed.data.tokens[0], false, 'the hash is never sent to the browser');

  const stored = db.tokens.find(t => t.id === made.record.id);
  assert.match(stored.hash, /^[0-9a-f]{64}$/);
  flushStrict();
  const onDisk = fs.readFileSync(path.join(temp, 'db.json'), 'utf8');
  assert.equal(onDisk.includes(made.token), false, 'the plain token is never written to disk');
  assert.equal(onDisk.includes(made.token.slice(4)), false);

  const never = await makeToken(cookie, ['read'], { expiresInDays: 0 });
  assert.equal(never.record.expiresAt, null);
  assert.ok(auditEntries().some(e => e.event === 'token.create' && e.detail.tokenId === made.record.id));
});

test('a token works on the document APIs without a cookie or CSRF header, and respects scopes', async () => {
  const cookie = await newUser();
  const rw = (await makeToken(cookie, ['read', 'write'])).token;
  const ro = (await makeToken(cookie, ['read'])).token;
  const wo = (await makeToken(cookie, ['write'])).token;

  const me = await bearer('/api/auth/me', ro);
  assert.equal(me.status, 200);
  assert.equal(me.data.user.name, 'Token user ' + userCount);
  assert.equal((await bearer('/api/auth/me', wo)).status, 200, 'any valid token can identify its owner');

  for (const [collection, key] of [['projects', 'project'], ['paintings', 'painting'], ['images', 'image']]) {
    const created = await bearer('/api/' + collection, rw, { method: 'POST', body: { name: 'From a tool' } });
    assert.equal(created.status, 201, collection + ' ' + JSON.stringify(created.data));
    const id = created.data[key].id;
    const got = await bearer(`/api/${collection}/${id}`, ro);
    assert.equal(got.status, 200);
    assert.equal(got.data[key].name, 'From a tool');
    const rev = await bearer(`/api/${collection}/${id}/revision`, ro);
    if (collection !== 'images') assert.deepEqual(Object.keys(rev.data).sort(), ['revision', 'updatedAt']);

    const denied = await bearer('/api/' + collection, ro, { method: 'POST', body: { name: 'Nope' } });
    assert.equal(denied.status, 403);
    assert.equal(denied.data.code, 'token_scope');
    assert.equal((await bearer('/api/' + collection, wo)).status, 403, 'write-only tokens cannot read');

    const put = await bearer(`/api/${collection}/${id}`, rw, { method: 'PUT', body: { name: 'Renamed', baseRevision: 0 } });
    assert.equal(put.status, 200);
    const stale = await bearer(`/api/${collection}/${id}`, rw, { method: 'PUT', body: { name: 'Stale', baseRevision: 0 } });
    assert.equal(stale.status, 409);
    assert.equal(stale.data.code, 'conflict');
    assert.equal(stale.data.revision, 1);

    // The same project shows up for the browser session.
    const browser = await call('/api/' + collection, { cookie });
    assert.ok(browser.data[collection].some(p => p.id === id && p.name === 'Renamed'));
  }
  // Bearer requests still pass the shared API rate limiter.
  const limited = await bearer('/api/projects', ro);
  assert.ok(limited.res.headers.get('ratelimit') || limited.res.headers.get('ratelimit-policy'), 'rate-limit headers present');
});

test('tokens are refused everywhere outside the document APIs', async () => {
  const cookie = await newUser();
  const token = (await makeToken(cookie, ['read', 'write'])).token;
  const refused = [
    ['GET', '/api/account'], ['GET', '/api/account/tokens'], ['POST', '/api/account/tokens'],
    ['DELETE', '/api/account'], ['POST', '/api/account/password'], ['GET', '/api/account/export'],
    ['GET', '/API/Account/Tokens'], ['POST', '/api/auth/logout'], ['POST', '/api/auth/login'],
    ['GET', '/api/auth/config'], ['POST', '/api/auth/me'], ['GET', '/api/auth/me/../../account'],
  ];
  for (const [method, url] of refused) {
    const r = await bearer(url, token, { method, body: method === 'GET' ? undefined : { name: 'x', scopes: ['read'], currentPassword: PASSWORD } });
    assert.equal(r.status, 403, method + ' ' + url + ' ' + r.status);
  }
  // A token is not a page session: pages still redirect to sign-in.
  for (const page of ['/account', '/sigma/editor/abc', '/pigment/app']) {
    assert.equal((await bearer(page, token)).status, 302, page);
  }
  // A token plus a session cookie still cannot reach account routes.
  const both = await fetch(base + '/api/account/tokens', { headers: { Authorization: 'Bearer ' + token, Cookie: cookie, 'X-Requested-With': 'test' } });
  assert.equal(both.status, 403);
  assert.equal(db.tokens.filter(t => t.userId === db.users.at(-1).id).length, 1, 'no token was minted with a token');
});

test('bad, revoked, expired and foreign tokens fail; other auth schemes are ignored', async () => {
  const cookieA = await newUser();
  const cookieB = await newUser();
  const a = await makeToken(cookieA);
  const b = await makeToken(cookieB);
  const projectB = (await bearer('/api/projects', b.token, { method: 'POST', body: { name: 'B only' } })).data.project.id;
  assert.equal((await bearer('/api/projects/' + projectB, a.token)).status, 404, 'tokens are bound to their owner');
  assert.equal((await bearer('/api/projects/' + projectB, a.token, { method: 'DELETE' })).status, 404);

  for (const bad of ['', 'tkp_short', a.token + 'x', 'tkp_' + 'A'.repeat(43), a.token.toUpperCase()]) {
    const r = await bearer('/api/projects', bad);
    assert.equal(r.status, 401, JSON.stringify(bad));
    assert.match(r.res.headers.get('www-authenticate') || '', /Bearer/);
  }
  // A Basic header (for example from a proxy) is not a token: the normal session rules apply.
  const basic = await fetch(base + '/api/projects', { headers: { Authorization: 'Basic dXNlcjpwYXNz', Cookie: cookieA } });
  assert.equal(basic.status, 200);
  // Without the CSRF header, a cookie-authenticated write is still refused.
  assert.equal((await fetch(base + '/api/projects', { method: 'POST', headers: { Cookie: cookieA, 'Content-Type': 'application/json' }, body: '{"name":"x"}' })).status, 403);

  const record = db.tokens.find(t => t.id === a.record.id);
  record.expiresAt = Date.now() - 1000;
  const expired = await bearer('/api/projects', a.token);
  assert.equal(expired.status, 401);
  assert.equal(expired.data.code, 'token_expired');
  record.expiresAt = null;
  assert.equal((await bearer('/api/projects', a.token)).status, 200);

  assert.equal((await call('/api/account/tokens/' + a.record.id, { method: 'DELETE', cookie: cookieB })).status, 404, 'cannot revoke another account\'s token');
  assert.equal((await call('/api/account/tokens/' + a.record.id, { method: 'DELETE', cookie: cookieA })).status, 200);
  assert.equal((await bearer('/api/projects', a.token)).status, 401, 'revoked immediately');
  assert.ok(auditEntries().some(e => e.event === 'token.revoke' && e.detail.tokenId === a.record.id));
});

test('every token use is audited, without the secret', async () => {
  const cookie = await newUser();
  const made = await makeToken(cookie);
  await bearer('/api/projects', made.token);
  await bearer('/api/paintings', made.token, { method: 'POST', body: { name: 'Audited' } });
  await new Promise(r => setTimeout(r, 50));
  const uses = auditEntries().filter(e => e.event === 'token.use' && e.detail.tokenId === made.record.id);
  assert.equal(uses.length, 2);
  assert.deepEqual(uses.map(u => [u.detail.method, u.detail.path, u.detail.status]), [['GET', '/api/projects', 200], ['POST', '/api/paintings', 201]]);
  const all = fs.readdirSync(audit.AUDIT_DIR).map(f => fs.readFileSync(path.join(audit.AUDIT_DIR, f), 'utf8')).join('');
  assert.equal(all.includes(made.token), false);
  assert.equal(audit.verify().ok, true, 'the audit chain stays intact');
  assert.ok(db.tokens.find(t => t.id === made.record.id).lastUsedAt > 0);
});

test('the export lists token names but no secrets, and deleting the account removes its tokens', async () => {
  const cookie = await newUser();
  const made = await makeToken(cookie);
  const exp = await call('/api/account/export', { cookie });
  assert.equal(exp.status, 200);
  assert.equal(exp.data.accessTokens.length, 1);
  assert.equal(exp.data.accessTokens[0].name, 'MCP');
  const text = JSON.stringify(exp.data);
  assert.equal(text.includes(made.token), false);
  assert.equal(text.includes(db.tokens.find(t => t.id === made.record.id).hash), false);
  const del = await call('/api/account', { method: 'DELETE', cookie, body: { confirm: 'DELETE', currentPassword: PASSWORD } });
  assert.equal(del.status, 200);
  assert.equal(db.tokens.some(t => t.id === made.record.id), false);
  assert.equal((await bearer('/api/projects', made.token)).status, 401);
});

test('the per-account token limit holds', async () => {
  const cookie = await newUser();
  const { MAX_TOKENS_PER_USER } = require('../server/tokens');
  for (let i = 0; i < MAX_TOKENS_PER_USER; i++) await makeToken(cookie, ['read']);
  resetSensitive();
  const over = await call('/api/account/tokens', { method: 'POST', cookie, body: { name: 'one more', scopes: ['read'], currentPassword: PASSWORD } });
  assert.equal(over.status, 400);
  assert.match(over.data.error, /at most/);
});
