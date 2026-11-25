// Security utilities for Toolkit: shared sessions across all apps,
// CSRF defence, validation, rate limits.
const crypto = require('crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { db, save } = require('./store');
const { audit } = require('./audit');
const { normalizeEmail } = require('./email-check');
const { cleanName } = require('./validation');

// Hosted mode (behind the HTTPS reverse proxy) uses stricter session lifetimes and
// the __Host- cookie prefix, which makes the cookie un-overwritable from subdomains.
const HOSTED = process.env.TOOLKIT_LOCAL_ONLY === '0';
// Shared local runtime binds only loopback. Hosted production still uses Secure.
const IS_PROD = process.env.NODE_ENV === 'production' && process.env.TOOLKIT_LOCAL_ONLY !== '1';
const SESSION_COOKIE = IS_PROD ? '__Host-toolkit_session' : 'toolkit_session';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Idle timeout resets on use; the absolute lifetime never extends. Both overridable.
const IDLE_MS = (Number(process.env.TOOLKIT_SESSION_IDLE_HOURS) || (HOSTED ? 12 : 24 * 7)) * HOUR;
const ABSOLUTE_MS = (Number(process.env.TOOLKIT_SESSION_MAX_DAYS) || (HOSTED ? 7 : 30)) * DAY;
const TOUCH_MS = 5 * 60 * 1000;          // refresh lastSeen at most this often
const MAX_SESSIONS_PER_USER = 20;

// ---------- cookies ----------
function parseCookies(req) {
  const out = Object.create(null);
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) { try { out[key] = decodeURIComponent(val); } catch { /* Ignore malformed cookies. */ } }
  }
  return out;
}

