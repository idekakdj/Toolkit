// Authentication routes: register, login, logout, current user, email
// verification and password reset (the last two only when mail is configured),
// plus "Continue with Google" (google.js, only when keys are in toolkit/.env).
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, save } = require('./store');
const {
  createSession, destroySession, requireAuth, currentSessionKey, revokeSessions,
  loginLimiter, registerLimiter, authLimiter, mfaLimiter,
  loginLocked, recordLoginFailure, recordLoginSuccess,
  validName,
} = require('./security');
const { normalizeEmail, checkSignupAddress } = require('./email-check');
const { checkPassword, MIN_LENGTH } = require('./passwords');
const { audit, tag } = require('./audit');
const { PRIVACY_VERSION } = require('./policy');
const mailer = require('./mailer');
const google = require('./google');
const mfa = require('./mfa');

const router = express.Router();
router.use('/google', google.router);
const BCRYPT_COST = 11;
// A real hash of a throwaway value: comparing against it costs the same as a genuine
// check, so unknown-email logins are indistinguishable from wrong-password logins.
const DUMMY_HASH = bcrypt.hashSync('toolkit-timing-equalizer', BCRYPT_COST);
const LOGIN_FAILED = 'Incorrect email or password. If you created your account with Google, use Continue with Google. ' +
  'After several failed attempts, sign-in pauses for 15 minutes.';
const LINK_BAD = 'This link is invalid or has expired. Request a new one.';
const CODE_BAD = 'That code is wrong or has expired. Check the latest email, or send a new code.';
const CODE_TTL = 15 * 60 * 1000;
const CODE_ATTEMPTS = 5;
const UNVERIFIED_TTL = 7 * 24 * 60 * 60 * 1000;   // pending sign-ups are removed after this
const RESET_TTL = 60 * 60 * 1000;
const COOLDOWN = 60 * 1000;

// Every new account must prove it owns its email address with a code sent to it, so an
// address that does not exist can never become a usable account. Only automated tests
// and fully offline installs that accept that risk may turn this off.
const verificationRequired = () => process.env.TOOLKIT_EMAIL_VERIFICATION !== 'off';
const SIGNUPS_PAUSED = 'Sign-ups are paused: this Toolkit cannot send email yet, so it cannot confirm new addresses. ' +
  'The administrator needs to set up email (run "node scripts/setup-mail.cjs" in the toolkit folder).';

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email };
}
// Present (true) only when TOOLKIT_REQUIRE_MFA=1 and the new session must first set up two-step sign-in.
function setupFlag(sessionKey) {
  return db.sessions[sessionKey] && db.sessions[sessionKey].mfaSetup ? { mfaSetupRequired: true } : {};
}

// ---------- one-time email tokens (only a hash is stored) ----------
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function issueToken(user, kind, ttl) {
  const token = crypto.randomBytes(32).toString('base64url');
  user[kind] = { hash: sha(token), expires: Date.now() + ttl, sentAt: Date.now() };
  save();
  return token;
}
function findByToken(kind, token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const h = sha(token);
  return db.users.find(u => u[kind] && u[kind].hash === h && u[kind].expires > Date.now()) || null;
}
const coolingDown = (user, kind) => !!(user[kind] && Date.now() - (user[kind].sentAt || 0) < COOLDOWN);

// Mail is sent after the HTTP response so response time never reveals whether an
// address has an account. Failures are logged, never shown to the requester.
function sendLater(message, req, userId) {
  setImmediate(() => {
    mailer.send(message).catch(err => audit('mail.fail', { req, userId, detail: { message: String(err && err.message).slice(0, 120) } }));
  });
}
// ---------- 6-digit email confirmation codes (only a salted hash is stored) ----------
const codeHash = (user, code) => sha(user.id + ':' + code);
function verifyMail(user) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  user.verify = { hash: codeHash(user, code), expires: Date.now() + CODE_TTL, sentAt: Date.now(), attempts: 0 };
  save();
  return { to: user.email, subject: `${code} is your Toolkit confirmation code`,
    text: `Hi ${user.name},\n\nYour Toolkit confirmation code is:\n\n    ${code}\n\nEnter it on the sign-up screen within 15 minutes to finish creating your account.\n\nIf you did not try to create a Toolkit account you can ignore this message; without the code no account is created.\n` };
}

// Pending sign-ups that were never confirmed are removed, so an address cannot be held
// hostage by someone who registered it without access to the mailbox.
function purgeUnverified() {
  const cutoff = Date.now() - UNVERIFIED_TTL;
  const before = db.users.length;
  db.users = db.users.filter(u => !(u.emailVerified === false && u.createdAt < cutoff));
  if (db.users.length !== before) save();
}
setInterval(purgeUnverified, 60 * 60 * 1000).unref();

