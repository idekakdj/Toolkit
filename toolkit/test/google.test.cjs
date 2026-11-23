// Google sign-in (OpenID Connect) against a fake Google: tokens are signed with a test RSA
// key and every request to Google is answered locally, so nothing leaves this machine.
// Uses an isolated temporary data directory; never touches real accounts.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-google-'));
const CLIENT = 'test-client.apps.googleusercontent.com';
process.env.TOOLKIT_DATA_DIR = temp;
process.env.TOOLKIT_EMAIL_DNS_CHECK = 'off';
process.env.TOOLKIT_EMAIL_VERIFICATION = 'off';
process.env.GOOGLE_CLIENT_ID = CLIENT;
process.env.GOOGLE_CLIENT_SECRET = 'test-secret-value';
delete process.env.GOOGLE_REDIRECT_URI;
const app = require('../server/index');
const sec = require('../server/security');
const google = require('../server/google');
const { db } = require('../server/store');
const { LOGIN_FAILED } = require('../server/auth');

// ---------- fake Google ----------
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const rogueKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const issued = new Map();          // authorization code -> { challenge, nonce, claims, key }
const tokenRequests = [];
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
function sign(claims, key = privateKey, kid = 'test-key') {
  const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'RS256', kid, typ: 'JWT' });
  const body = enc(claims);
  return `${head}.${body}.${crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), key).toString('base64url')}`;
}
google.setFetch(async (url, options = {}) => {
  if (url === 'https://www.googleapis.com/oauth2/v3/certs') return json({ keys: [jwk] }, 200, { 'cache-control': 'public, max-age=3600' });
  if (url === 'https://oauth2.googleapis.com/token') {
    const form = new URLSearchParams(options.body);
    tokenRequests.push(form);
    const grant = issued.get(form.get('code'));
    issued.delete(form.get('code'));                                   // codes are single use
    if (!grant || form.get('client_secret') !== 'test-secret-value') return json({ error: 'invalid_grant' }, 400);
    // PKCE: the verifier must hash to the challenge sent when the sign-in started.
    if (crypto.createHash('sha256').update(form.get('code_verifier') || '').digest('base64url') !== grant.challenge) return json({ error: 'invalid_grant' }, 400);
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: 'https://accounts.google.com', aud: CLIENT, azp: CLIENT, sub: '1001', email: 'pat@gmail.com',
      email_verified: true, name: 'Pat Example', iat: now, exp: now + 3600, nonce: grant.nonce, ...grant.claims };
    return json({ id_token: sign(claims, grant.key), access_token: 'unused', token_type: 'Bearer' });
  }
  throw new Error('unexpected request to ' + url);
});

let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(r => server.close(r)); fs.rmSync(temp, { recursive: true, force: true }); });

function resetLimits() {
  for (const l of [sec.oauthLimiter, sec.loginLimiter, sec.registerLimiter, sec.authLimiter, sec.sensitiveLimiter, sec.apiLimiter, sec.writeLimiter]) l.resetKey('127.0.0.1');
}
async function call(url, { method = 'GET', body, cookie } = {}) {
  resetLimits();
  const headers = { 'X-Requested-With': 'test' };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers, redirect: 'manual', body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; try { data = await res.clone().json(); } catch { /* not JSON */ }
  const set = res.headers.getSetCookie().find(c => c.startsWith('toolkit_session=') && !c.startsWith('toolkit_session=;'));
  return { res, status: res.status, data, cookie: set ? set.split(';')[0] : null };
}
const sessionKey = cookie => crypto.createHash('sha256').update(cookie.split('=')[1]).digest('hex');

async function start({ cookie, query = '' } = {}) {
  resetLimits();
  const res = await fetch(base + '/api/auth/google/start' + query, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
  const raw = res.headers.getSetCookie().find(c => c.startsWith(google.STATE_COOKIE + '=')) || null;
  const location = res.headers.get('location');
  return { res, raw, stateCookie: raw ? raw.split(';')[0] : null, url: location ? new URL(location) : null };
}
// Runs a whole "Continue with Google" round trip. Options tamper with each stage.
async function googleSignIn({ claims = {}, key = privateKey, cookie, query = '', sendStateCookie = true, stateOverride } = {}) {
  const s = await start({ cookie, query });
  assert.equal(s.res.status, 302, 'start redirects to Google');
  const p = s.url.searchParams;
  const code = 'code-' + crypto.randomUUID();
  issued.set(code, { challenge: p.get('code_challenge'), nonce: p.get('nonce'), claims, key });
  resetLimits();
  const cookies = [sendStateCookie && s.stateCookie, cookie].filter(Boolean).join('; ');
  const cb = await fetch(`${base}/api/auth/google/callback?state=${stateOverride || p.get('state')}&code=${code}`,
    { redirect: 'manual', headers: cookies ? { Cookie: cookies } : {} });
  const html = await cb.text();
  const target = (/content="0;url=([^"]+)"/.exec(html) || [])[1];
  const session = cb.headers.getSetCookie().find(c => c.startsWith('toolkit_session=') && !c.startsWith('toolkit_session=;'));
  return { cb, html, target: target && target.replace(/&amp;/g, '&'), cookie: session ? session.split(';')[0] : null, state: p.get('state'), stateCookie: s.stateCookie };
}