function sessionCookieAttrs(maxAgeSeconds) {
  let attrs = `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
  if (IS_PROD) attrs += '; Secure';
  return attrs;
}

// Adds a Set-Cookie header without replacing cookies already set on this response.
function addCookie(res, cookie) {
  const prev = res.getHeader('Set-Cookie');
  const list = prev === undefined ? [] : Array.isArray(prev) ? prev : [String(prev)];
  res.setHeader('Set-Cookie', [...list, cookie]);
}

// ---------- sessions (tokens hashed at rest) ----------
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sessionExpired(sess, now) {
  const created = sess.createdAt || (sess.expiresAt - 7 * DAY);   // sessions written before timeouts existed
  const last = sess.lastSeen || created;
  return now > created + ABSOLUTE_MS || now > last + IDLE_MS;
}

function currentSessionKey(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  return token && /^[0-9a-f]{64}$/.test(token) ? hashToken(token) : null;
}

// method records how this session signed in ('password', 'email-code', 'google', ...).
function createSession(res, userId, req, { method = 'password' } = {}) {
  const now = Date.now();
  // Bound the number of live sessions per account; the oldest are retired first.
  const mine = Object.keys(db.sessions).filter(k => db.sessions[k].userId === userId)
    .sort((a, b) => (db.sessions[a].createdAt || 0) - (db.sessions[b].createdAt || 0));
  while (mine.length >= MAX_SESSIONS_PER_USER) delete db.sessions[mine.shift()];
  const token = crypto.randomBytes(32).toString('hex');
  const key = hashToken(token);
  db.sessions[key] = {
    userId, createdAt: now, lastSeen: now, expiresAt: now + Math.min(IDLE_MS, ABSOLUTE_MS),
    ua: req && req.headers ? String(req.headers['user-agent'] || '').slice(0, 120) : '',
    ip: req ? (req.ip || '') : '',
    method,
  };
  // Operator policy TOOLKIT_REQUIRE_MFA=1: a session for an account without two-step
  // sign-in can only reach the pages needed to set it up (see mfaSetupPending).
  const owner = db.users.find(u => u.id === userId);
  if (process.env.TOOLKIT_REQUIRE_MFA === '1' && !(owner && owner.mfa && owner.mfa.enabled)) db.sessions[key].mfaSetup = true;
  save();
  addCookie(res, `${SESSION_COOKIE}=${token}; ${sessionCookieAttrs(Math.floor(ABSOLUTE_MS / 1000))}`);
  return key;
}

function destroySession(req, res) {
  const key = currentSessionKey(req);
  if (key && db.sessions[key]) { delete db.sessions[key]; save(); }
  addCookie(res, `${SESSION_COOKIE}=; ${sessionCookieAttrs(0)}`);
}

function getSessionUser(req) {
  const key = currentSessionKey(req);
  if (!key) return null;
  const sess = db.sessions[key];
  if (!sess) return null;
  const now = Date.now();
  if (sessionExpired(sess, now)) { delete db.sessions[key]; save(); return null; }
  const user = db.users.find(u => u.id === sess.userId);
  if (!user) { delete db.sessions[key]; save(); return null; }
  if (now - (sess.lastSeen || 0) > TOUCH_MS) {
    const created = sess.createdAt || (sess.expiresAt - 7 * DAY);
    sess.createdAt = created;
    sess.lastSeen = now;
    sess.expiresAt = Math.min(now + IDLE_MS, created + ABSOLUTE_MS);
    save();
  }
  req.sessionKey = key;
  return user;
}

// Sign a user out everywhere (optionally keeping the session making the request).
function revokeSessions(userId, exceptKey) {
  let n = 0;
  for (const k of Object.keys(db.sessions)) {
    if (db.sessions[k].userId === userId && k !== exceptKey) { delete db.sessions[k]; n++; }
  }
  if (n) save();
  return n;
}

function listSessions(userId, currentKey) {
  return Object.keys(db.sessions).filter(k => db.sessions[k].userId === userId).map(k => {
    const s = db.sessions[k];
    return {
      id: k.slice(0, 16), current: k === currentKey,
      createdAt: s.createdAt || null, lastSeen: s.lastSeen || null,
      agent: s.ua || '', ip: s.ip || '', method: s.method || 'password',
    };
  }).sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
}

function revokeSessionById(userId, id) {
  if (typeof id !== 'string' || !/^[0-9a-f]{16}$/.test(id)) return false;
  const k = Object.keys(db.sessions).find(x => x.startsWith(id) && db.sessions[x].userId === userId);
  if (!k) return false;
  delete db.sessions[k];
  save();
  return true;
}

// Periodically drop expired sessions.
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const key of Object.keys(db.sessions)) {
    if (sessionExpired(db.sessions[key], now)) { delete db.sessions[key]; changed = true; }
  }
  if (changed) save();
}, 60 * 60 * 1000).unref();

// ---------- middleware ----------
// True while the operator requires two-step sign-in and this session (created before the
// account had it) has not yet set it up. Read at request time so the setting can change.
function mfaSetupPending(req, user) {
  if (process.env.TOOLKIT_REQUIRE_MFA !== '1') return false;
  if (user && user.mfa && user.mfa.enabled) return false;
  const sess = req.sessionKey ? db.sessions[req.sessionKey] : null;
  return !!(sess && sess.mfaSetup);
}
// What a session still in the set-up-two-step state may call.
function allowedDuringMfaSetup(req) {
  const p = String(req.originalUrl || '').split('?')[0].toLowerCase().replace(/\/+$/, '');
  if (req.method === 'GET' && ['/api/auth/me', '/api/auth/config', '/api/account', '/api/account/sessions'].includes(p)) return true;
  if (req.method === 'POST' && p === '/api/auth/logout') return true;
  return p.startsWith('/api/account/mfa/');
}

function requireAuth(req, res, next) {
  // Already authenticated by a personal access token (tokens.js limits where that can happen).
  if (req.authToken && req.user) return next();
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  req.user = user;
  if (mfaSetupPending(req, user) && !allowedDuringMfaSetup(req)) {
    return res.status(403).json({ error: 'Set up two-step sign-in to continue.', code: 'mfa_setup_required' });
  }
  next();
}

// CSRF defence: SameSite=Strict cookies, a same-origin check (Origin and, where the
// browser sends it, Sec-Fetch-Site) and a required custom header on every
// state-changing request. Any non-empty header value works (browsers cannot attach
// custom headers cross-origin without CORS approval), so each app may send its own id.
function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Bearer-token requests carry no ambient credential a foreign page could ride on.
  if (req.authToken) return next();
  const fetchSite = req.headers['sec-fetch-site'];
  const origin = req.headers.origin || '';
  let blocked = false;
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') blocked = true;
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* malformed origin */ }
    if (host !== req.headers.host) blocked = true;
  }
  if (blocked) {
    audit('csrf.blocked', { req, detail: { origin: origin.slice(0, 100), fetchSite: fetchSite || null }, throttleKey: 'csrf:' + ipKey(req) });
    return res.status(403).json({ error: 'Cross-origin request blocked' });
  }
  if (!req.headers['x-requested-with']) {
    return res.status(403).json({ error: 'Missing request header' });
  }
  next();
}

// Only allow same-site relative paths as post-login destinations.
function safeNextPath(value) {
  if (typeof value !== 'string') return '/';
  if (/^\/(?!\/)[\w\-./?=&%#]*$/.test(value)) return value;
  return '/';
}

// ---------- rate limits ----------
// IPv6 addresses are limited per /64 (one subscriber), not per address, so an
// attacker with a routed /64 cannot rotate through addresses to evade limits.
function ipKey(req) {
  const ip = req.ip || (req.socket && req.socket.remoteAddress);
  return ip ? ipKeyGenerator(ip, 64) : 'unknown';
}

function limiter(name, options) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: options.key || ipKey,
    handler: (req, res, _next, info) => {
      audit('ratelimit.hit', { req, userId: req.user ? req.user.id : null, detail: { limiter: name }, throttleKey: `rl:${name}:${ipKey(req)}` });
      res.status(info.statusCode).json({ error: options.message });
    },
    ...options.config,
  });
}

const READS = ['GET', 'HEAD', 'OPTIONS'];
const apiLimiter = limiter('api', { message: 'Too many requests, slow down.', config: { windowMs: 60 * 1000, limit: 300 } });
// Writes (saves, creates, deletes) get their own, tighter bucket than reads.
const writeLimiter = limiter('write', { message: 'Too many changes too quickly, slow down.', config: { windowMs: 60 * 1000, limit: 150, skip: req => READS.includes(req.method) } });
// Generic limiter for the less sensitive auth endpoints (verify, resend, forgot).
const authLimiter = limiter('auth', { message: 'Too many attempts. Try again in a few minutes.', config: { windowMs: 15 * 60 * 1000, limit: 25 } });
// Only FAILED sign-ins count toward this one; ordinary use is never throttled.
const loginLimiter = limiter('login', { message: 'Too many sign-in attempts. Try again in a few minutes.', config: { windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true } });
// Only sign-ups that pass validation count: a person fixing a typo or a weak password is
// never locked out, while every attempt that does real work (hashing, mail) still counts.
const registerLimiter = limiter('register', { message: 'Too many sign-ups from this network. Try again later.', config: {
  windowMs: 60 * 60 * 1000, limit: 10, skipFailedRequests: true,
  requestWasSuccessful: (req, res) => res.statusCode !== 400 && res.statusCode !== 503,
} });
// Two-step verification codes: only failed attempts count.
const mfaLimiter = limiter('mfa', { message: 'Too many attempts. Try again in a few minutes.', config: { windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true } });
// Google sign-in: each attempt is two requests (start + callback).
const oauthLimiter = limiter('oauth', { message: 'Too many sign-in attempts. Try again in a few minutes.', config: { windowMs: 15 * 60 * 1000, limit: 40 } });
// Re-authenticated, high-impact actions: password change, export, deletion.
const sensitiveLimiter = limiter('sensitive', { message: 'Too many attempts. Try again in a few minutes.', key: req => (req.user ? 'u:' + req.user.id : ipKey(req)), config: { windowMs: 15 * 60 * 1000, limit: 10 } });
const pageLimiter = limiter('page', { message: 'Too many requests, slow down.', config: { windowMs: 60 * 1000, limit: 600 } });

// ---------- login throttling per account ----------
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

function loginLocked(user) {
  return user.lockedUntil && user.lockedUntil > Date.now();
}

function recordLoginFailure(user) {
  user.failedLogins = (user.failedLogins || 0) + 1;
  if (user.failedLogins >= MAX_FAILED) {
    user.lockedUntil = Date.now() + LOCK_MS;
    user.failedLogins = 0;
  }
  save();
}

function recordLoginSuccess(user) {
  user.failedLogins = 0;
  user.lockedUntil = 0;
  user.lastLoginAt = Date.now();
  save();
}

// ---------- validation ----------
// validEmail is the syntax-only check; registration additionally verifies the
// domain can receive mail (see email-check.js).
function validEmail(v) { return normalizeEmail(v).ok; }
function validName(v) { return cleanName(v, 60) !== null; }
function validPassword(v) { return typeof v === 'string' && v.length >= 1 && v.length <= 128; }
function validProjectName(v) { return cleanName(v, 80) !== null; }

module.exports = {
  createSession, destroySession, getSessionUser, requireAuth, csrfProtect,
  currentSessionKey, revokeSessions, listSessions, revokeSessionById,
  safeNextPath, ipKey, apiLimiter, writeLimiter, authLimiter, loginLimiter,
  registerLimiter, sensitiveLimiter, pageLimiter, oauthLimiter, mfaLimiter, mfaSetupPending, parseCookies, addCookie,
  loginLocked, recordLoginFailure, recordLoginSuccess,
  validEmail, validName, validPassword, validProjectName,
  SESSION_COOKIE, IS_PROD, HOSTED,
};
