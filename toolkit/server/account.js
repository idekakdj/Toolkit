// Account self-service: profile, password change, session management, data export
// (right of access / portability) and account deletion (right to erasure). Every
// action that changes credentials or removes data requires the current password, or,
// for accounts created with Google (no password), a Google sign-in in the last 10 minutes.
const express = require('express');
const bcrypt = require('bcryptjs');
const { db, save, eraseDurably } = require('./store');
const {
  requireAuth, sensitiveLimiter, listSessions, revokeSessions, revokeSessionById,
  destroySession, currentSessionKey, validName, mfaSetupPending,
} = require('./security');
const { checkPassword } = require('./passwords');
const { usage, limitBytes } = require('./quota');
const { audit, eventsFor } = require('./audit');
const { cleanName } = require('./validation');
const { PRIVACY_VERSION } = require('./policy');
const mfa = require('./mfa');
const qr = require('./qr');

const router = express.Router();
router.use(requireAuth);

const COLLECTIONS = [['projects', 'sigma'], ['paintings', 'pigment'], ['images', 'imagevendor']];
const BAD_PASSWORD = 'Your current password is incorrect.';
const REAUTH_MS = 10 * 60 * 1000;

function profile(u, req) {
  const counts = {};
  for (const [c] of COLLECTIONS) counts[c] = db[c].filter(r => r.ownerId === u.id).length;
  const limit = limitBytes();
  return {
    id: u.id, name: u.name, email: u.email, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null,
    consent: u.consent || null, currentPrivacyVersion: PRIVACY_VERSION,
    hasPassword: !!u.passwordHash, google: !!u.googleSub,
    mfa: { enabled: !!(u.mfa && u.mfa.enabled), enrolledAt: (u.mfa && u.mfa.enrolledAt) || null, recoveryRemaining: mfa.recoveryRemaining(u) },
    mfaSetupRequired: !!(req && mfaSetupPending(req, u)),
    storage: { usedBytes: usage(u.id), limitBytes: Number.isFinite(limit) ? limit : null, counts },
  };
}

async function reauth(req, res) {
  if (!req.user.passwordHash) {
    // No password to ask for: the person must have signed in with Google just now.
    const sess = db.sessions[req.sessionKey];
    if (sess && sess.method === 'google' && Date.now() - (sess.createdAt || 0) < REAUTH_MS) return true;
    res.status(403).json({ error: 'For your security, confirm it is you: continue with Google again, then retry.', code: 'reauth_google' });
    return false;
  }
  const password = req.body && req.body.currentPassword;
  if (typeof password !== 'string' || password.length > 128) {
    res.status(400).json({ error: 'Enter your current password.' });
    return false;
  }
  if (!(await bcrypt.compare(password, req.user.passwordHash))) {
    audit('account.reauth.fail', { req, userId: req.user.id, throttleKey: 'reauth:' + req.user.id, throttleMs: 5000 });
    res.status(403).json({ error: BAD_PASSWORD });
    return false;
  }
  return true;
}

router.get('/', (req, res) => res.json({ account: profile(req.user, req) }));

// Correct personal information (PIPEDA accuracy principle). Changing the email address
// is deliberately not offered here: it needs ownership verification of the new address.
router.patch('/', (req, res) => {
  const { name } = req.body || {};
  if (!validName(name)) return res.status(400).json({ error: 'Enter a name (1-60 characters, no control characters).' });
  req.user.name = cleanName(name, 60);
  save();
  audit('account.update', { req, userId: req.user.id, detail: { field: 'name' } });
  res.json({ account: profile(req.user, req) });
});

