// "Continue with Google": OpenID Connect authorization-code flow, done entirely on the
// server, so the strict Content-Security-Policy needs no third-party scripts or frames.
//
//   GET /api/auth/google/start     -> 302 to Google (state + nonce + PKCE S256)
//   GET /api/auth/google/callback  <- Google sends the person back with a one-time code
//
// Keys come from toolkit/.env (git-ignored): GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
// The ID token is accepted only when its RS256 signature matches one of Google's
// published keys and its issuer, audience, expiry, nonce and email_verified all check out.
//
// Account rules:
//   - A Google account is matched by its stable subject id ("sub"), then by verified email.
//   - Linking to an existing, confirmed email/password account keeps that password.
//   - Linking to a pending sign-up that never confirmed its email DISCARDS the pending
//     password: whoever chose it never proved they own the mailbox (pre-hijack defence).
const express = require('express');
const crypto = require('crypto');
const { db, save } = require('./store');
const {
  createSession, currentSessionKey, recordLoginSuccess, oauthLimiter, parseCookies, addCookie,
  safeNextPath, IS_PROD, HOSTED,
} = require('./security');
const { normalizeEmail } = require('./email-check');
const { cleanName } = require('./validation');
const { audit, tag } = require('./audit');
const { PRIVACY_VERSION } = require('./policy');
const mfa = require('./mfa');

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const CALLBACK_PATH = '/api/auth/google/callback';
const STATE_COOKIE = IS_PROD ? '__Host-toolkit_oauth' : 'toolkit_oauth';
const STATE_TTL = 10 * 60 * 1000;
const MAX_PENDING = 500;
const HTTP_TIMEOUT = 10000;
const SKEW_S = 120;

let httpFetch = (...args) => fetch(...args);
// Tests replace Google's endpoints with a fake.
function setFetch(fn) { httpFetch = fn; jwks = { keys: [], until: 0, fetchedAt: 0 }; }

const clientId = () => (process.env.GOOGLE_CLIENT_ID || '').trim();
const clientSecret = () => (process.env.GOOGLE_CLIENT_SECRET || '').trim();
function configured() { return !!(clientId() && clientSecret()); }

// ---------- pending sign-ins (memory only; a restart simply asks the person to retry) ----------
const pending = new Map();
function remember(state, value) {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
  while (pending.size >= MAX_PENDING) pending.delete(pending.keys().next().value);
  pending.set(state, value);
}

const b64url = buf => Buffer.from(buf).toString('base64url');
const random = () => b64url(crypto.randomBytes(32));
function sameString(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function stateCookie(value, maxAge) {
  // SameSite=Lax (not Strict): Google returns the person with a cross-site top-level
  // navigation, and a Strict cookie would not be sent on it.
  return `${STATE_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${IS_PROD ? '; Secure' : ''}`;
}

// The redirect URI must match one registered in Google Cloud Console exactly. Locally it
// follows the address the browser used (127.0.0.1 or localhost): the loopback server
// already refuses any other Host header, and Google refuses unregistered URIs anyway.
function redirectUri(req) {
  const fixed = (process.env.GOOGLE_REDIRECT_URI || '').trim();
  if (fixed) return fixed;
  if (HOSTED && process.env.TOOLKIT_PUBLIC_URL) return process.env.TOOLKIT_PUBLIC_URL.replace(/\/+$/, '') + CALLBACK_PATH;
  const host = String(req.headers.host || '');
  if (/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/.test(host)) return `http://${host}${CALLBACK_PATH}`;
  return null;
}

// Sends the browser on with a tiny same-origin page instead of a 302. The session cookie
// is SameSite=Strict, and a redirect chain that began on accounts.google.com would not
// carry it; a navigation started by this page does.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function finish(res, path, message = 'Signing you in') {
  const target = esc(path);
  res.status(200).type('html').send('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer">'
    + `<meta http-equiv="refresh" content="0;url=${target}"><title>${esc(message)} - Toolkit</title>`
    + '<link rel="stylesheet" href="/css/toolkit.css"></head><body><main class="center-page"><div>'
    + `<p>${esc(message)}...</p><p><a class="btn" href="${target}">Continue</a></p></div></main></body></html>`);
}
function fail(res, code, next) {
  const back = next && next !== '/' ? '&next=' + encodeURIComponent(next) : '';
  finish(res, `/auth?google=${code}${back}`, 'Returning to sign-in');
}

