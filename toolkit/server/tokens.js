// Personal access tokens: lets a local tool (for example the Toolkit MCP server used by
// an AI assistant) call the document APIs without a browser session.
//
//  - A token is shown once, when it is created. Only its SHA-256 hash is stored.
//  - Tokens carry scopes: 'read' (GET) and 'write' (create, save, delete).
//  - They are accepted only as "Authorization: Bearer ..." and only on the document APIs
//    and /api/auth/me. Account settings, sign-in and token management always need a
//    signed-in browser session, so a leaked token can never create more tokens, change
//    the password or delete the account.
//  - Bearer requests skip the cookie CSRF header (a browser cannot attach this header
//    cross-site without a CORS approval, which Toolkit never gives) but still pass
//    through the same rate limiters as every other API request.
//  - Every use is written to the audit log.
const crypto = require('crypto');
const { db, save } = require('./store');
const { audit } = require('./audit');
const { cleanName } = require('./validation');

db.tokens = db.tokens || [];

const PREFIX = 'tkp_';
const TOKEN_RE = /^tkp_[A-Za-z0-9_-]{43}$/;
const SCOPES = ['read', 'write'];
const MAX_TOKENS_PER_USER = 20;
const MAX_NAME = 60;
const DAY = 24 * 60 * 60 * 1000;
const EXPIRY_DAYS = [7, 30, 90, 365];          // plus 0 = never expires
const TOUCH_MS = 60 * 1000;                     // lastUsedAt is refreshed at most this often

// Paths (relative to /api) a token may call. Matched case-insensitively, like Express routing.
const TOKEN_PATHS = /^\/(?:projects|paintings|images)(?:\/|$)/i;
const ME_PATH = /^\/auth\/me\/?$/i;

function hash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

function publicToken(t) {
  return {
    id: t.id, name: t.name, scopes: t.scopes.slice(), hint: t.hint,
    createdAt: t.createdAt, lastUsedAt: t.lastUsedAt || null, expiresAt: t.expiresAt || null,
  };
}

function expired(t, now = Date.now()) { return !!t.expiresAt && now >= t.expiresAt; }