router.post('/password', sensitiveLimiter, async (req, res, next) => {
  try {
    if (!(await reauth(req, res))) return;
    const { newPassword } = req.body;
    const weak = checkPassword(newPassword, { email: req.user.email, name: req.user.name });
    if (weak) return res.status(400).json({ error: weak });
    if (req.user.passwordHash && await bcrypt.compare(newPassword, req.user.passwordHash)) {
      return res.status(400).json({ error: 'Choose a password you have not used on this account.' });
    }
    const firstPassword = !req.user.passwordHash;
    req.user.passwordHash = await bcrypt.hash(newPassword, 11);
    req.user.failedLogins = 0; req.user.lockedUntil = 0;
    req.user.passwordChangedAt = Date.now();
    // Every other device is signed out: a stolen session must not survive a password change.
    const signedOut = revokeSessions(req.user.id, req.sessionKey);
    save();
    audit(firstPassword ? 'password.set' : 'password.change', { req, userId: req.user.id, detail: { otherSessionsRevoked: signedOut } });
    res.json({ ok: true, otherSessionsRevoked: signedOut, firstPassword });
  } catch (err) { next(err); }
});

router.get('/sessions', (req, res) => {
  res.json({ sessions: listSessions(req.user.id, req.sessionKey) });
});

router.post('/sessions/revoke-others', (req, res) => {
  const n = revokeSessions(req.user.id, req.sessionKey);
  audit('session.revoke-others', { req, userId: req.user.id, detail: { count: n } });
  res.json({ ok: true, revoked: n });
});

router.delete('/sessions/:id', (req, res) => {
  if (!revokeSessionById(req.user.id, req.params.id)) return res.status(404).json({ error: 'Session not found.' });
  audit('session.revoke', { req, userId: req.user.id });
  res.json({ ok: true });
});

// ---------- two-step sign-in (authenticator app) ----------
const BAD_CODE = 'That code is not right. Check your authenticator app and try again.';
const badCode = res => res.status(400).json({ error: BAD_CODE, code: 'mfa_invalid' });
const mfaRequiredByOperator = () => process.env.TOOLKIT_REQUIRE_MFA === '1';

router.post('/mfa/setup', sensitiveLimiter, async (req, res, next) => {
  try {
    if (!(await reauth(req, res))) return;
    if (req.user.mfa && req.user.mfa.enabled) return res.status(409).json({ error: 'Two-step sign-in is already on.', code: 'mfa_already_enabled' });
    const secret = mfa.beginEnrolment(req.user);
    const uri = mfa.otpauthUri(req.user.email, secret);
    res.json({ secret: mfa.groupSecret(secret), otpauthUri: uri, qr: qr.encode(uri) });
  } catch (err) { next(err); }
});

router.post('/mfa/enable', sensitiveLimiter, (req, res) => {
  const u = req.user;
  const pending = mfa.livePending(u);
  if (!pending) return res.status(409).json({ error: 'Start setup again to get a new code.', code: 'mfa_no_setup' });
  const step = mfa.verifyTotp(pending.secret, req.body && req.body.code);
  if (step === null) {
    pending.attempts = (pending.attempts || 0) + 1;
    if (pending.attempts >= mfa.PENDING_ATTEMPTS) delete u.mfaPending;
    save();
    audit('mfa.fail', { req, userId: u.id, detail: { stage: 'enable' }, throttleKey: 'mfe:' + u.id, throttleMs: 2000 });
    return badCode(res);
  }
  const recovery = mfa.newRecoverySet(u.id);
  u.mfa = { enabled: true, secret: pending.secret, enrolledAt: Date.now(), lastStep: step, recovery: recovery.records };
  delete u.mfaPending;
  const revoked = revokeSessions(u.id, req.sessionKey);
  if (db.sessions[req.sessionKey]) delete db.sessions[req.sessionKey].mfaSetup;
  save();
  audit('mfa.enable', { req, userId: u.id, detail: { otherSessionsRevoked: revoked } });
  res.json({ recoveryCodes: recovery.codes, otherSessionsRevoked: revoked });
});