// ---------- Google's signing keys ----------
let jwks = { keys: [], until: 0, fetchedAt: 0 };
async function signingKey(kid) {
  const now = Date.now();
  let key = now < jwks.until ? jwks.keys.find(k => k.kid === kid) : null;
  // Refetch when the cache expired, or when an unknown key id appears (Google rotated),
  // but never more than once every 30 seconds.
  if (!key && now - jwks.fetchedAt > 30000) {
    const r = await httpFetch(CERTS_URL, { signal: AbortSignal.timeout(HTTP_TIMEOUT) });
    if (!r.ok) throw new Error('google certs ' + r.status);
    const body = await r.json();
    const maxAge = Number((/max-age=(\d+)/.exec(r.headers.get('cache-control') || '') || [])[1]) || 3600;
    jwks = { keys: Array.isArray(body.keys) ? body.keys : [], until: now + Math.min(maxAge, 86400) * 1000, fetchedAt: now };
    key = jwks.keys.find(k => k.kid === kid);
  }
  if (!key || key.kty !== 'RSA') throw new Error('unknown signing key');
  return crypto.createPublicKey({ key: { kty: 'RSA', n: key.n, e: key.e }, format: 'jwk' });
}

async function verifyIdToken(idToken, nonce) {
  const parts = typeof idToken === 'string' ? idToken.split('.') : [];
  if (parts.length !== 3 || idToken.length > 8192) throw new Error('malformed id token');
  const json = s => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
  const header = json(parts[0]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('unexpected token algorithm');
  const key = await signingKey(header.kid);
  const signed = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, Buffer.from(parts[2], 'base64url'));
  if (!signed) throw new Error('bad token signature');
  const c = json(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!ISSUERS.has(c.iss)) throw new Error('wrong issuer');
  if (!aud.includes(clientId()) || (aud.length > 1 && c.azp !== clientId())) throw new Error('wrong audience');
  if (!(Number(c.exp) > now - SKEW_S) || Number(c.iat) > now + SKEW_S) throw new Error('token expired');
  if (typeof c.nonce !== 'string' || !sameString(c.nonce, nonce)) throw new Error('nonce mismatch');
  if (typeof c.sub !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(c.sub)) throw new Error('bad subject');
  return c;
}

async function exchangeCode(code, verifier, redirect) {
  const r = await httpFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      code, client_id: clientId(), client_secret: clientSecret(), redirect_uri: redirect,
      grant_type: 'authorization_code', code_verifier: verifier,
    }).toString(),
    signal: AbortSignal.timeout(HTTP_TIMEOUT),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || typeof body.id_token !== 'string') throw new Error('token exchange failed (' + r.status + ')');
  return body.id_token;
}

// ---------- account matching ----------
function accountFor(claims, email, req) {
  const now = Date.now();
  const name = cleanName(String(claims.name || claims.given_name || email.split('@')[0]).trim().slice(0, 60), 60) || 'Toolkit user';
  const bySub = db.users.find(u => u.googleSub === claims.sub);
  if (bySub) return { user: bySub, created: false };
  const byEmail = db.users.find(u => u.email === email);
  if (byEmail) {
    // A different Google account is already linked to this address.
    if (byEmail.googleSub) return { error: 'conflict' };
    if (byEmail.emailVerified === false) {
      byEmail.passwordHash = null;              // chosen by someone who never proved mailbox ownership
      delete byEmail.verify;
      byEmail.name = name;
      byEmail.consent = { at: now, version: PRIVACY_VERSION, method: 'google' };
      audit('google.claim-pending', { req, userId: byEmail.id });
    }
    byEmail.googleSub = claims.sub;
    byEmail.emailVerified = true;
    save();
    audit('google.link', { req, userId: byEmail.id });
    return { user: byEmail, created: false };
  }
  const user = {
    id: crypto.randomUUID(), name, email, passwordHash: null, googleSub: claims.sub,
    createdAt: now, failedLogins: 0, lockedUntil: 0,
    consent: { at: now, version: PRIVACY_VERSION, method: 'google' },
    emailVerified: true,
  };
  db.users.push(user);
  save();
  audit('register', { req, userId: user.id, detail: { method: 'google' } });
  return { user, created: true };
}