// ---------------------------------------------------------------- tests
test('the sign-in page is told Google is available; start sends the browser to Google with PKCE, state and nonce', async () => {
  assert.equal((await call('/api/auth/config')).data.googleEnabled, true);
  const s = await start({ query: '?next=' + encodeURIComponent('/sigma/dashboard') });
  assert.equal(s.res.status, 302);
  assert.equal(s.url.origin + s.url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  const p = s.url.searchParams;
  assert.equal(p.get('client_id'), CLIENT);
  assert.equal(p.get('redirect_uri'), base + '/api/auth/google/callback', 'redirect follows the loopback address in use');
  assert.equal(p.get('response_type'), 'code');
  assert.deepEqual(p.get('scope').split(' ').sort(), ['email', 'openid', 'profile']);
  assert.equal(p.get('code_challenge_method'), 'S256');
  assert.match(p.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.match(p.get('state'), /^[A-Za-z0-9_-]{43}$/);
  assert.match(p.get('nonce'), /^[A-Za-z0-9_-]{43}$/);
  assert.ok(!s.url.href.includes('test-secret-value'), 'the client secret never goes to the browser');
  assert.match(s.raw, /HttpOnly/);
  assert.match(s.raw, /SameSite=Lax/, 'Lax so the cross-site return from Google carries it');
  assert.equal(s.stateCookie, `${google.STATE_COOKIE}=${p.get('state')}`);
});

test('a new Google account is created verified, without a password, and signed in', async () => {
  const before = tokenRequests.length;
  const r = await googleSignIn({ query: '?next=' + encodeURIComponent('/pigment/app') });
  assert.equal(r.cb.status, 200);
  assert.equal(r.target, '/pigment/app', 'returns to the page the person was heading for');
  assert.ok(r.cookie, 'a session cookie is set');
  const sent = tokenRequests[before];
  assert.equal(sent.get('grant_type'), 'authorization_code');
  assert.equal(sent.get('redirect_uri'), base + '/api/auth/google/callback');
  assert.ok(sent.get('code_verifier'));
  const me = await call('/api/auth/me', { cookie: r.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, 'pat@gmail.com');
  assert.equal(me.data.user.name, 'Pat Example');
  const user = db.users.find(u => u.email === 'pat@gmail.com');
  assert.equal(user.passwordHash, null);
  assert.equal(user.googleSub, '1001');
  assert.equal(user.emailVerified, true);
  assert.equal(user.consent.method, 'google');
  assert.equal(db.sessions[sessionKey(r.cookie)].method, 'google');
  // Signing in again finds the same account by its Google id.
  const again = await googleSignIn();
  assert.equal(again.target, '/');
  assert.equal(db.users.filter(u => u.googleSub === '1001').length, 1);
});

test('unsafe return paths are replaced with the home page', async () => {
  const r = await googleSignIn({ query: '?next=' + encodeURIComponent('//evil.example/steal') });
  assert.equal(r.target, '/');
});

test('login CSRF and replays are refused: the state must match this browser and is single use', async () => {
  const noCookie = await googleSignIn({ sendStateCookie: false });
  assert.equal(noCookie.cookie, null);
  assert.equal(noCookie.target, '/auth?google=expired');
  const forged = await googleSignIn({ stateOverride: 'A'.repeat(43) });
  assert.equal(forged.cookie, null);
  assert.equal(forged.target, '/auth?google=expired');
  // Replaying a used state (even with its cookie) does not sign in again.
  const ok = await googleSignIn();
  assert.ok(ok.cookie);
  resetLimits();
  const replay = await fetch(`${base}/api/auth/google/callback?state=${ok.state}&code=anything`, { redirect: 'manual', headers: { Cookie: ok.stateCookie } });
  assert.match(await replay.text(), /google=expired/);
  assert.ok(!replay.headers.getSetCookie().some(c => c.startsWith('toolkit_session=') && !c.startsWith('toolkit_session=;')));
});

test('ID tokens are checked: signature, audience, issuer, nonce, expiry and verified email', async () => {
  const now = Math.floor(Date.now() / 1000);
  const cases = [
    [{ key: rogueKey }, 'failed', 'signed by someone else'],
    [{ claims: { aud: 'another-app.apps.googleusercontent.com', azp: 'another-app.apps.googleusercontent.com' } }, 'failed', 'issued to another app'],
    [{ claims: { iss: 'https://evil.example' } }, 'failed', 'wrong issuer'],
    [{ claims: { nonce: 'not-the-nonce' } }, 'failed', 'nonce mismatch'],
    [{ claims: { exp: now - 3600, iat: now - 7200 } }, 'failed', 'expired'],
    [{ claims: { email_verified: false, sub: '4004', email: 'unverified@gmail.com' } }, 'unverified', 'unverified email'],
  ];
  for (const [opts, code, why] of cases) {
    const r = await googleSignIn(opts);
    assert.equal(r.cookie, null, why + ': no session');
    assert.equal(r.target, '/auth?google=' + code, why);
  }
  assert.ok(!db.users.some(u => u.email === 'unverified@gmail.com'));
});

test('cancelling on Google returns to the sign-in page with a message', async () => {
  const s = await start();
  resetLimits();
  const cb = await fetch(`${base}/api/auth/google/callback?error=access_denied&state=${s.url.searchParams.get('state')}`, { redirect: 'manual', headers: { Cookie: s.stateCookie } });
  assert.match(await cb.text(), /\/auth\?google=cancelled/);
});

test('a Google-only account cannot be signed into with a password, and the server does not crash', async () => {
  const r = await call('/api/auth/login', { method: 'POST', body: { email: 'pat@gmail.com', password: 'Anything-At-All-1' } });
  assert.equal(r.status, 401);
  assert.equal(r.data.error, LOGIN_FAILED, 'same answer as any wrong password');
});

test('an existing email/password account is linked and keeps its password', async () => {
  const account = { name: 'Lin Link', email: 'lin@gmail.com', password: 'Maple-Lantern-River-77', acceptTerms: true };
  assert.equal((await call('/api/auth/register', { method: 'POST', body: account })).status, 201);
  const r = await googleSignIn({ claims: { sub: '2002', email: 'lin@gmail.com', name: 'Lin From Google' } });
  assert.ok(r.cookie);
  const user = db.users.find(u => u.email === 'lin@gmail.com');
  assert.equal(user.googleSub, '2002');
  assert.equal(user.name, 'Lin Link', 'a confirmed account keeps its own name');
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: account.email, password: account.password } })).status, 200);
  // A different Google account claiming the same address is refused.
  const other = await googleSignIn({ claims: { sub: '2999', email: 'lin@gmail.com' } });
  assert.equal(other.cookie, null);
  assert.equal(other.target, '/auth?google=conflict');
});