router.post('/mfa/disable', sensitiveLimiter, async (req, res, next) => {
  try {
    if (mfaRequiredByOperator()) return res.status(403).json({ error: 'This server requires two-step sign-in, so it cannot be turned off.', code: 'mfa_required' });
    if (!(await reauth(req, res))) return;
    if (!req.user.mfa || !req.user.mfa.enabled) return res.status(409).json({ error: 'Two-step sign-in is not on.', code: 'mfa_not_enabled' });
    const code = req.body && req.body.code;
    if (typeof code !== 'string' || code.length > 40 || !mfa.checkUserCode(req.user, code).ok) {
      audit('mfa.fail', { req, userId: req.user.id, detail: { stage: 'disable' }, throttleKey: 'mfd:' + req.user.id, throttleMs: 2000 });
      return badCode(res);
    }
    delete req.user.mfa;
    delete req.user.mfaPending;
    save();
    audit('mfa.disable', { req, userId: req.user.id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/mfa/recovery-codes', sensitiveLimiter, async (req, res, next) => {
  try {
    if (!(await reauth(req, res))) return;
    if (!req.user.mfa || !req.user.mfa.enabled) return res.status(409).json({ error: 'Two-step sign-in is not on.', code: 'mfa_not_enabled' });
    const code = req.body && req.body.code;
    if (typeof code !== 'string' || code.length > 40 || !mfa.checkUserCode(req.user, code, { allowRecovery: false }).ok) {
      audit('mfa.fail', { req, userId: req.user.id, detail: { stage: 'recovery-codes' }, throttleKey: 'mfr:' + req.user.id, throttleMs: 2000 });
      return badCode(res);
    }
    const recovery = mfa.newRecoverySet(req.user.id);
    req.user.mfa.recovery = recovery.records;
    save();
    audit('mfa.recovery-regenerated', { req, userId: req.user.id });
    res.json({ recoveryCodes: recovery.codes });
  } catch (err) { next(err); }
});

// Everything the service holds about the account, as a downloadable JSON file. Records are
// written one at a time so a large account never needs a second copy in memory.
router.get('/export', sensitiveLimiter, (req, res) => {
  const u = req.user;
  audit('account.export', { req, userId: u.id });
  res.set({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': 'attachment; filename="toolkit-account-export.json"',
    'Cache-Control': 'no-store',
  });
  const { passwordHash, failedLogins, lockedUntil, verify, reset, mfa: mfaRecord, mfaPending, ...safeUser } = u;   // credentials, the authenticator secret, recovery hashes and pending tokens are never exported
  safeUser.mfa = { enabled: !!(mfaRecord && mfaRecord.enabled), enrolledAt: (mfaRecord && mfaRecord.enrolledAt) || null };
  safeUser.signInMethods = [u.passwordHash && 'password', u.googleSub && 'google'].filter(Boolean);
  res.write('{"exportedAt":' + JSON.stringify(new Date().toISOString()));
  res.write(',"account":' + JSON.stringify(safeUser));
  res.write(',"sessions":' + JSON.stringify(listSessions(u.id, req.sessionKey)));
  res.write(',"activity":' + JSON.stringify(eventsFor(u.id)));
  for (const [collection, app] of COLLECTIONS) {
    res.write(`,"${collection}":[`);
    let first = true;
    for (const rec of db[collection]) {
      if (rec.ownerId !== u.id) continue;
      const { ownerId, ...owned } = rec;
      res.write((first ? '' : ',') + JSON.stringify({ app, ...owned }));
      first = false;
    }
    res.write(']');
  }
  res.end('}');
});

// Erasure: removes the account, every document it owns and all of its sessions. A
// security-log entry (user id and time only, no content) is retained for the audit period.
router.delete('/', sensitiveLimiter, async (req, res, next) => {
  try {
    if (req.body.confirm !== 'DELETE') return res.status(400).json({ error: 'Type DELETE to confirm.' });
    if (!(await reauth(req, res))) return;
    const id = req.user.id;
    const removed = {};
    for (const [c] of COLLECTIONS) {
      removed[c] = db[c].filter(r => r.ownerId === id).length;
      db[c] = db[c].filter(r => r.ownerId !== id);
    }
    for (const k of Object.keys(db.sessions)) if (db.sessions[k].userId === id) delete db.sessions[k];
    db.users = db.users.filter(u => u.id !== id);
    audit('account.delete', { req, userId: id, detail: removed });
    destroySession(req, res);
    eraseDurably();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