// ---------- desktop app handoff ----------
// Google refuses sign-in inside embedded browsers such as the desktop app's window, so the
// desktop app (desktop/main.cjs) does this instead:
//   1. its window opens  /desktop/begin?id=I&secret=S  (both random, made by the app)
//   2. it opens  /start?handoff=I  in the person's normal web browser (never the secret)
//   3. that browser goes through Google; the callback records the result against I
//   4. the window, waiting on  /desktop/wait?id=I&secret=S , claims the session.
// Only the app knows S, so finishing a Google sign-in in a browser never hands a session
// to anyone else. Loopback (local) Toolkit only: on a hosted server someone could send a
// victim a start link for a handoff the attacker is waiting on.
const HANDOFF_TTL = 10 * 60 * 1000;
const MAX_HANDOFFS = 200;
const handoffs = new Map();     // id -> { secretHash, next, intent, userId, priorKey, expires, result }
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
function liveHandoff(id) {
  const h = typeof id === 'string' && TOKEN.test(id) ? handoffs.get(id) : null;
  if (h && h.expires < Date.now()) { handoffs.delete(id); return null; }
  return h || null;
}

const BROWSER_MESSAGES = {
  cancelled: 'Google sign-in was cancelled. Go back to the Toolkit app to try again.',
  unverified: 'Your Google account email address is not verified, so it cannot be used for Toolkit.',
  conflict: 'That email address is already linked to a different Google account.',
  wrong_account: 'You picked a different Google account from the one signed in to the Toolkit app.',
  expired: 'This sign-in link has expired or was already used. Start again from the Toolkit app.',
};
// The page the person's web browser ends on in a desktop sign-in. It never signs this browser in.
function browserPage(res, code) {
  const title = code ? 'Google sign-in did not complete' : 'Signed in to Toolkit';
  const text = code ? (BROWSER_MESSAGES[code] || 'Something went wrong. Go back to the Toolkit app and try again.')
    : 'You can close this tab and go back to the Toolkit app. It continues on its own.';
  res.status(200).type('html').send('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer">'
    + `<title>${esc(title)} - Toolkit</title><link rel="stylesheet" href="/css/toolkit.css"></head>`
    + `<body><main class="center-page"><div><h2>${esc(title)}</h2><p>${esc(text)}</p></div></main></body></html>`);
}

// Accounts with two-step sign-in get a challenge cookie instead of a session; the sign-in
// page then asks for the authenticator code (POST /api/auth/mfa/verify).
function challenge(req, res, user, priorKey, next) {
  mfa.startChallenge(res, user.id, 'google', priorKey);
  audit('login.mfa-challenge', { req, userId: user.id, detail: { method: 'google' } });
  finish(res, '/auth?mfa=1' + (next !== '/' ? '&next=' + encodeURIComponent(next) : ''), 'Continuing to two-step sign-in');
}
// With TOOLKIT_REQUIRE_MFA=1 a session that must still set up two-step sign-in goes straight to the account page.
const afterSignIn = (sessionKey, next) => (db.sessions[sessionKey] && db.sessions[sessionKey].mfaSetup ? '/account?setup-mfa=1' : next);

// ---------- routes ----------
const router = express.Router();
router.use(oauthLimiter);

router.get('/desktop/begin', (req, res) => {
  const next = safeNextPath(req.query.next);
  if (HOSTED) return fail(res, 'desktop_unavailable', next);
  if (!configured()) return fail(res, 'disabled', next);
  const { id, secret } = req.query;
  if (typeof id !== 'string' || typeof secret !== 'string' || !TOKEN.test(id) || !TOKEN.test(secret) || handoffs.has(id)) {
    return fail(res, 'expired', next);
  }
  const intent = req.query.intent === 'reauth' ? 'reauth' : 'signin';
  const sessionKey = currentSessionKey(req);
  const signedIn = sessionKey && db.sessions[sessionKey] ? db.sessions[sessionKey].userId : null;
  if (intent === 'reauth' && !signedIn) return fail(res, 'expired', next);
  const now = Date.now();
  for (const [k, v] of handoffs) if (v.expires < now) handoffs.delete(k);
  while (handoffs.size >= MAX_HANDOFFS) handoffs.delete(handoffs.keys().next().value);
  handoffs.set(id, { secretHash: sha(secret), next, intent, userId: signedIn, priorKey: sessionKey, expires: now + HANDOFF_TTL, result: null });
  res.redirect(`/api/auth/google/desktop/wait?id=${id}&secret=${secret}`);
});

