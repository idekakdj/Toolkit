// Two-step sign-in with an authenticator app (TOTP, RFC 6238) plus single-use recovery
// codes, and the short-lived "challenge" that sits between a correct password (or Google
// sign-in) and the session.
//
// Stored on the user record:
//   user.mfa        = { enabled: true, secret: <base32>, enrolledAt, lastStep, recovery: [{ hash, usedAt }] }
//   user.mfaPending = { secret: <base32>, expires, attempts }       (enrolment not yet confirmed)
// The secret is stored as-is because the server must be able to compute codes. It is
// protected at rest by whole-database encryption when TOOLKIT_DATA_KEY is set (see
// store.js), so production installs must set that key. Recovery codes are stored only as
// salted SHA-256 hashes. Neither is ever logged, exported or returned after enrolment.
const crypto = require('node:crypto');
const { db, save } = require('./store');
const { addCookie, parseCookies, IS_PROD } = require('./security');

const STEP_S = 30;
const DIGITS = 6;
const ALPHABET32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const RECOVERY_COUNT = 10;
const PENDING_TTL = 10 * 60 * 1000;
const PENDING_ATTEMPTS = 5;
const CHALLENGE_TTL_S = 300;
const CHALLENGE_ATTEMPTS = 5;
const MAX_CHALLENGES = 1000;
const CHALLENGE_COOKIE = IS_PROD ? '__Host-toolkit_mfa' : 'toolkit_mfa';

// ---------- base32 (RFC 4648, no padding) ----------
function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += ALPHABET32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const i = ALPHABET32.indexOf(ch);
    if (i < 0) throw new Error('invalid base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(out);
}

// ---------- TOTP ----------
const newSecret = () => base32Encode(crypto.randomBytes(20));
const groupSecret = secret => secret.replace(/(.{4})(?=.)/g, '$1 ');

function hotp(key, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const off = h[19] & 15;
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}
const totpAt = (secretB32, unixSeconds) => hotp(base32Decode(secretB32), Math.floor(unixSeconds / STEP_S));

// Returns the matching time step (> lastStep) or null. Accepts the previous, current and
// next step; a step at or before lastStep is a replay and is refused.
function verifyTotp(secretB32, input, { now = Date.now(), lastStep = 0 } = {}) {
  const code = typeof input === 'string' ? input.replace(/\s+/g, '') : '';
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secretB32);
  const t = Math.floor(now / 1000 / STEP_S);
  const given = Buffer.from(code);
  let found = null;
  for (const step of [t - 1, t, t + 1]) {
    const match = crypto.timingSafeEqual(Buffer.from(hotp(key, step)), given);
    if (match && step > lastStep) found = step;
  }
  return found;
}

const otpauthUri = (email, secret) =>
  `otpauth://totp/Toolkit:${encodeURIComponent(email)}?secret=${secret}&issuer=Toolkit&algorithm=SHA1&digits=${DIGITS}&period=${STEP_S}`;

// ---------- recovery codes ----------
const normaliseRecovery = input => String(input).toLowerCase().replace(/[\s-]/g, '');
const recoveryHash = (userId, normalised) => crypto.createHash('sha256').update(userId + ':' + normalised).digest('hex');

function newRecoverySet(userId) {
  const codes = [], records = [];
  for (let i = 0; i < RECOVERY_COUNT; i++) {
    let raw = '';
    for (let j = 0; j < 8; j++) raw += RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)];
    codes.push(raw.slice(0, 4) + '-' + raw.slice(4));
    records.push({ hash: recoveryHash(userId, raw), usedAt: null });
  }
  return { codes, records };
}
const recoveryRemaining = user => (user.mfa && Array.isArray(user.mfa.recovery) ? user.mfa.recovery.filter(r => !r.usedAt).length : 0);

// Marks a matching unused recovery code as used. Every record is compared, whatever matches.
function useRecoveryCode(user, input) {
  if (typeof input !== 'string' || input.length > 40) return false;
  const norm = normaliseRecovery(input);
  if (norm.length !== 8) return false;
  const given = Buffer.from(recoveryHash(user.id, norm), 'hex');
  let hit = null;
  for (const rec of (user.mfa && user.mfa.recovery) || []) {
    const same = crypto.timingSafeEqual(Buffer.from(rec.hash, 'hex'), given);
    if (same && !rec.usedAt && !hit) hit = rec;
  }
  if (!hit) return false;
  hit.usedAt = Date.now();
  save();
  return true;
}

// Checks a code typed by the person against an enabled account. A valid authenticator
// code records its step (replay protection); a valid recovery code is burned.
function checkUserCode(user, input, { allowRecovery = true, now = Date.now() } = {}) {
  if (!user.mfa || !user.mfa.enabled) return { ok: false };
  const step = verifyTotp(user.mfa.secret, input, { now, lastStep: user.mfa.lastStep || 0 });
  if (step !== null) { user.mfa.lastStep = step; save(); return { ok: true, kind: 'totp' }; }
  if (allowRecovery && useRecoveryCode(user, input)) return { ok: true, kind: 'recovery', remaining: recoveryRemaining(user) };
  return { ok: false };
}

// ---------- enrolment ----------
function beginEnrolment(user) {
  const secret = newSecret();
  user.mfaPending = { secret, expires: Date.now() + PENDING_TTL, attempts: 0 };
  save();
  return secret;
}
const livePending = user => (user.mfaPending && user.mfaPending.expires > Date.now() ? user.mfaPending : null);

// ---------- sign-in challenge (memory only; a restart simply asks the person to sign in again) ----------
const challenges = new Map();     // sha256(token) -> { userId, method, priorKey, expires, attempts }
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

function challengeCookie(value, maxAge) {
  return `${CHALLENGE_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${IS_PROD ? '; Secure' : ''}`;
}
function startChallenge(res, userId, method, priorKey) {
  const now = Date.now();
  for (const [k, v] of challenges) if (v.expires < now) challenges.delete(k);
  while (challenges.size >= MAX_CHALLENGES) challenges.delete(challenges.keys().next().value);
  const token = crypto.randomBytes(32).toString('base64url');
  challenges.set(hashToken(token), { userId, method, priorKey: priorKey || null, expires: now + CHALLENGE_TTL_S * 1000, attempts: 0 });
  addCookie(res, challengeCookie(token, CHALLENGE_TTL_S));
}
function readChallenge(req) {
  const token = parseCookies(req)[CHALLENGE_COOKIE];
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const key = hashToken(token);
  const entry = challenges.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now() || entry.attempts >= CHALLENGE_ATTEMPTS) { challenges.delete(key); return null; }
  return { key, entry };
}
const dropChallenge = key => { challenges.delete(key); };
const clearChallengeCookie = res => addCookie(res, challengeCookie('', 0));
const hasChallengeCookie = req => !!parseCookies(req)[CHALLENGE_COOKIE];

module.exports = {
  base32Encode, base32Decode, newSecret, groupSecret, totpAt, verifyTotp, otpauthUri,
  newRecoverySet, recoveryRemaining, useRecoveryCode, checkUserCode, normaliseRecovery, recoveryHash,
  beginEnrolment, livePending,
  startChallenge, readChallenge, dropChallenge, clearChallengeCookie, hasChallengeCookie,
  CHALLENGE_COOKIE, CHALLENGE_ATTEMPTS, PENDING_ATTEMPTS, RECOVERY_COUNT,
};