test('an unconfirmed sign-up taken over with Google loses the password its creator chose', async () => {
  const bcrypt = require('bcryptjs');
  db.users.push({ id: crypto.randomUUID(), name: 'Squatter', email: 'claim@gmail.com', passwordHash: bcrypt.hashSync('Squatter-Pass-99', 4),
    createdAt: Date.now(), failedLogins: 0, lockedUntil: 0, emailVerified: false, verify: { hash: 'x', expires: Date.now() + 60000 } });
  const r = await googleSignIn({ claims: { sub: '3003', email: 'claim@gmail.com', name: 'Real Owner' } });
  assert.ok(r.cookie);
  const user = db.users.find(u => u.email === 'claim@gmail.com');
  assert.equal(user.passwordHash, null, 'the squatter password is gone');
  assert.equal(user.verify, undefined);
  assert.equal(user.name, 'Real Owner');
  assert.equal(user.emailVerified, true);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'claim@gmail.com', password: 'Squatter-Pass-99' } })).status, 401);
});

test('Google-only accounts confirm sensitive actions with a recent Google sign-in, and can set a password', async () => {
  const r = await googleSignIn({ claims: { sub: '5005', email: 'sam@gmail.com', name: 'Sam' } });
  const account = await call('/api/account', { cookie: r.cookie });
  assert.equal(account.data.account.hasPassword, false);
  assert.equal(account.data.account.google, true);
  // An old session must sign in with Google again first.
  db.sessions[sessionKey(r.cookie)].createdAt = Date.now() - 11 * 60 * 1000;
  const stale = await call('/api/account/password', { method: 'POST', cookie: r.cookie, body: { newPassword: 'Fresh-Garden-42!' } });
  assert.equal(stale.status, 403);
  assert.equal(stale.data.code, 'reauth_google');
  // Re-confirming with a different Google account is refused.
  const wrong = await googleSignIn({ cookie: r.cookie, query: '?intent=reauth&next=/account', claims: { sub: '1001', email: 'pat@gmail.com' } });
  assert.equal(wrong.target, '/auth?google=wrong_account&next=%2Faccount');
  assert.ok(db.sessions[sessionKey(r.cookie)], 'a refused re-confirmation leaves the existing session alone');
  const fresh = await googleSignIn({ cookie: r.cookie, query: '?intent=reauth&next=/account', claims: { sub: '5005', email: 'sam@gmail.com' } });
  assert.equal(fresh.target, '/account');
  assert.ok(!db.sessions[sessionKey(r.cookie)], 'the session that asked to re-confirm is retired');
  // The new password still has to meet the policy.
  assert.equal((await call('/api/account/password', { method: 'POST', cookie: fresh.cookie, body: { newPassword: 'weakpassword' } })).status, 400);
  const set = await call('/api/account/password', { method: 'POST', cookie: fresh.cookie, body: { newPassword: 'Fresh-Garden-42!' } });
  assert.equal(set.status, 200);
  assert.equal(set.data.firstPassword, true);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'sam@gmail.com', password: 'Fresh-Garden-42!' } })).status, 200);
  const exported = await call('/api/account/export', { cookie: fresh.cookie });
  assert.deepEqual(exported.data.account.signInMethods, ['password', 'google']);
});