router.get('/desktop/wait', (req, res) => {
  const h = liveHandoff(req.query.id);
  if (!h || typeof req.query.secret !== 'string' || !sameString(sha(req.query.secret), h.secretHash)) {
    return fail(res, 'expired', h ? h.next : '/');
  }
  if (!h.result) {
    const self = esc(`/api/auth/google/desktop/wait?id=${req.query.id}&secret=${req.query.secret}`);
    const again = esc(`/api/auth/google/start?handoff=${req.query.id}`);
    const cancel = esc('/auth' + (h.next !== '/' ? '?next=' + encodeURIComponent(h.next) : ''));
    return res.status(200).type('html').send('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer">'
      + `<meta http-equiv="refresh" content="2;url=${self}"><title>Waiting for Google - Toolkit</title>`
      + '<link rel="stylesheet" href="/css/toolkit.css"></head><body><main class="center-page"><div>'
      + '<h2>Finish signing in with Google in your web browser</h2>'
      + '<p>A browser tab opened for Google sign-in. Once you finish there, Toolkit continues here on its own.</p>'
      + `<p><a class="btn" href="${again}">Open the browser again</a> <a class="btn btn-ghost" href="${cancel}">Cancel</a></p>`
      + '</div></main></body></html>');
  }
  handoffs.delete(req.query.id);
  if (h.result.error) return fail(res, h.result.error, h.next);
  const user = db.users.find(u => u.id === h.result.userId);
  if (!user) return fail(res, 'failed', h.next);
  if (user.mfa && user.mfa.enabled) return challenge(req, res, user, h.priorKey, h.next);
  if (h.priorKey && db.sessions[h.priorKey]) { delete db.sessions[h.priorKey]; save(); }
  recordLoginSuccess(user);
  const key = createSession(res, user.id, req, { method: 'google' });
  audit(h.result.created ? 'login.google.new' : 'login.google', { req, userId: user.id, detail: { client: 'desktop' } });
  finish(res, afterSignIn(key, h.next));
});

router.get('/start', (req, res) => {
  let handoffId = null, handoff = null;
  if (req.query.handoff !== undefined) {
    handoff = !HOSTED ? liveHandoff(req.query.handoff) : null;
    if (!handoff || handoff.result) return browserPage(res, 'expired');
    handoffId = req.query.handoff;
  }
  const next = handoff ? handoff.next : safeNextPath(req.query.next);
  if (!configured()) return fail(res, 'disabled', next);
  const redirect = redirectUri(req);
  if (!redirect) return fail(res, 'disabled', next);
  // With a fixed redirect URI on another loopback name, hop there first so the state
  // cookie lives on the same host Google returns to.
  const here = `http://${req.headers.host}`;
  const target = new URL(redirect);
  if (!HOSTED && target.origin !== here && /^(?:127\.0\.0\.1|localhost|\[::1\])$/.test(target.hostname)) {
    return res.redirect(target.origin + req.originalUrl);
  }
  const state = random(), nonce = random(), verifier = random();
  let intent, sessionKey, signedIn;
  if (handoff) {
    // The desktop app's own session is known from /desktop/begin; this browser has none.
    ({ intent, priorKey: sessionKey, userId: signedIn } = handoff);
  } else {
    intent = req.query.intent === 'reauth' ? 'reauth' : 'signin';
    sessionKey = currentSessionKey(req);
    signedIn = sessionKey && db.sessions[sessionKey] ? db.sessions[sessionKey].userId : null;
    if (intent === 'reauth' && !signedIn) return fail(res, 'expired', next);
  }
  remember(state, { nonce, verifier, next, intent, redirect, priorKey: sessionKey, userId: signedIn, handoff: handoffId, expires: Date.now() + STATE_TTL });
  const params = new URLSearchParams({
    client_id: clientId(), redirect_uri: redirect, response_type: 'code', scope: 'openid email profile',
    state, nonce, code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256', prompt: 'select_account',
  });
  if (intent === 'reauth') {
    const me = db.users.find(u => u.id === signedIn);
    if (me) params.set('login_hint', me.email);
  }
  addCookie(res, stateCookie(state, Math.floor(STATE_TTL / 1000)));
  res.redirect(AUTH_URL + '?' + params.toString());
});