router.get('/config', (req, res) => {
  res.json({
    emailEnabled: mailer.configured(), passwordMinLength: MIN_LENGTH, privacyVersion: PRIVACY_VERSION,
    signupsOpen: !verificationRequired() || mailer.configured(),
    googleEnabled: google.configured(),
    mfaRequired: process.env.TOOLKIT_REQUIRE_MFA === '1',
    privacyContact: (process.env.TOOLKIT_PRIVACY_CONTACT || '').trim().slice(0, 200) || null,
  });
});

router.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const { name, email, password, confirmPassword, acceptTerms } = req.body || {};
    if (!validName(name)) return res.status(400).json({ error: 'Enter a name (1-60 characters, no control characters).' });
    const parsed = normalizeEmail(email);
    if (!parsed.ok) return res.status(400).json({ error: parsed.reason, field: 'email' });
    const weak = checkPassword(password, { email: parsed.email, name });
    if (weak) return res.status(400).json({ error: weak, field: 'password' });
    // The sign-up form asks for the password twice; API clients may omit the copy.
    if (confirmPassword !== undefined && confirmPassword !== password) {
      return res.status(400).json({ error: 'The two passwords do not match.', field: 'confirm' });
    }
    if (acceptTerms !== true) {
      return res.status(400).json({ error: 'Please accept the privacy notice to create an account.' });
    }
    const mailOn = mailer.configured();
    if (verificationRequired() && !mailOn) {
      audit('register.paused', { req, throttleKey: 'paused', throttleMs: 600000 });
      return res.status(503).json({ error: SIGNUPS_PAUSED, code: 'signups_paused' });
    }
    // Only real mailboxes at established providers: refuses domains that cannot receive
    // mail, disposable inboxes, typos of big providers and unrecognised mail hosts.
    // Transient DNS trouble never blocks a signup; the emailed code is the real proof.
    const address = await checkSignupAddress(parsed);
    if (!address.ok) {
      return res.status(400).json({ error: address.reason, field: 'email', code: 'email_' + address.code, suggestion: address.suggestion });
    }
    const normalized = parsed.email;
    // Hash first so new and existing addresses cost the same amount of work.
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const existing = db.users.find(u => u.email === normalized);
    if (existing && existing.emailVerified === false) {
      // A pending, never-confirmed sign-up: whoever controls the mailbox may take it over.
      // Nothing is usable until the new code is entered, so this grants no access.
      existing.name = name.normalize('NFC').trim();
      existing.passwordHash = passwordHash;
      existing.consent = { at: Date.now(), version: PRIVACY_VERSION };
      existing.createdAt = Date.now();
      audit('register.restart', { req, userId: existing.id });
      sendLater(verifyMail(existing), req, existing.id);
      return res.status(202).json({ verificationRequired: true });
    }
    if (existing) {
      audit('register.duplicate', { req, detail: { email: tag(normalized) }, throttleKey: 'dup:' + tag(normalized) });
      if (!mailOn) return res.status(409).json({ error: 'An account with that email already exists. Sign in instead (or use Continue with Google if you created it that way).' });
      // With mail enabled the response is identical for new and existing addresses, so
      // the form cannot be used to discover who has an account. The owner is told instead.
      sendLater({ to: existing.email, subject: 'Someone tried to use your email address on Toolkit',
        text: `Someone tried to create a Toolkit account with this email address, but an account already exists.\n\nIf this was you, sign in at ${mailer.baseUrl(req)}/auth (with your password, or with Continue with Google if you created the account that way), or reset your password there.\nIf not, you can ignore this message; nothing has changed.\n` }, req, existing.id);
      return res.status(202).json({ verificationRequired: true });
    }
    const user = {
      id: crypto.randomUUID(),
      name: name.normalize('NFC').trim(),
      email: normalized,
      passwordHash,
      createdAt: Date.now(),
      failedLogins: 0,
      lockedUntil: 0,
      consent: { at: Date.now(), version: PRIVACY_VERSION },
      emailVerified: mailOn ? false : null,     // null: no mail server, so nothing to verify
    };
    db.users.push(user);
    save();
    audit('register', { req, userId: user.id, detail: { verification: mailOn ? 'pending' : 'not-configured' } });
    if (mailOn) {
      sendLater(verifyMail(user), req, user.id);
      return res.status(202).json({ verificationRequired: true });
    }
    user.lastLoginAt = Date.now();
    const key = createSession(res, user.id, req);
    res.status(201).json({ user: publicUser(user), ...setupFlag(key) });
  } catch (err) { next(err); }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 128) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    // The same normalisation as sign-up, so an internationalised domain typed in its
    // Unicode form (bücher.de) finds the account stored under its punycode form.
    const parsed = normalizeEmail(email);
    const normalized = parsed.ok ? parsed.email : email.trim().toLowerCase();
    const user = db.users.find(u => u.email === normalized);
    // Always run exactly one hash comparison, whatever the outcome. Accounts created with
    // Google have no password; they compare against the dummy hash and always fail.
    const hash = user && user.passwordHash ? user.passwordHash : DUMMY_HASH;
    const ok = await bcrypt.compare(password, hash) && hash !== DUMMY_HASH;
    const locked = !!user && loginLocked(user);
    if (!user || !ok || locked) {
      if (user && !locked) {
        recordLoginFailure(user);
        if (loginLocked(user)) audit('login.locked', { req, userId: user.id });
      }
      audit('login.fail', {
        req, userId: user ? user.id : null,
        detail: user ? { reason: locked ? 'locked' : 'bad-password' } : { reason: 'unknown-email', email: tag(normalized) },
        throttleKey: 'lf:' + (user ? user.id : tag(normalized)), throttleMs: 5000,
      });
      // One message for unknown email, wrong password and locked account: the response
      // never reveals whether an address has an account.
      return res.status(401).json({ error: LOGIN_FAILED });
    }
    // Only someone who proved they know the password learns the account is unverified.
    if (user.emailVerified === false) {
      audit('login.unverified', { req, userId: user.id, throttleKey: 'unv:' + user.id });
      // Send a fresh code unless one went out in the last minute.
      if (mailer.configured() && !coolingDown(user, 'verify')) sendLater(verifyMail(user), req, user.id);
      return res.status(403).json({ error: 'Confirm your email address first: enter the 6-digit code we emailed you.', code: 'email_not_verified' });
    }
    const prior = currentSessionKey(req);
    if (user.mfa && user.mfa.enabled) {
      // Password is right, but no session yet: a short-lived challenge cookie lets the
      // next request supply the authenticator code.
      mfa.startChallenge(res, user.id, 'password', prior);
      audit('login.mfa-challenge', { req, userId: user.id, detail: { method: 'password' } });
      return res.json({ mfaRequired: true });
    }
    recordLoginSuccess(user);
    // A fresh session id on every login prevents session fixation.
    if (prior && db.sessions[prior]) { delete db.sessions[prior]; save(); }
    const key = createSession(res, user.id, req);
    audit('login.success', { req, userId: user.id });
    res.json({ user: publicUser(user), ...setupFlag(key) });
  } catch (err) { next(err); }
});