test('a Google-only account can be deleted after a fresh Google sign-in', async () => {
  const r = await googleSignIn({ claims: { sub: '6006', email: 'dee@gmail.com', name: 'Dee' } });
  assert.equal((await call('/api/account', { method: 'DELETE', cookie: r.cookie, body: { confirm: 'nope' } })).status, 400);
  const gone = await call('/api/account', { method: 'DELETE', cookie: r.cookie, body: { confirm: 'DELETE' } });
  assert.equal(gone.status, 200);
  assert.ok(!db.users.some(u => u.email === 'dee@gmail.com'));
});

test('re-confirming needs a signed-in session', async () => {
  const s = await start({ query: '?intent=reauth' });
  assert.equal(s.res.status, 200);
  assert.match(await s.res.text(), /google=expired/);
});

// ---------------------------------------------------------------- desktop app handoff
const token = () => crypto.randomBytes(32).toString('base64url');
// The desktop window's side: begin, then poll the waiting page.
async function desktopBegin({ cookie, query = '' } = {}) {
  const id = token(), secret = token();
  resetLimits();
  const r = await fetch(`${base}/api/auth/google/desktop/begin?id=${id}&secret=${secret}${query}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
  return { id, secret, res: r };
}
async function desktopWait(id, secret, cookie) {
  resetLimits();
  const r = await fetch(`${base}/api/auth/google/desktop/wait?id=${id}&secret=${secret}`, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
  const html = await r.text();
  const session = r.headers.getSetCookie().find(c => c.startsWith('toolkit_session=') && !c.startsWith('toolkit_session=;'));
  return { res: r, html, cookie: session ? session.split(';')[0] : null, target: ((/content="0;url=([^"]+)"/.exec(html) || [])[1] || '').replace(/&amp;/g, '&') };
}
// The web browser's side: start?handoff, then Google, then the callback. No cookies from the app.
async function browserGoogle(id, claims = {}) {
  return googleSignIn({ query: '?handoff=' + id, claims });
}

test('desktop app: the web browser does the Google part and the app window claims the session', async () => {
  const b = await desktopBegin({ query: '&next=' + encodeURIComponent('/sigma/dashboard') });
  assert.equal(b.res.status, 302);
  assert.equal(b.res.headers.get('location'), `/api/auth/google/desktop/wait?id=${b.id}&secret=${b.secret}`);
  const waiting = await desktopWait(b.id, b.secret);
  assert.equal(waiting.cookie, null);
  assert.match(waiting.html, /http-equiv="refresh" content="2;url=/, 'the window keeps checking');
  assert.match(waiting.html, new RegExp(`/api/auth/google/start\\?handoff=${b.id}`), 'offers to reopen the browser');
  assert.ok(!waiting.html.includes('content="0;url=/sigma'), 'not signed in yet');

  const browser = await browserGoogle(b.id, { sub: '7007', email: 'desk@gmail.com', name: 'Desk Person' });
  assert.equal(browser.cookie, null, 'the web browser is never signed in');
  assert.match(browser.html, /Signed in to Toolkit/);
  assert.match(browser.html, /go back to the Toolkit app/);
  assert.ok(!browser.html.includes(b.secret), 'the browser never learns the secret');

  const claimed = await desktopWait(b.id, b.secret);
  assert.ok(claimed.cookie, 'the app window gets the session');
  assert.equal(claimed.target, '/sigma/dashboard');
  const me = await call('/api/auth/me', { cookie: claimed.cookie });
  assert.equal(me.data.user.email, 'desk@gmail.com');
  assert.equal(db.sessions[sessionKey(claimed.cookie)].method, 'google');
  const again = await desktopWait(b.id, b.secret);
  assert.equal(again.cookie, null, 'a handoff can be claimed once');
  assert.match(again.target, /google=expired/);
});

test('desktop app: only the holder of the secret can claim, and used or unknown handoffs are refused', async () => {
  const b = await desktopBegin();
  await browserGoogle(b.id, { sub: '7007', email: 'desk@gmail.com' });
  const thief = await desktopWait(b.id, token());
  assert.equal(thief.cookie, null);
  assert.match(thief.target, /google=expired/);
  const owner = await desktopWait(b.id, b.secret);
  assert.ok(owner.cookie, 'a wrong guess does not spoil the real claim');
  // The start link cannot be reused once the sign-in finished, or for a handoff that never began.
  for (const id of [b.id, token()]) {
    resetLimits();
    const r = await fetch(`${base}/api/auth/google/start?handoff=${id}`, { redirect: 'manual' });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /expired or was already used/);
  }
  // An id cannot be registered twice (no overwriting someone else's pending sign-in).
  const first = await desktopBegin();
  resetLimits();
  const dup = await fetch(`${base}/api/auth/google/desktop/begin?id=${first.id}&secret=${token()}`, { redirect: 'manual' });
  assert.equal(dup.status, 200);
  assert.match(await dup.text(), /google=expired/);
  // Malformed ids and secrets are refused.
  resetLimits();
  const bad = await fetch(`${base}/api/auth/google/desktop/begin?id=short&secret=short`, { redirect: 'manual' });
  assert.match(await bad.text(), /google=expired/);
});

test('desktop app: Google errors reach the app window, and re-confirming uses the app\'s session', async () => {
  const b = await desktopBegin();
  const browser = await browserGoogle(b.id, { sub: '8008', email: 'nope@gmail.com', email_verified: false });
  assert.match(browser.html, /not verified/);
  const result = await desktopWait(b.id, b.secret);
  assert.equal(result.cookie, null);
  assert.equal(result.target, '/auth?google=unverified');

  // Re-confirm from the account page: the app's session is known at begin, not in the browser.
  const signIn = await desktopBegin();
  await browserGoogle(signIn.id, { sub: '9009', email: 'reauth@gmail.com' });
  const appSession = (await desktopWait(signIn.id, signIn.secret)).cookie;
  db.sessions[sessionKey(appSession)].createdAt = Date.now() - 11 * 60 * 1000;
  assert.equal((await call('/api/account/password', { method: 'POST', cookie: appSession, body: { newPassword: 'Fresh-Garden-42!' } })).data.code, 'reauth_google');
  const noSession = await desktopBegin({ query: '&intent=reauth' });
  assert.match(await noSession.res.text(), /google=expired/, 're-confirming needs the app to be signed in');
  const r = await desktopBegin({ cookie: appSession, query: '&intent=reauth&next=/account' });
  const wrong = await browserGoogle(r.id, { sub: '1001', email: 'pat@gmail.com' });
  assert.match(wrong.html, /different Google account/);
  assert.equal((await desktopWait(r.id, r.secret)).target, '/auth?google=wrong_account&next=%2Faccount');
  const ok = await desktopBegin({ cookie: appSession, query: '&intent=reauth&next=/account' });
  await browserGoogle(ok.id, { sub: '9009', email: 'reauth@gmail.com' });
  const fresh = await desktopWait(ok.id, ok.secret);
  assert.equal(fresh.target, '/account');
  assert.ok(!db.sessions[sessionKey(appSession)], 'the old app session is retired');
  assert.equal((await call('/api/account/password', { method: 'POST', cookie: fresh.cookie, body: { newPassword: 'Fresh-Garden-42!' } })).status, 200);
});

test('without keys in .env the Google button is hidden and start refuses', async () => {
  const id = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  try {
    assert.equal((await call('/api/auth/config')).data.googleEnabled, false);
    const s = await start();
    assert.equal(s.res.status, 200);
    assert.match(await s.res.text(), /google=disabled/);
  } finally { process.env.GOOGLE_CLIENT_ID = id; }
});