router.get('/callback', async (req, res, next) => {
  try {
    addCookie(res, stateCookie('', 0));                       // single use, whatever happens
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const entry = /^[A-Za-z0-9_-]{43}$/.test(state) ? pending.get(state) : null;
    if (entry) pending.delete(state);
    const back = entry ? entry.next : '/';
    const cookie = parseCookies(req)[STATE_COOKIE] || '';
    // The state must match the cookie set on THIS browser: this blocks login CSRF (an
    // attacker cannot finish their own Google sign-in inside someone else's browser).
    if (!entry || entry.expires < Date.now() || !sameString(cookie, state)) {
      audit('google.fail', { req, detail: { reason: 'state' }, throttleKey: 'gs:' + (req.ip || ''), throttleMs: 5000 });
      return fail(res, 'expired', back);
    }
    const outcome = await resolveSignIn(req, entry);
    if (entry.handoff) {
      // A desktop-app sign-in: record the result for the app to claim; this browser stays signed out.
      const h = liveHandoff(entry.handoff);
      if (!h || h.result) return browserPage(res, 'expired');
      h.result = outcome.error ? { error: outcome.error } : { userId: outcome.user.id, created: outcome.created };
      return browserPage(res, outcome.error || null);
    }
    if (outcome.error) return fail(res, outcome.error, back);
    const { user } = outcome;
    if (user.mfa && user.mfa.enabled) return challenge(req, res, user, entry.priorKey, entry.next);
    // A fresh session id on every sign-in (fixation defence); the session that started
    // this sign-in, if any, is retired.
    if (entry.priorKey && db.sessions[entry.priorKey]) { delete db.sessions[entry.priorKey]; save(); }
    recordLoginSuccess(user);
    const key = createSession(res, user.id, req, { method: 'google' });
    audit(outcome.created ? 'login.google.new' : 'login.google', { req, userId: user.id });
    finish(res, afterSignIn(key, entry.next));
  } catch (err) { next(err); }
});

// Turns Google's answer into { user, created } or { error: code }.
async function resolveSignIn(req, entry) {
  if (req.query.error) {
    audit('google.cancel', { req, userId: entry.userId, detail: { error: String(req.query.error).slice(0, 40) } });
    return { error: req.query.error === 'access_denied' ? 'cancelled' : 'failed' };
  }
  const code = typeof req.query.code === 'string' && req.query.code.length <= 2048 ? req.query.code : '';
  if (!code || !configured()) return { error: 'failed' };
  let claims;
  try {
    claims = await verifyIdToken(await exchangeCode(code, entry.verifier, entry.redirect), entry.nonce);
  } catch (err) {
    audit('google.fail', { req, userId: entry.userId, detail: { reason: String(err && err.message).slice(0, 80) } });
    return { error: 'failed' };
  }
  if (claims.email_verified !== true && claims.email_verified !== 'true') return { error: 'unverified' };
  const parsed = normalizeEmail(claims.email);
  if (!parsed.ok) return { error: 'failed' };
  if (entry.intent === 'reauth') {
    // Re-confirming identity: only the Google account already linked to the signed-in
    // account counts, and nothing is created or linked here.
    const me = db.users.find(u => u.id === entry.userId);
    if (!me || me.googleSub !== claims.sub) {
      audit('google.fail', { req, userId: entry.userId, detail: { reason: 'wrong-account' } });
      return { error: 'wrong_account' };
    }
    return { user: me, created: false };
  }
  const found = accountFor(claims, parsed.email, req);
  if (found.error) audit('google.fail', { req, detail: { reason: found.error, email: tag(parsed.email) } });
  return found;
}

module.exports = { router, configured, setFetch, verifyIdToken, CALLBACK_PATH, STATE_COOKIE };
