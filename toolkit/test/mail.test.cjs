// Email confirmation codes and password reset, with a fake mail transport (nothing is ever sent).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-mail-'));
process.env.TOOLKIT_DATA_DIR = temp;
process.env.TOOLKIT_EMAIL_DNS_CHECK = 'off';
delete process.env.TOOLKIT_EMAIL_VERIFICATION;            // the real default: verification required
delete process.env.TOOLKIT_SMTP_URL;
const mailer = require('../server/mailer');
const outbox = [];
const app = require('../server/index');
const sec = require('../server/security');
const { db } = require('../server/store');

let server, base, port;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  port = server.address().port; base = `http://127.0.0.1:${port}`;
});
after(async () => { await new Promise(r => server.close(r)); fs.rmSync(temp, { recursive: true, force: true }); });

function resetLimits() { for (const l of [sec.loginLimiter, sec.registerLimiter, sec.authLimiter, sec.sensitiveLimiter]) l.resetKey('127.0.0.1'); }
async function call(url, { method = 'GET', body, cookie } = {}) {
  resetLimits();
  const headers = { 'X-Requested-With': 'test' };
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null; try { data = await res.clone().json(); } catch { /* none */ }
  return { res, status: res.status, data, cookie: (res.headers.get('set-cookie') || '').split(';')[0] || null };
}
async function mailTo(address, subjectPart, since = 0) {
  for (let i = 0; i < 40; i++) {
    const m = outbox.slice(since).find(x => x.to === address && x.subject.includes(subjectPart));
    if (m) return m;
    await new Promise(r => setTimeout(r, 25));
  }
  return null;
}
const codeIn = message => /\b(\d{6})\b/.exec(message.subject)[1];
const tokenIn = message => /#token=([A-Za-z0-9_-]+)/.exec(message.text)[1];
const account = n => ({ name: 'Mail Tester', email: `mail${n}@example.com`, password: 'Violet-Harbor-Lamp-42', acceptTerms: true });
async function confirmed(n) {
  const a = account(n);
  const start = outbox.length;
  await call('/api/auth/register', { method: 'POST', body: a });
  const msg = await mailTo(a.email, 'confirmation code', start);
  const r = await call('/api/auth/verify-email', { method: 'POST', body: { email: a.email, code: codeIn(msg) } });
  assert.equal(r.status, 200);
  return { ...a, cookie: r.cookie };
}

// Must run first: no transport injected yet, so the server has no way to send mail.
test('without a mail server, sign-ups are refused instead of creating unconfirmed accounts', async () => {
  const cfg = await call('/api/auth/config');
  assert.equal(cfg.data.emailEnabled, false);
  assert.equal(cfg.data.signupsOpen, false);
  const r = await call('/api/auth/register', { method: 'POST', body: account(0) });
  assert.equal(r.status, 503);
  assert.equal(r.data.code, 'signups_paused');
  assert.equal(r.cookie, null);
  assert.equal(db.users.length, 0, 'no account is created');
  mailer.setTransport({ sendMail: async message => { outbox.push(message); } });
  assert.equal((await call('/api/auth/config')).data.signupsOpen, true);
});

test('a new account cannot be used until the emailed code is entered (fake addresses never get one)', async () => {
  const a = account(1);
  const start = outbox.length;
  const reg = await call('/api/auth/register', { method: 'POST', body: a });
  assert.equal(reg.status, 202); assert.equal(reg.data.verificationRequired, true);
  assert.equal(reg.cookie, null, 'no session before confirmation');
  const user = db.users.find(u => u.email === a.email);
  assert.equal(user.emailVerified, false);

  const msg = await mailTo(a.email, 'confirmation code', start);
  assert.ok(msg, 'code mailed');
  const code = codeIn(msg);
  assert.match(code, /^\d{6}$/);
  assert.ok(msg.text.includes(code));
  assert.equal(user.verify.hash.length, 64, 'a SHA-256 hash is stored');
  assert.ok(!Object.values(user.verify).includes(code), 'the code itself is never stored');

  // The account is useless without the code: sign-in is refused even with the right password.
  const pending = await call('/api/auth/login', { method: 'POST', body: { email: a.email, password: a.password } });
  assert.equal(pending.status, 403); assert.equal(pending.data.code, 'email_not_verified'); assert.equal(pending.cookie, null);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: a.email, password: 'wrong-password-12' } })).status, 401);

  // Wrong / malformed codes fail with one generic answer.
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
  for (const bad of [wrong, '12345', 'abcdef', 123456, '']) {
    assert.equal((await call('/api/auth/verify-email', { method: 'POST', body: { email: a.email, code: bad } })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await call('/api/auth/verify-email', { method: 'POST', body: { email: 'nobody@example.com', code } })).status, 400);
  const ok = await call('/api/auth/verify-email', { method: 'POST', body: { email: a.email, code } });
  assert.equal(ok.status, 200, 'the right code still works after a few wrong ones');
  assert.ok(ok.cookie, 'confirming signs the person in');
  assert.equal((await call('/api/auth/me', { cookie: ok.cookie })).status, 200);
  assert.equal((await call('/api/auth/verify-email', { method: 'POST', body: { email: a.email, code } })).status, 400, 'a code works once');
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: a.email, password: a.password } })).status, 200);
});