// ---------- two-step sign-in ----------
const MFA_BAD = 'That code is not right. Check your authenticator app and try again.';
const MFA_EXPIRED = 'Your sign-in expired. Sign in again.';
function mfaExpired(res, key) {
  if (key) mfa.dropChallenge(key);
  mfa.clearChallengeCookie(res);
  return res.status(401).json({ error: MFA_EXPIRED, code: 'mfa_expired' });
}

router.post('/mfa/verify', mfaLimiter, (req, res) => {
  const found = mfa.readChallenge(req);
  if (!found) return mfaExpired(res, null);
  const { key, entry } = found;
  const user = db.users.find(u => u.id === entry.userId);
  if (!user || !user.mfa || !user.mfa.enabled || loginLocked(user)) return mfaExpired(res, key);
  const code = req.body && req.body.code;
  const result = typeof code === 'string' && code.length <= 40 ? mfa.checkUserCode(user, code) : { ok: false };
  if (!result.ok) {
    entry.attempts++;
    recordLoginFailure(user);
    audit('mfa.fail', { req, userId: user.id, detail: { method: entry.method }, throttleKey: 'mf:' + user.id, throttleMs: 2000 });
    const attemptsLeft = Math.max(0, mfa.CHALLENGE_ATTEMPTS - entry.attempts);
    if (attemptsLeft === 0) { mfa.dropChallenge(key); mfa.clearChallengeCookie(res); }
    return res.status(400).json({ error: MFA_BAD, code: 'mfa_invalid', attemptsLeft });
  }
  mfa.dropChallenge(key);
  mfa.clearChallengeCookie(res);
  if (entry.priorKey && db.sessions[entry.priorKey]) { delete db.sessions[entry.priorKey]; save(); }
  recordLoginSuccess(user);
  createSession(res, user.id, req, { method: entry.method });
  audit('login.success', { req, userId: user.id, detail: { mfa: true, method: entry.method } });
  const body = { user: publicUser(user) };
  if (result.kind === 'recovery') {
    body.recoveryUsed = true;
    body.recoveryRemaining = result.remaining;
    audit('mfa.recovery-used', { req, userId: user.id, detail: { remaining: result.remaining } });
  }
  res.json(body);
});

