// Account self-service: profile, password change, session management, data export
// (right of access / portability) and account deletion (right to erasure). Every
// action that changes credentials or removes data requires the current password.
const express = require('express');
const bcrypt = require('bcryptjs');
const { db, save, eraseDurably } = require('./store');
const {
  requireAuth, sensitiveLimiter, listSessions, revokeSessions, revokeSessionById,
  destroySession, currentSessionKey, validName,
} = require('./security');
const { checkPassword } = require('./passwords');
const { usage, limitBytes } = require('./quota');
const { audit, eventsFor } = require('./audit');
const { cleanName } = require('./validation');
const { PRIVACY_VERSION } = require('./policy');

const router = express.Router();
router.use(requireAuth);

const COLLECTIONS = [['projects', 'sigma'], ['paintings', 'pigment'], ['images', 'imagevendor']];
const BAD_PASSWORD = 'Your current password is incorrect.';

function profile(u) {
  const counts = {};
  for (const [c] of COLLECTIONS) counts[c] = db[c].filter(r => r.ownerId === u.id).length;
  const limit = limitBytes();
  return {
    id: u.id, name: u.name, email: u.email, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null,
    consent: u.consent || null, currentPrivacyVersion: PRIVACY_VERSION,
    storage: { usedBytes: usage(u.id), limitBytes: Number.isFinite(limit) ? limit : null, counts },
  };
}

async function reauth(req, res) {
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

router.get('/', (req, res) => res.json({ account: profile(req.user) }));

// Correct personal information (PIPEDA accuracy principle). Changing the email address
// is deliberately not offered here: it needs ownership verification of the new address.
router.patch('/', (req, res) => {
  const { name } = req.body || {};
  if (!validName(name)) return res.status(400).json({ error: 'Enter a name (1-60 characters, no control characters).' });
  req.user.name = cleanName(name, 60);
  save();
  audit('account.update', { req, userId: req.user.id, detail: { field: 'name' } });
  res.json({ account: profile(req.user) });
});

router.post('/password', sensitiveLimiter, async (req, res, next) => {
  try {
    if (!(await reauth(req, res))) return;
    const { newPassword } = req.body;
    const weak = checkPassword(newPassword, { email: req.user.email, name: req.user.name });
    if (weak) return res.status(400).json({ error: weak });
    if (await bcrypt.compare(newPassword, req.user.passwordHash)) {
      return res.status(400).json({ error: 'Choose a password you have not used on this account.' });
    }
    req.user.passwordHash = await bcrypt.hash(newPassword, 11);
    req.user.failedLogins = 0; req.user.lockedUntil = 0;
    req.user.passwordChangedAt = Date.now();
    // Every other device is signed out: a stolen session must not survive a password change.
    const signedOut = revokeSessions(req.user.id, req.sessionKey);
    save();
    audit('password.change', { req, userId: req.user.id, detail: { otherSessionsRevoked: signedOut } });
    res.json({ ok: true, otherSessionsRevoked: signedOut });
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
  const { passwordHash, failedLogins, lockedUntil, verify, reset, ...safeUser } = u;   // credentials and pending tokens are never exported
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