test('codes expire and are destroyed after 5 wrong guesses', async () => {
  const a = account(2);
  let start = outbox.length;
  await call('/api/auth/register', { method: 'POST', body: a });
  let code = codeIn(await mailTo(a.email, 'confirmation code', start));
  const user = db.users.find(u => u.email === a.email);
  user.verify.expires = Date.now() - 1;
  assert.equal((await call('/api/auth/verify-email', { method: 'POST', body: { email: a.email, code } })).status, 400, 'expired');

  user.verify.sentAt = 0;
  start = outbox.length;
  await call('/api/auth/resend-verification', { method: 'POST', body: { email: a.email } });
  code = codeIn(await mailTo(a.email, 'confirmation code', start));
  const wrong = String((Number(code) + 7) % 1000000).padStart(6, '0');
  for (let i = 0; i < 5; i++) await call('/api/auth/verify-email', { method: 'POST', body: { email: a.email, code: wrong } });
  const after = await call('/api/auth/verify-email', { method: 'POST', body: { email: a.email, code } });
  assert.equal(after.status, 400, 'the correct code is dead after 5 wrong guesses');
  assert.equal(user.verify, undefined);
});

test('signing in to an unconfirmed account emails a fresh code (rate limited by a cooldown)', async () => {
  const a = account(3);
  let start = outbox.length;
  await call('/api/auth/register', { method: 'POST', body: a });
  await mailTo(a.email, 'confirmation code', start);
  start = outbox.length;
  await call('/api/auth/login', { method: 'POST', body: { email: a.email, password: a.password } });
  await new Promise(r => setTimeout(r, 150));
  assert.equal(outbox.length, start, 'within the cooldown no second mail goes out');
  db.users.find(u => u.email === a.email).verify.sentAt = 0;
  await call('/api/auth/login', { method: 'POST', body: { email: a.email, password: a.password } });
  const fresh = await mailTo(a.email, 'confirmation code', start);
  assert.ok(fresh);
  assert.equal((await call('/api/auth/verify-email', { method: 'POST', body: { email: a.email, code: codeIn(fresh) } })).status, 200);
});

test('an unconfirmed sign-up cannot hold an address hostage; confirmed accounts cannot be taken over', async () => {
  // Someone registers an address they do not own; the real owner signs up later.
  const squat = { ...account(4), name: 'Squatter', password: 'Squatter-Password-99' };
  await call('/api/auth/register', { method: 'POST', body: squat });
  const owner = { ...account(4), name: 'Real Owner', password: 'Maple-Lantern-River-77' };
  const start = outbox.length;
  const r = await call('/api/auth/register', { method: 'POST', body: owner });
  assert.equal(r.status, 202);
  const code = codeIn(await mailTo(owner.email, 'confirmation code', start));
  assert.equal((await call('/api/auth/verify-email', { method: 'POST', body: { email: owner.email, code } })).status, 200);
  assert.equal(db.users.filter(u => u.email === owner.email).length, 1);
  assert.equal(db.users.find(u => u.email === owner.email).name, 'Real Owner');
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: owner.email, password: squat.password } })).status, 401, 'squatter password is gone');
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: owner.email, password: owner.password } })).status, 200);

  // Once confirmed, a new sign-up for the same address changes nothing and warns the owner.
  const before = JSON.stringify(db.users.find(u => u.email === owner.email).passwordHash);
  const start2 = outbox.length;
  const again = await call('/api/auth/register', { method: 'POST', body: { ...owner, password: 'Attacker-Password-55' } });
  assert.equal(again.status, 202, 'same answer as a new address (no enumeration)');
  assert.ok(await mailTo(owner.email, 'Someone tried', start2));
  assert.equal(JSON.stringify(db.users.find(u => u.email === owner.email).passwordHash), before);
});

test('resend and forgot answer identically for unknown addresses', async () => {
  const unknownResend = await call('/api/auth/resend-verification', { method: 'POST', body: { email: 'nobody-here@example.com' } });
  const malformed = await call('/api/auth/resend-verification', { method: 'POST', body: { email: 'not an email' } });
  assert.equal(unknownResend.status, 202); assert.deepEqual(unknownResend.data, malformed.data);
  assert.equal((await call('/api/auth/forgot', { method: 'POST', body: { email: 'nobody-here@example.com' } })).status, 202);
  assert.equal((await call('/api/auth/forgot', { method: 'POST', body: { email: 'not an email' } })).status, 202);
});