router.post('/mfa/cancel', (req, res) => {
  const found = mfa.readChallenge(req);
  if (found) mfa.dropChallenge(found.key);
  mfa.clearChallengeCookie(res);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  const key = currentSessionKey(req);
  const userId = key && db.sessions[key] ? db.sessions[key].userId : null;
  destroySession(req, res);
  if (userId) audit('logout', { req, userId });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ---------- email verification ----------
// Entering the emailed code confirms the address and signs the person in.
router.post('/verify-email', authLimiter, (req, res) => {
  const { email, code } = req.body || {};
  const parsed = normalizeEmail(email);
  const user = parsed.ok ? db.users.find(u => u.email === parsed.email) : null;
  const pending = user && user.emailVerified === false && user.verify;
  // One answer for every failure, so the endpoint reveals nothing about which addresses exist.
  if (!pending || typeof code !== 'string' || !/^\d{6}$/.test(code.trim()) || pending.expires < Date.now()) {
    return res.status(400).json({ error: CODE_BAD });
  }
  const expected = Buffer.from(pending.hash, 'hex');
  const given = Buffer.from(codeHash(user, code.trim()), 'hex');
  if (!crypto.timingSafeEqual(expected, given)) {
    pending.attempts = (pending.attempts || 0) + 1;
    // Too many guesses kill the code; a new one must be requested (and is rate limited).
    if (pending.attempts >= CODE_ATTEMPTS) delete user.verify;
    save();
    audit('email.verify.fail', { req, userId: user.id, throttleKey: 'vf:' + user.id, throttleMs: 5000 });
    return res.status(400).json({ error: pending.attempts >= CODE_ATTEMPTS ? 'Too many wrong codes. Send a new code and try again.' : CODE_BAD });
  }
  user.emailVerified = true;
  delete user.verify;
  recordLoginSuccess(user);
  audit('email.verified', { req, userId: user.id });
  const prior = currentSessionKey(req);
  if (prior && db.sessions[prior]) delete db.sessions[prior];
  const key = createSession(res, user.id, req, { method: 'email-code' });
  res.json({ user: publicUser(user), ...setupFlag(key) });
});

router.post('/resend-verification', authLimiter, (req, res) => {
  // Always the same answer, whether or not the address exists or needs verifying.
  const parsed = normalizeEmail(req.body && req.body.email);
  if (mailer.configured() && parsed.ok) {
    const user = db.users.find(u => u.email === parsed.email);
    if (user && user.emailVerified === false && !coolingDown(user, 'verify')) sendLater(verifyMail(user), req, user.id);
  }
  res.status(202).json({ ok: true });
});

// ---------- password reset ----------
router.post('/forgot', authLimiter, (req, res) => {
  if (!mailer.configured()) {
    return res.status(501).json({ error: 'Email is not set up on this server, so passwords cannot be reset by email. Ask the administrator.' });
  }
  const parsed = normalizeEmail(req.body && req.body.email);
  if (parsed.ok) {
    const user = db.users.find(u => u.email === parsed.email);
    if (user && user.emailVerified !== false && !coolingDown(user, 'reset')) {
      const token = issueToken(user, 'reset', RESET_TTL);
      audit('password.reset.requested', { req, userId: user.id });
      sendLater({ to: user.email, subject: 'Reset your Toolkit password',
        text: `Hi ${user.name},\n\nUse this link within 1 hour to choose a new password:\n\n${mailer.baseUrl(req)}/reset#token=${token}\n\nIf you did not ask for this, ignore this message; your password has not changed.\n` }, req, user.id);
    }
  }
  res.status(202).json({ ok: true });
});

router.post('/reset', authLimiter, async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    const user = findByToken('reset', token);
    if (!user) return res.status(400).json({ error: LINK_BAD });
    const weak = checkPassword(password, { email: user.email, name: user.name });
    if (weak) return res.status(400).json({ error: weak });          // the link stays valid so they can retry
    user.passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    delete user.reset;
    user.failedLogins = 0; user.lockedUntil = 0;
    user.passwordChangedAt = Date.now();
    if (user.emailVerified === false) user.emailVerified = true;     // controlling the mailbox proves it
    const signedOut = revokeSessions(user.id);                       // every device must sign in again
    save();
    audit('password.reset', { req, userId: user.id, detail: { sessionsRevoked: signedOut } });
    sendLater({ to: user.email, subject: 'Your Toolkit password was changed',
      text: 'Your Toolkit password was just changed using a reset link. If this was not you, reset it again immediately and contact the administrator.\n' }, req, user.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.LOGIN_FAILED = LOGIN_FAILED;
module.exports.purgeUnverified = purgeUnverified;
