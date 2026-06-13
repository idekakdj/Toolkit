// Security utilities for Toolkit: shared sessions across all apps,
// CSRF defence, validation, rate limits.
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { db, save } = require('./store');

const SESSION_COOKIE = 'toolkit_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const IS_PROD = process.env.NODE_ENV === 'production';

// ---------- cookies ----------
function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function sessionCookieAttrs(maxAgeSeconds) {
  let attrs = `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
  if (IS_PROD) attrs += '; Secure';
  return attrs;
}

// ---------- sessions (tokens hashed at rest) ----------
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[hashToken(token)] = { userId, expiresAt: Date.now() + SESSION_TTL_MS };
  save();
  res.setHeader('Set-Cookie',
    `${SESSION_COOKIE}=${token}; ${sessionCookieAttrs(SESSION_TTL_MS / 1000)}`);
}

function destroySession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) { delete db.sessions[hashToken(token)]; save(); }
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; ${sessionCookieAttrs(0)}`);
}

function getSessionUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const key = hashToken(token);
  const sess = db.sessions[key];
  if (!sess) return null;
  if (sess.expiresAt < Date.now()) { delete db.sessions[key]; save(); return null; }
  const user = db.users.find(u => u.id === sess.userId);
  if (!user) { delete db.sessions[key]; save(); return null; }
  // Sliding expiry: extend when more than a day has been used up.
  if (sess.expiresAt - Date.now() < SESSION_TTL_MS - 24 * 60 * 60 * 1000) {
    sess.expiresAt = Date.now() + SESSION_TTL_MS;
    save();
  }
  return user;
}

// Periodically drop expired sessions.
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const key of Object.keys(db.sessions)) {
    if (db.sessions[key].expiresAt < now) { delete db.sessions[key]; changed = true; }
  }
  if (changed) save();
}, 60 * 60 * 1000).unref();

// ---------- middleware ----------
function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  req.user = user;
  next();
}

// CSRF defence: SameSite=Strict cookies plus an Origin check and a required
// custom header on every state-changing request. Any non-empty value works
// (browsers cannot attach custom headers cross-origin without CORS approval),
// so each app may send its own identifier.
function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin || '';
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* malformed origin */ }
    if (host !== req.headers.host) {
      return res.status(403).json({ error: 'Cross-origin request blocked' });
    }
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
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

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
  save();
}

// ---------- validation ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validEmail(v) {
  return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v);
}
function validName(v) {
  return typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 60;
}
function validPassword(v) {
  return typeof v === 'string' && v.length >= 8 && v.length <= 128;
}
function validProjectName(v) {
  return typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 80;
}

module.exports = {
  createSession, destroySession, getSessionUser, requireAuth, csrfProtect,
  safeNextPath, apiLimiter, authLimiter,
  loginLocked, recordLoginFailure, recordLoginSuccess,
  validEmail, validName, validPassword, validProjectName,
};