function listTokens(userId) {
  return db.tokens.filter(t => t.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(t => ({ ...publicToken(t), expired: expired(t) }));
}

// Returns { error } or { token, record }. The caller has already re-authenticated the user.
function createToken(userId, { name, scopes, expiresInDays } = {}) {
  const clean = cleanName(name, MAX_NAME);
  if (!clean) return { error: `Give the token a name (1-${MAX_NAME} characters).` };
  if (!Array.isArray(scopes) || scopes.length < 1 || scopes.length > SCOPES.length ||
      !scopes.every(s => SCOPES.includes(s)) || new Set(scopes).size !== scopes.length) {
    return { error: 'Scopes must be "read", "write" or both.' };
  }
  const days = expiresInDays === undefined || expiresInDays === null ? 90 : expiresInDays;
  if (days !== 0 && !EXPIRY_DAYS.includes(days)) return { error: 'Expiry must be 7, 30, 90 or 365 days, or 0 for never.' };
  if (db.tokens.filter(t => t.userId === userId).length >= MAX_TOKENS_PER_USER) {
    return { error: `You can have at most ${MAX_TOKENS_PER_USER} tokens. Revoke one you no longer use.` };
  }
  const token = PREFIX + crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const record = {
    id: crypto.randomUUID(), userId, name: clean,
    scopes: SCOPES.filter(s => scopes.includes(s)),
    hash: hash(token), hint: token.slice(0, PREFIX.length + 4),
    createdAt: now, lastUsedAt: null, expiresAt: days ? now + days * DAY : null,
  };
  db.tokens.push(record);
  save();
  return { token, record: publicToken(record) };
}

function revokeToken(userId, id) {
  if (typeof id !== 'string' || id.length > 64) return false;
  const before = db.tokens.length;
  db.tokens = db.tokens.filter(t => !(t.id === id && t.userId === userId));
  if (db.tokens.length === before) return false;
  save();
  return true;
}

function removeUserTokens(userId) {
  const before = db.tokens.length;
  db.tokens = db.tokens.filter(t => t.userId !== userId);
  return before - db.tokens.length;
}

// null: no bearer credentials (other schemes, such as a proxy's Basic auth, are ignored).
// '': a Bearer header that does not hold exactly one token.
function bearer(req) {
  const h = req.headers.authorization;
  if (typeof h !== 'string' || !/^Bearer(?:\s|$)/i.test(h)) return null;
  const m = /^Bearer[ ]+(\S+)[ ]*$/i.exec(h);
  return m ? m[1] : '';
}

function deny(req, res, status, error, code, detail) {
  audit('token.denied', { req, userId: detail && detail.userId || null, detail: { code, path: routePath(req) }, throttleKey: 'tokdeny:' + code + ':' + (req.ip || ''), throttleMs: 5000 });
  res.set('WWW-Authenticate', `Bearer error="${status === 401 ? 'invalid_token' : 'insufficient_scope'}"`);
  return res.status(status).json({ error, code });
}

function routePath(req) { return String(req.originalUrl || '').split('?')[0].slice(0, 200); }

// Mounted on /api before the CSRF check. Requests without an Authorization header are untouched.
function tokenAuth(req, res, next) {
  const supplied = bearer(req);
  if (supplied === null) return next();
  const p = req.path;
  const isMe = ME_PATH.test(p);
  if (!isMe && !TOKEN_PATHS.test(p)) {
    return deny(req, res, 403, 'Access tokens can only be used with the project, painting and image APIs. Sign in to Toolkit in a browser for this.', 'token_not_allowed');
  }
  if (!supplied || !TOKEN_RE.test(supplied)) return deny(req, res, 401, 'The access token is missing or malformed.', 'token_invalid');
  const h = hash(supplied);
  const record = db.tokens.find(t => t.hash === h);
  if (!record) return deny(req, res, 401, 'This access token is not valid. It may have been revoked.', 'token_invalid');
  const now = Date.now();
  if (expired(record, now)) return deny(req, res, 401, 'This access token has expired. Create a new one on your Toolkit account page.', 'token_expired', { userId: record.userId });
  const user = db.users.find(u => u.id === record.userId);
  if (!user) return deny(req, res, 401, 'This access token is not valid.', 'token_invalid');
  if (process.env.TOOLKIT_REQUIRE_MFA === '1' && !(user.mfa && user.mfa.enabled)) {
    return deny(req, res, 403, 'This server requires two-step sign-in. Turn it on in your account, then try again.', 'mfa_setup_required', { userId: user.id });
  }
  const reading = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const needed = reading ? 'read' : 'write';
  if (!isMe && !record.scopes.includes(needed)) {
    return deny(req, res, 403, `This access token does not have the "${needed}" scope.`, 'token_scope', { userId: user.id });
  }
  if (isMe && !reading) return deny(req, res, 403, 'Access tokens can only read /api/auth/me.', 'token_not_allowed', { userId: user.id });
  req.user = user;
  req.authToken = record;
  if (!record.lastUsedAt || now - record.lastUsedAt > TOUCH_MS) { record.lastUsedAt = now; save(); }
  res.on('finish', () => {
    audit('token.use', { req, userId: user.id, detail: { tokenId: record.id, method: req.method, path: routePath(req), status: res.statusCode } });
  });
  next();
}

// Account routes and other session-only APIs refuse token-authenticated requests outright.
function rejectToken(req, res, next) {
  if (req.authToken || bearer(req) !== null) {
    return deny(req, res, 403, 'Access tokens cannot be used here. Sign in to Toolkit in a browser.', 'token_not_allowed');
  }
  next();
}

module.exports = {
  tokenAuth, rejectToken, createToken, listTokens, revokeToken, removeUserTokens, publicToken,
  SCOPES, EXPIRY_DAYS, MAX_TOKENS_PER_USER, TOKEN_RE,
};