test('password reset: single-use, policy-checked, expires, signs everything out', async () => {
  const a = await confirmed(5);
  assert.equal((await call('/api/auth/me', { cookie: a.cookie })).status, 200);
  let start = outbox.length;
  assert.equal((await call('/api/auth/forgot', { method: 'POST', body: { email: a.email } })).status, 202);
  const token = tokenIn(await mailTo(a.email, 'Reset', start));
  assert.equal((await call('/api/auth/reset', { method: 'POST', body: { token, password: 'short' } })).status, 400);
  assert.equal((await call('/api/auth/reset', { method: 'POST', body: { token, password: 'Password1234!' } })).status, 400);
  const done = await call('/api/auth/reset', { method: 'POST', body: { token, password: 'Cobalt-Meadow-17' } });
  assert.equal(done.status, 200, 'the link survived the rejected attempts');
  assert.equal((await call('/api/auth/reset', { method: 'POST', body: { token, password: 'Another-Long-Password-9' } })).status, 400, 'single use');
  assert.equal((await call('/api/auth/me', { cookie: a.cookie })).status, 401, 'existing sessions are signed out');
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: a.email, password: a.password } })).status, 401);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: a.email, password: 'Cobalt-Meadow-17' } })).status, 200);
  assert.ok(await mailTo(a.email, 'password was changed', start), 'the owner is told the password changed');

  start = outbox.length;
  db.users.find(u => u.email === a.email).reset = undefined;
  await call('/api/auth/forgot', { method: 'POST', body: { email: a.email } });
  const stale = tokenIn(await mailTo(a.email, 'Reset', start));
  db.users.find(u => u.email === a.email).reset.expires = Date.now() - 1;
  assert.equal((await call('/api/auth/reset', { method: 'POST', body: { token: stale, password: 'Yet-Another-Long-Password-3' } })).status, 400);
});

test('reset links are built from the server, never from a forged Host header', async () => {
  const a = await confirmed(6);
  const start = outbox.length;
  resetLimits();
  await new Promise((resolve, reject) => {
    const raw = JSON.stringify({ email: a.email });
    const req = http.request({ hostname: '127.0.0.1', port, path: '/api/auth/forgot', method: 'POST',
      headers: { Host: 'evil.example', 'X-Requested-With': 'test', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } },
    res => { res.resume(); res.on('end', resolve); });
    req.on('error', reject); req.end(raw);
  });
  const msg = await mailTo(a.email, 'Reset', start);
  assert.ok(msg);
  assert.ok(!msg.text.includes('evil.example'), 'attacker-controlled host never appears in the link');
  assert.match(msg.text, new RegExp(`http://127\\.0\\.0\\.1:${port}/reset#token=`));
});

test('exports never contain codes or tokens; mail.json configures sending without env vars', async () => {
  const a = await confirmed(7);
  await call('/api/auth/forgot', { method: 'POST', body: { email: a.email } });
  const exp = await call('/api/account/export', { cookie: a.cookie });
  assert.ok(!/"verify"|"reset"|passwordHash/.test(JSON.stringify(exp.data)));

  // A mail.json in the data folder enables mail on its own (desktop installs).
  const { spawnSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-mailcfg-'));
  const env = { ...process.env, TOOLKIT_DATA_DIR: dir, TOOLKIT_SMTP_URL: '' };
  const probe = "console.log(require('./server/mailer').configured())";
  const run = () => spawnSync(process.execPath, ['-e', probe], { cwd: path.join(__dirname, '..'), env, encoding: 'utf8' }).stdout.trim();
  assert.equal(run(), 'false');
  fs.writeFileSync(path.join(dir, 'mail.json'), JSON.stringify({ smtpUrl: 'smtp://localhost:2525', from: 'Toolkit <a@example.org>' }));
  assert.equal(run(), 'true');
  fs.writeFileSync(path.join(dir, 'mail.json'), '{ not json');
  assert.equal(run(), 'false', 'a broken file just means "not configured"');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('never-confirmed sign-ups are purged after 7 days', async () => {
  const a = account(8);
  await call('/api/auth/register', { method: 'POST', body: a });
  const u = db.users.find(x => x.email === a.email);
  u.createdAt = Date.now() - 8 * 24 * 3600 * 1000;
  // Re-signing up resets the clock; simulate the hourly sweep directly instead.
  const auth = require('../server/auth');
  assert.equal(typeof auth.purgeUnverified, 'function');
  auth.purgeUnverified();
  assert.equal(db.users.some(x => x.email === a.email), false);
  assert.ok(db.users.some(x => x.email === account(1).email), 'confirmed accounts are untouched');
});
