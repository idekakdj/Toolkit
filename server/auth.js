// Authentication routes: register, login, logout, current user.
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, save } = require('./store');
const {
  createSession, destroySession, requireAuth, authLimiter,
  loginLocked, recordLoginFailure, recordLoginSuccess,
  validEmail, validName, validPassword,
} = require('./security');

const router = express.Router();

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email };
}

router.post('/register', authLimiter, (req, res) => {
  const { name, email, password } = req.body || {};
  if (!validName(name)) return res.status(400).json({ error: 'Enter a name (1-60 characters).' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!validPassword(password)) {
    return res.status(400).json({ error: 'Password must be 8-128 characters.' });
  }
  const normalized = email.trim().toLowerCase();
  if (db.users.some(u => u.email === normalized)) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }
  const user = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: normalized,
    passwordHash: bcrypt.hashSync(password, 11),
    createdAt: Date.now(),
    failedLogins: 0,
    lockedUntil: 0,
  };
  db.users.push(user);
  save();
  createSession(res, user.id);
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', authLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const user = db.users.find(u => u.email === email.trim().toLowerCase());
  // Always run a hash comparison so response timing doesn't reveal
  // whether the account exists.
  const hash = user ? user.passwordHash
    : '$2a$11$0123456789012345678901uVRPLWnsv3yJpEqzbqxPlmIzGQzWyt6';
  const ok = bcrypt.compareSync(password, hash);
  if (user && loginLocked(user)) {
    return res.status(429).json({ error: 'Account temporarily locked after too many attempts. Try again later.' });
  }
  if (!user || !ok) {
    if (user) recordLoginFailure(user);
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  recordLoginSuccess(user);
  createSession(res, user.id);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
