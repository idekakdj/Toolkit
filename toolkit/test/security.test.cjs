// Security regression suite: every control added in the security hardening pass.
// Uses an isolated temporary data directory; never touches real accounts or artwork.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-security-'));
process.env.TOOLKIT_DATA_DIR = temp;
process.env.TOOLKIT_EMAIL_DNS_CHECK = 'off';       // DNS behaviour is unit-tested with a fake resolver below
process.env.TOOLKIT_EMAIL_VERIFICATION = 'off'; // these suites test other features; verification has its own suite (mail.test.cjs)
const app = require('../server/index');
const sec = require('../server/security');
const { db } = require('../server/store');
const { normalizeEmail, checkDomain } = require('../server/email-check');
const { checkPassword } = require('../server/passwords');
const { sniffRaster, validThumbnail } = require('../server/validation');
const audit = require('../server/audit');

let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(r => server.close(r)); fs.rmSync(temp, { recursive: true, force: true }); });

// Each test starts with empty rate-limit buckets so tests cannot starve one another.
function resetLimits(extra = []) {
  for (const l of [sec.loginLimiter, sec.registerLimiter, sec.authLimiter, sec.sensitiveLimiter, sec.apiLimiter, sec.writeLimiter, sec.pageLimiter]) {
    l.resetKey('127.0.0.1');
    for (const k of extra) l.resetKey(k);
  }
}
async function call(url, { method = 'GET', body, cookie, headers = {} } = {}) {
  const h = { 'X-Requested-With': 'test', ...headers };
  if (cookie) h.Cookie = cookie;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers: h, redirect: 'manual', body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  let data = null; try { data = await res.clone().json(); } catch { /* not JSON */ }
  return { res, status: res.status, data };
}
let counter = 0;
async function register(extra = {}, { keepLimits = false } = {}) {
  if (!keepLimits) resetLimits();
  const n = ++counter;
  const account = { name: 'Sec Tester', email: `sec${n}@example.com`, password: 'Violet-Harbor-Lamp-42', acceptTerms: true, ...extra };
  const r = await call('/api/auth/register', { method: 'POST', body: account });
  const cookie = r.res.headers.get('set-cookie') ? r.res.headers.get('set-cookie').split(';')[0] : null;
  return { ...r, account, cookie };
}

// ---------------------------------------------------------------- email validation
test('email syntax: the addresses that used to be accepted are rejected', () => {
  for (const bad of ['a@..com', 'x@y.zz.', 'bad@-.-x', 'a@b.c1', 'a@b..com', 'jo@exa_mple.com', 'a@1.2.3.4', 'user@localhost',
    'user@host.invalid', 'a@b.test', 'a@b.local', '"quoted"@example.com', 'two@@example.com', 'sp ace@example.com', '@example.com',
    'user@', 'user@.com', 'user@com', '.lead@example.com', 'trail.@example.com', 'dou..ble@example.com', 'a@b.c', 'a@-bad.com',
    'a@bad-.com', 'a@exa mple.com', 'a@example.com\nBcc: victim@example.org', 'a\r\nSubject: x@example.com', 'a\u0000@example.com', 'a@example\u202e.com', `${'x'.repeat(65)}@example.com`,
    `a@${'x'.repeat(64)}.com`, `a@${'x.'.repeat(130)}com`, '', null, undefined, 42, {}, ['a@example.com']]) {
    assert.equal(normalizeEmail(bad).ok, false, `should reject ${JSON.stringify(bad)}`);
  }
});
test('email syntax: legitimate addresses are accepted and canonicalised', () => {
  assert.equal(normalizeEmail('  Jane.Doe+tag@Example.COM ').email, 'jane.doe+tag@example.com');
  assert.equal(normalizeEmail("o'brien@example.co.uk").ok, true);
  assert.equal(normalizeEmail('a_b-c@sub.domain.example.org').ok, true);
  assert.equal(normalizeEmail('user@bücher.de').email, 'user@xn--bcher-kva.de');   // punycode, one canonical spelling
  assert.equal(normalizeEmail('user@xn--bcher-kva.de').ok, true);
  assert.equal(normalizeEmail('a@example.com\n').email, 'a@example.com', 'surrounding whitespace is trimmed, never stored');
});

test('domain deliverability: definitive failures reject, transient resolver trouble never blocks signup', async () => {
  const err = code => Object.assign(new Error(code), { code });
  const mk = (mx, a4, a6) => ({
    resolveMx: async () => { if (mx instanceof Error) throw mx; return mx; },
    resolve4: async () => { if (a4 instanceof Error) throw a4; return a4; },
    resolve6: async () => { if (a6 instanceof Error) throw a6; return a6; },
  });
  assert.equal(await checkDomain('good1.example', { resolver: mk([{ exchange: 'mx.good1.example', priority: 10 }]) }), 'ok');
  assert.equal(await checkDomain('nx.example', { resolver: mk(err('ENOTFOUND'), err('ENOTFOUND'), err('ENOTFOUND')) }), 'undeliverable');
  assert.equal(await checkDomain('nomx.example', { resolver: mk(err('ENODATA'), err('ENODATA'), err('ENODATA')) }), 'undeliverable');
  assert.equal(await checkDomain('nullmx.example', { resolver: mk([{ exchange: '', priority: 0 }]) }), 'undeliverable');   // RFC 7505
  assert.equal(await checkDomain('implicit.example', { resolver: mk(err('ENODATA'), ['192.0.2.1'], err('ENODATA')) }), 'ok'); // RFC 5321 5.1
  assert.equal(await checkDomain('offline.example', { resolver: mk(err('ECONNREFUSED'), [], []) }), 'unknown');
  assert.equal(await checkDomain('servfail.example', { resolver: mk(err('ESERVFAIL'), [], []) }), 'unknown');
  const slow = { resolveMx: () => new Promise(() => {}), resolve4: () => new Promise(() => {}), resolve6: () => new Promise(() => {}) };
  assert.equal(await checkDomain('slow.example', { resolver: slow, timeoutMs: 50 }), 'unknown');
});

test('registration enforces email validity, consent and password policy', async () => {
  resetLimits();
  const bad = await register({ email: 'a@..com' });
  assert.equal(bad.status, 400); assert.ok(bad.data.error);
  assert.equal((await register({ email: 'x@y.invalid' })).status, 400);
  assert.equal((await register({ acceptTerms: undefined })).status, 400, 'consent is required');
  assert.equal((await register({ acceptTerms: 'yes' })).status, 400, 'consent must be literally true');
  assert.equal((await register({ password: 'short' })).status, 400);
  assert.equal((await register({ password: 'Password1234!' })).status, 400, 'common password with decoration');
  assert.equal((await register({ name: 'Bad\u0000Name' })).status, 400);
  assert.equal((await register({ name: '' })).status, 400);
  const ok = await register();
  assert.equal(ok.status, 201);
  assert.ok(ok.cookie);
  const stored = db.users.find(u => u.email === ok.account.email);
  assert.equal(typeof stored.consent.version, 'string');
  assert.ok(stored.consent.at > 0);
  assert.equal((await register({ email: ok.account.email })).status, 409);
  assert.equal((await register({ email: ok.account.email.toUpperCase() })).status, 409, 'case-insensitive uniqueness');
});

// ---------------------------------------------------------------- passwords
test('password policy: length, 72-byte bcrypt limit, common/derived passwords', () => {
  assert.equal(checkPassword('Violet-Harbor-Lamp-42', { email: 'a@example.com', name: 'A' }), null);
  assert.match(checkPassword('short1!'), /at least 10/);
  assert.match(checkPassword('a'.repeat(73)), /too long|repetitive/);
  assert.match(checkPassword('é'.repeat(40)), /too long|repetitive/);                       // 80 bytes
  assert.equal(checkPassword('Tr0ub4dor&3-horse-battery', {}), null);
  for (const weak of ['password1234', 'Password1234!', 'qwertyuiop12', '123456789012', 'aaaaaaaaaaaa', 'abcdefghijkl', 'iloveyou1234', 'letmein12345']) {
    assert.ok(checkPassword(weak), `should reject ${weak}`);
  }
  assert.match(checkPassword('Jessica-Rocks-2024', { email: 'jessica@example.com' }), /email/);
  assert.match(checkPassword('My-Name-Is-Alexander-1', { name: 'Alexander Hamilton' }), /name/);
  assert.ok(checkPassword('x'.repeat(12) + '\u0000'));
});

test('password policy: "Strong" means 10+ characters with a capital letter, a number and a symbol', async () => {
  assert.equal(checkPassword('Kite!Pond7'), null, 'exactly 10 characters meeting every rule');
  assert.match(checkPassword('Kite!Pond'), /at least 10/);
  assert.match(checkPassword('violet-harbor-lamp-42'), /capital/);
  assert.match(checkPassword('Violet-Harbor-Lamp'), /number/);
  assert.match(checkPassword('VioletHarbor42'), /symbol/);
  assert.match(checkPassword('Violet Harbor 42'), /symbol/, 'a space is not a symbol');
  // The browser meter uses the same rules, so it can never call a refused password "Strong".
  // (package.json is CommonJS, so the browser's ES module is loaded from its source.)
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'password-strength.js'), 'utf8');
  const { assess, weakReason } = await import('data:text/javascript,' + encodeURIComponent(source));
  for (const p of ['Kite!Pond7', 'Kite!Pond', 'violet-harbor-lamp-42', 'Violet-Harbor-Lamp', 'VioletHarbor42', 'Violet Harbor 42', 'Tr0ub4dor&3-horse-battery', 'short1!']) {
    const server = checkPassword(p);
    const meterRefuses = !!weakReason(p);
    if (meterRefuses) assert.ok(server, `server must refuse what the meter refuses: ${p}`);
    if (assess(p).strong) assert.ok(!server || !/at least|capital|number|symbol/.test(server), `server agrees on character rules: ${p}`);
  }
  assert.equal(assess('Kite!Pond7').label, 'Strong');
  assert.equal(assess('kitepond').score, 0);
  assert.equal(assess('Kitepond').score, 1);
});

// ---------------------------------------------------------------- email providers
test('sign-up addresses must be real mailboxes at established providers', async () => {
  const { checkSignupAddress } = require('../server/email-check');
  const err = code => Object.assign(new Error(code), { code });
  const dns = (mx, a4 = err('ENODATA')) => ({
    resolveMx: async () => { if (mx instanceof Error) throw mx; return mx.map(exchange => ({ exchange, priority: 10 })); },
    resolve4: async () => { if (a4 instanceof Error) throw a4; return a4; },
    resolve6: async () => { throw err('ENODATA'); },
  });
  const check = (email, mx, extra = {}) => checkSignupAddress(normalizeEmail(email), { resolver: dns(mx), dnsEnabled: true, strict: true, ...extra });
  // Well-known providers and their country editions.
  assert.equal((await check('ann@gmail.com', ['gmail-smtp-in.l.google.com'])).ok, true);
  assert.equal((await check('ann@hotmail.co.uk', ['eur.olc.protection.outlook.com'])).ok, true);
  assert.equal((await check('ann@proton.me', ['mail.protonmail.ch'])).ok, true);
  // Custom domains whose mail is run by an established host (Workspace, Microsoft 365, Zoho).
  assert.equal((await check('ann@acme-widgets-test.com', ['aspmx.l.google.com'])).ok, true);
  assert.equal((await check('ann@contoso-test.com', ['contoso-test-com.mail.protection.outlook.com.'])).ok, true);
  assert.equal((await check('ann@zoho-shop-test.com', ['mx.zoho.com'])).ok, true);
  // Schools and governments.
  assert.equal((await check('ann@uni-test.edu', ['mx.uni-test.edu'])).ok, true);
  assert.equal((await check('ann@dept.cam-test.ac.uk', ['mx.cam-test.ac.uk'])).ok, true);
  // Disposable inboxes, by domain or by where their mail goes.
  for (const email of ['ann@mailinator.com', 'ann@yopmail.com', 'ann@inbox.guerrillamail.com', 'ann@10minutemail.com']) {
    const r = await check(email, ['mx.example.net']);
    assert.equal(r.code, 'disposable', email);
  }
  assert.equal((await check('ann@burner-test.com', ['mail.mailinator.com'])).code, 'disposable');
  assert.equal((await check('ann@burner2-test.com', ['mail.mailinator.com'], { strict: false })).code, 'disposable', 'refused even when the provider list is off');
  // Typos of the big providers come back with a fix.
  const typo = await check('Ann.Lee@gmial.com', []);
  assert.equal(typo.code, 'typo');
  assert.equal(typo.suggestion, 'ann.lee@gmail.com');
  assert.match(typo.reason, /did you mean ann\.lee@gmail\.com/);
  assert.equal((await check('ann@hotmail.cm', [])).suggestion, 'ann@hotmail.com');
  // Deliverable but not run by a recognised provider.
  assert.equal((await check('ann@selfhosted-test.com', ['mail.selfhosted-test.com'])).code, 'unrecognised');
  assert.equal((await check('ann@aonly-test.com', err('ENODATA'), { resolver: dns(err('ENODATA'), ['192.0.2.7']) })).code, 'unrecognised');
  assert.equal((await check('ann@selfhosted2-test.com', ['mail.selfhosted2-test.com'], { strict: false })).ok, true, 'TOOLKIT_EMAIL_PROVIDER_CHECK=off accepts it');
  // Cannot receive mail at all.
  assert.equal((await check('ann@nowhere-test.com', err('ENOTFOUND'), { resolver: dns(err('ENOTFOUND'), err('ENOTFOUND')) })).code, 'undeliverable');
  // A DNS outage never blocks: the emailed code is still the real proof.
  assert.equal((await check('ann@offline-test.com', err('ETIMEOUT'))).ok, true);
  assert.equal((await check('ann@nodns-test.com', [], { dnsEnabled: false })).ok, true);
});

test('registration refuses disposable and mistyped addresses and checks the repeated password', async () => {
  resetLimits();
  const disposable = await register({ email: 'someone@mailinator.com' });
  assert.equal(disposable.status, 400);
  assert.equal(disposable.data.code, 'email_disposable');
  assert.equal(disposable.data.field, 'email');
  const typo = await register({ email: 'someone@gmial.com' });
  assert.equal(typo.status, 400);
  assert.equal(typo.data.suggestion, 'someone@gmail.com');
  const mismatch = await register({ confirmPassword: 'Violet-Harbor-Lamp-43' });
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.data.field, 'confirm');
  assert.equal((await register({ confirmPassword: 'Violet-Harbor-Lamp-42' })).status, 201);
});

test('fixing typos never uses up the sign-up limit; only real sign-ups count', async () => {
  resetLimits();
  for (let i = 0; i < 15; i++) {
    assert.equal((await register({ password: 'weak' }, { keepLimits: true })).status, 400, 'validation failures are not throttled');
  }
  assert.equal((await register({}, { keepLimits: true })).status, 201);
});

test('logins use the same address normalisation as sign-up (internationalised domains)', async () => {
  resetLimits();
  const idn = 'idn@b' + String.fromCharCode(0xfc) + 'cher.de';        // the Unicode spelling of xn--bcher-kva.de
  const r = await register({ email: idn });
  assert.equal(r.status, 201);
  assert.ok(db.users.some(u => u.email === 'idn@xn--bcher-kva.de'), 'stored in punycode');
  const login = await call('/api/auth/login', { method: 'POST', body: { email: idn.toUpperCase().replace('XN--', 'xn--'), password: r.account.password } });
  assert.equal(login.status, 200, 'the Unicode spelling signs in');
});

// ---------------------------------------------------------------- secrets
test('secrets in toolkit/.env are never committed, packaged or served', async () => {
  const repo = path.join(__dirname, '..', '..');
  const git = spawnSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' });
  if (git.status === 0) {
    const envFiles = git.stdout.split('\n').filter(f => /(^|\/)(\.env(\.[^/]*)?|[^/]+\.env)$/.test(f) && !/\.env\.example$|toolkit\.env\.example$/.test(f));
    assert.deepEqual(envFiles, [], 'no .env file is tracked by git');
    assert.equal(spawnSync('git', ['check-ignore', '-q', 'toolkit/.env'], { cwd: repo }).status, 0, 'toolkit/.env is git-ignored');
  }
  const builder = require('../desktop/builder.cjs');
  assert.ok(!JSON.stringify(builder.files).includes('.env'), 'the desktop installer does not pack .env');
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'public', '.env')), 'nothing secret sits in a served folder');
  for (const p of ['/.env', '/toolkit/.env', '/%2e%2e/.env', '/sigma/.env', '/pigment/.env', '/css/%2e%2e/%2e%2e/.env', '/.env.example']) {
    const r = await call(p);
    assert.notEqual(r.status, 200, p + ' is not served');
  }
  // The loader never overrides the real environment and skips empty values.
  const { loadEnvFile } = require('../server/env-file');
  const file = path.join(temp, 'test.env');
  fs.writeFileSync(file, 'TOOLKIT_TEST_A=from-file\nTOOLKIT_TEST_B=from-file\nTOOLKIT_TEST_C=\n# comment\n');
  process.env.TOOLKIT_TEST_B = 'from-env';
  try {
    const loaded = loadEnvFile(file);
    assert.equal(loaded.loaded, true);
    assert.equal(process.env.TOOLKIT_TEST_A, 'from-file');
    assert.equal(process.env.TOOLKIT_TEST_B, 'from-env');
    assert.equal(process.env.TOOLKIT_TEST_C, undefined);
    assert.equal(loadEnvFile(path.join(temp, 'missing.env')).loaded, false);
  } finally { for (const k of ['TOOLKIT_TEST_A', 'TOOLKIT_TEST_B', 'TOOLKIT_TEST_C']) delete process.env[k]; }
});

test('a password is verified in full: bytes beyond bcrypt\'s 72-byte limit can no longer be ignored', async () => {
  resetLimits();
  const long = 'A'.repeat(73) + 'tail';
  assert.equal((await register({ password: long })).status, 400);           // refused instead of silently truncated
  const exactly72 = 'Zq9-' + 'x7'.repeat(34);                              // 72 bytes
  assert.equal(Buffer.byteLength(exactly72), 72);
  assert.equal((await register({ password: exactly72 })).status, 201);
});

// ---------------------------------------------------------------- login behaviour
test('login failures are indistinguishable (no account enumeration) and lockout holds', async () => {
  resetLimits();
  const { account } = await register();
  const unknown = await call('/api/auth/login', { method: 'POST', body: { email: 'nobody-here@example.com', password: 'wrong-password-1' } });
  const wrong = await call('/api/auth/login', { method: 'POST', body: { email: account.email, password: 'wrong-password-1' } });
  assert.equal(unknown.status, 401); assert.equal(wrong.status, 401);
  assert.deepEqual(unknown.data, wrong.data, 'unknown email and wrong password return the same response');
  for (let i = 0; i < 5; i++) await call('/api/auth/login', { method: 'POST', body: { email: account.email, password: 'wrong-password-' + i } });
  resetLimits();
  const locked = await call('/api/auth/login', { method: 'POST', body: { email: account.email, password: account.password } });
  assert.equal(locked.status, 401, 'correct password is refused while locked');
  assert.deepEqual(locked.data, unknown.data, 'locked accounts look like any other failure');
  assert.equal(locked.res.headers.get('set-cookie'), null);
  // The lock expires.
  db.users.find(u => u.email === account.email).lockedUntil = Date.now() - 1;
  const after = await call('/api/auth/login', { method: 'POST', body: { email: account.email, password: account.password } });
  assert.equal(after.status, 200);
});

test('failed sign-ins are rate limited per client, successful ones never are', async () => {
  resetLimits();
  const { account } = await register();
  for (let i = 0; i < 6; i++) assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: account.email, password: account.password } })).status, 200, 'successes are not throttled');
  let limited = 0;
  for (let i = 0; i < 14; i++) {
    const r = await call('/api/auth/login', { method: 'POST', body: { email: `ghost${i}@example.com`, password: 'wrong-password-1' } });
    if (r.status === 429) { limited++; assert.ok(r.res.headers.get('ratelimit') || r.res.headers.get('ratelimit-policy')); }
  }
  assert.ok(limited >= 3, `expected the limiter to trip, got ${limited} rejections`);
  resetLimits();
});

test('signup attempts are rate limited', async () => {
  resetLimits();
  let tripped = false;
  for (let i = 0; i < 14; i++) {
    const r = await register({ email: `flood${i}@example.com` }, { keepLimits: true });
    if (r.status === 429) { tripped = true; break; }
  }
  assert.ok(tripped, 'registration flood must be stopped');
  resetLimits();
});

// ---------------------------------------------------------------- sessions
test('sessions: idle and absolute expiry, fixation protection, revocation on password change', async () => {
  resetLimits();
  const a = await register();
  const key = Object.keys(db.sessions).find(k => db.sessions[k].userId === db.users.find(u => u.email === a.account.email).id);
  assert.equal((await call('/api/auth/me', { cookie: a.cookie })).status, 200);
  // Idle timeout.
  const sess = db.sessions[key];
  const savedLast = sess.lastSeen;
  sess.lastSeen = Date.now() - 400 * 24 * 3600 * 1000;
  assert.equal((await call('/api/auth/me', { cookie: a.cookie })).status, 401, 'idle session expired');
  assert.equal(db.sessions[key], undefined, 'expired session is deleted');
  // Absolute timeout: a session in constant use still ends.
  const b = await register();
  const keyB = Object.keys(db.sessions).find(k => db.sessions[k].userId === db.users.find(u => u.email === b.account.email).id);
  db.sessions[keyB].createdAt = Date.now() - 400 * 24 * 3600 * 1000;
  db.sessions[keyB].lastSeen = Date.now();
  assert.equal((await call('/api/auth/me', { cookie: b.cookie })).status, 401, 'absolute lifetime enforced');
  void savedLast;
  // Fixation: logging in again invalidates the previous session id and issues a new one.
  const c = await register();
  const relog = await call('/api/auth/login', { method: 'POST', cookie: c.cookie, body: { email: c.account.email, password: c.account.password } });
  const fresh = relog.res.headers.get('set-cookie').split(';')[0];
  assert.notEqual(fresh, c.cookie);
  assert.equal((await call('/api/auth/me', { cookie: c.cookie })).status, 401, 'previous session id is dead');
  assert.equal((await call('/api/auth/me', { cookie: fresh })).status, 200);
  // Cookie flags.
  assert.match(relog.res.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
});

// ---------------------------------------------------------------- account rights
test('account: password change revokes other sessions; export and erasure work', async () => {
  resetLimits();
  const a = await register();
  const second = await call('/api/auth/login', { method: 'POST', body: { email: a.account.email, password: a.account.password } });
  const otherCookie = second.res.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/account/sessions', { cookie: a.cookie })).data.sessions.length, 2);
  // Wrong current password is refused; new password must satisfy the policy.
  assert.equal((await call('/api/account/password', { method: 'POST', cookie: a.cookie, body: { currentPassword: 'nope-nope-nope', newPassword: 'Cobalt-Meadow-17' } })).status, 403);
  assert.equal((await call('/api/account/password', { method: 'POST', cookie: a.cookie, body: { currentPassword: a.account.password, newPassword: 'short' } })).status, 400);
  assert.equal((await call('/api/account/password', { method: 'POST', cookie: a.cookie, body: { currentPassword: a.account.password, newPassword: a.account.password } })).status, 400);
  const changed = await call('/api/account/password', { method: 'POST', cookie: a.cookie, body: { currentPassword: a.account.password, newPassword: 'Cobalt-Meadow-17' } });
  assert.equal(changed.status, 200); assert.equal(changed.data.otherSessionsRevoked, 1);
  assert.equal((await call('/api/auth/me', { cookie: otherCookie })).status, 401, 'other device signed out');
  assert.equal((await call('/api/auth/me', { cookie: a.cookie })).status, 200, 'current device stays signed in');
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: a.account.email, password: a.account.password } })).status, 401, 'old password dead');
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: a.account.email, password: 'Cobalt-Meadow-17' } })).status, 200);

  // Content, then export.
  const project = (await call('/api/projects', { method: 'POST', cookie: a.cookie, body: { name: 'Mine' } })).data.project;
  const exp = await call('/api/account/export', { cookie: a.cookie });
  assert.equal(exp.status, 200);
  assert.match(exp.res.headers.get('content-disposition'), /attachment/);
  const text = JSON.stringify(exp.data);
  assert.ok(exp.data.projects.some(p => p.id === project.id));
  assert.ok(!/passwordHash|\$2[aby]\$/.test(text), 'credentials are never exported');
  assert.equal(exp.data.account.email, a.account.email);
  assert.ok(Array.isArray(exp.data.activity) && exp.data.activity.some(e => e.event === 'password.change'));

  // Another user's data never leaks into the export.
  const other = await register();
  await call('/api/projects', { method: 'POST', cookie: other.cookie, body: { name: 'Not yours' } });
  const exp2 = await call('/api/account/export', { cookie: a.cookie });
  assert.ok(!JSON.stringify(exp2.data).includes('Not yours'));

  // Erasure requires re-authentication and explicit confirmation.
  assert.equal((await call('/api/account', { method: 'DELETE', cookie: a.cookie, body: { currentPassword: 'Cobalt-Meadow-17' } })).status, 400);
  assert.equal((await call('/api/account', { method: 'DELETE', cookie: a.cookie, body: { currentPassword: 'wrong-password', confirm: 'DELETE' } })).status, 403);
  const gone = await call('/api/account', { method: 'DELETE', cookie: a.cookie, body: { currentPassword: 'Cobalt-Meadow-17', confirm: 'DELETE' } });
  assert.equal(gone.status, 200);
  assert.equal(db.users.some(u => u.email === a.account.email), false);
  assert.equal(db.projects.some(p => p.id === project.id), false);
  assert.equal((await call('/api/auth/me', { cookie: a.cookie })).status, 401);
  assert.ok(db.users.some(u => u.email === other.account.email), 'other accounts are untouched');
});

// ---------------------------------------------------------------- request surface
test('internal files are not served; web assets still are', async () => {
  resetLimits();
  for (const p of ['/pigment/tests/regression.cjs', '/imagevendor/REVIEW.md', '/imagevendor/regression.cjs', '/placeholder/README.md',
    '/placeholder/tests/regression.cjs', '/pigment/tests/shapes-report.md', '/imagevendor/RESIZE-REPORT.md', '/imagevendor/REVIEW.md.',
    '/imagevendor/REVIEW.md::$DATA', '/imagevendor/review.MD', '/sigma/../sigma/AUDIT.md', '/%2e%2e/%2e%2e/etc/passwd', '/pigment/%2e%2e/package.json',
    '/.git/config', '/pigment/.env']) {
    const r = await call(p);
    assert.ok([400, 404].includes(r.status), `${p} -> ${r.status}`);
  }
  for (const p of ['/', '/pigment', '/imagevendor', '/sigma', '/placeholder/', '/css/toolkit.css', '/pigment/css/pigment.css', '/privacy', '/terms', '/css/404.css']) {
    assert.equal((await call(p)).status, 200, p);
  }
  // Unknown pages, at any depth, get the styled 404 page (absolute asset paths).
  for (const p of ['/no-such-page', '/sigma/no/such/page']) {
    const r = await call(p);
    assert.equal(r.status, 404, p);
    const html = await r.res.text();
    assert.match(html, /<h1[^>]*>\s*404/);
    assert.ok(!/(href|src)="(?!\/|#|https?:|mailto:)/.test(html), 'every link and asset path is absolute');
  }
});

test('no app relies on inline styles, which the CSP blocks', () => {
  const root = path.join(__dirname, '..', '..');
  const skip = /(^|[\\/])(node_modules|vendor|tests?|dist|docs)([\\/]|$)/;
  const files = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (skip.test(path.relative(root, p))) continue;
      if (e.isDirectory()) walk(p);
      else if (/\.(html|js|mjs)$/.test(e.name) && !/regression|report/i.test(e.name)) files.push(p);
    }
  };
  for (const d of ['toolkit/public', 'sigma/public', 'pigment', 'imagevendor', 'placeholder']) walk(path.join(root, d));
  // Strings written only into downloaded files or rendered as images are not part of the page.
  const exportOnly = new Set(['placeholder/js/converters.js', 'pigment/js/interop.js']);
  const problems = [];
  for (const f of files) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    const text = fs.readFileSync(f, 'utf8');
    if (/\.html$/.test(f) && /\sstyle\s*=|<style[\s>]/i.test(text)) problems.push(rel + ': inline style in markup');
    if (/\.m?js$/.test(f)) {
      if (/\.cssText\s*=|setAttribute\(\s*['"]style['"]/.test(text)) problems.push(rel + ': cssText or style attribute set from script');
      if (!exportOnly.has(rel) && /<[a-z][^>]*\sstyle\s*=|<style[\s>]/i.test(text)) problems.push(rel + ': inline style in generated markup');
    }
  }
  assert.ok(files.length > 30, 'found the app sources');
  assert.deepEqual(problems, []);
});

test('security headers are present on pages and API responses', async () => {
  const page = await call('/');
  for (const h of ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'strict-transport-security', 'cross-origin-opener-policy']) {
    assert.ok(page.res.headers.get(h), `missing ${h}`);
  }
  assert.match(page.res.headers.get('permissions-policy'), /camera=\(\)/);
  const csp = page.res.headers.get('content-security-policy');
  assert.ok(!csp.includes('unsafe-inline') && !csp.includes('unsafe-eval'), 'no unsafe-inline or unsafe-eval anywhere in the CSP: ' + csp);
  assert.match(csp, /(^|;)\s*style-src 'self'(;|$)/, 'styles only from this origin');
  assert.match(csp, /(^|;)\s*script-src 'self'(;|$)/, 'scripts only from this origin');
  assert.equal(page.res.headers.get('x-powered-by'), null);
  assert.equal((await call('/api/auth/me')).res.headers.get('cache-control'), 'no-store');
  const a = await register();
  const gated = await call('/pigment/app', { cookie: a.cookie });
  assert.equal(gated.status, 200);
  assert.equal(gated.res.headers.get('cache-control'), 'no-store', 'signed-in pages are never cached');
});

test('anonymous requests cannot make the server buffer large bodies; per-route limits hold', async () => {
  resetLimits();
  const big = JSON.stringify({ x: 'a'.repeat(2 * 1024 * 1024) });
  assert.equal((await call('/api/projects', { method: 'POST', body: big })).status, 401, 'auth first, body never parsed');
  assert.equal((await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'a@example.com', password: 'x'.repeat(100 * 1024) }) })).status, 413);
  const a = await register();
  assert.equal((await call('/api/account/password', { method: 'POST', cookie: a.cookie, body: JSON.stringify({ currentPassword: 'x'.repeat(100 * 1024) }) })).status, 413);
  assert.equal((await call('/api/projects', { method: 'POST', cookie: a.cookie, body: JSON.stringify({ name: 'x', pad: 'a'.repeat(11 * 1024 * 1024) }) })).status, 413);
});

test('CSRF: cross-site fetch metadata and foreign origins are refused', async () => {
  const a = await register();
  for (const headers of [{ 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }, { Origin: 'https://evil.example' }]) {
    const r = await call('/api/projects', { method: 'POST', cookie: a.cookie, body: { name: 'csrf' }, headers });
    assert.equal(r.status, 403, JSON.stringify(headers));
  }
  assert.equal((await call('/api/projects', { method: 'POST', cookie: a.cookie, body: { name: 'ok' }, headers: { 'Sec-Fetch-Site': 'same-origin' } })).status, 201);
  const noHeader = await fetch(base + '/api/projects', { method: 'POST', headers: { Cookie: a.cookie, 'Content-Type': 'application/json' }, body: '{"name":"x"}' });
  assert.equal(noHeader.status, 403);
});

test('stored names cannot contain control or bidi-override characters', async () => {
  const a = await register();
  for (const name of ['evil\u202ename', 'nul\u0000name', 'new\nline', '\u200bhidden']) {
    assert.equal((await call('/api/projects', { method: 'POST', cookie: a.cookie, body: { name } })).status, 400, JSON.stringify(name));
  }
  const ok = await call('/api/projects', { method: 'POST', cookie: a.cookie, body: { name: '  <b>Plain</b> & fine  ' } });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.project.name, '<b>Plain</b> & fine', 'markup characters are data, escaped on output by the apps');
});

// ---------------------------------------------------------------- uploads
const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const png = (w, h) => {
  const head = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.writeUInt32BE(13, 8); head.write('IHDR', 12, 'latin1'); head.writeUInt32BE(w, 16); head.writeUInt32BE(h, 20);
  return 'data:image/png;base64,' + Buffer.concat([head, Buffer.alloc(27)]).toString('base64');
};
test('raster uploads: the bytes must match the declared type, dimensions are bounded', () => {
  assert.equal(sniffRaster(PNG_1x1).mime, 'png');
  assert.equal(sniffRaster(png(640, 480)).w, 640);
  assert.equal(sniffRaster(png(20000, 10)), null, 'edge too long');
  assert.equal(sniffRaster(png(15000, 15000)), null, 'pixel budget (decompression bomb)');
  assert.equal(sniffRaster(png(0, 5)), null);
  const jpeg = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(44)]).toString('base64');
  assert.equal(sniffRaster(jpeg).mime, 'jpeg');
  const webp = 'data:image/webp;base64,' + Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(36)]).toString('base64');
  assert.equal(sniffRaster(webp).mime, 'webp');
  // Wrong content for the declared type, and non-image payloads dressed as images.
  const html = '<script>alert(1)</script>'.padEnd(48, ' ');
  for (const mime of ['png', 'jpeg', 'webp']) assert.equal(sniffRaster(`data:image/${mime};base64,` + Buffer.from(html).toString('base64')), null);
  assert.equal(sniffRaster('data:image/png;base64,' + Buffer.from('GIF89a' + 'x'.repeat(60)).toString('base64')), null, 'GIF disguised as PNG');
  assert.equal(sniffRaster('data:image/svg+xml;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64')), null);
  assert.equal(sniffRaster('data:image/png;base64,###notbase64###notbase64###notbase64###'), null);
  assert.equal(sniffRaster('javascript:alert(1)'), null);
  assert.equal(sniffRaster(42), null);
  assert.equal(validThumbnail(PNG_1x1), true);
  assert.equal(validThumbnail(png(20000, 10)), false);
  assert.equal(validThumbnail('data:image/webp;base64,' + 'A'.repeat(60)), false, 'thumbnails are PNG/JPEG only');
});

test('the server refuses disguised files in documents and thumbnails', async () => {
  const a = await register();
  const created = (await call('/api/images', { method: 'POST', cookie: a.cookie, body: { name: 'Img' } })).data.image;
  const url = '/api/images/' + created.id;
  const layer = data => ({ id: 'l1', name: 'Layer', visible: true, opacity: 1, data });
  const doc = layers => ({ version: 1, canvas: { w: 100, h: 100, bg: '#ffffff' }, layers });
  const fake = 'data:image/png;base64,' + Buffer.from('<html><script>alert(1)</script></html>'.padEnd(64, ' ')).toString('base64');
  assert.equal((await call(url, { method: 'PUT', cookie: a.cookie, body: { document: doc([layer(fake)]) } })).status, 400);
  assert.equal((await call(url, { method: 'PUT', cookie: a.cookie, body: { thumbnail: fake } })).status, 400);
  assert.equal((await call(url, { method: 'PUT', cookie: a.cookie, body: { document: doc([layer(png(30000, 30000))]) } })).status, 400);
  assert.equal((await call(url, { method: 'PUT', cookie: a.cookie, body: { document: doc([{ ...layer(PNG_1x1), name: 'n'.repeat(500) }]) } })).status, 400);
  assert.equal((await call(url, { method: 'PUT', cookie: a.cookie, body: { document: doc([layer(PNG_1x1)]), thumbnail: PNG_1x1 } })).status, 200);
});

test('storage quota stops one account from exhausting server memory', async () => {
  const a = await register();
  const prev = process.env.TOOLKIT_USER_QUOTA_MB;
  process.env.TOOLKIT_USER_QUOTA_MB = '1';
  try {
    const p = (await call('/api/projects', { method: 'POST', cookie: a.cookie, body: { name: 'Quota' } })).data.project;
    const nodes = n => Array.from({ length: n }, (_, i) => ({ id: 'n' + i, type: 'rect', x: i, y: 0, w: 10, h: 10, rotation: 0, opacity: 1, visible: true, locked: false, groupId: null, name: 'Rectangle ' + i, fill: '#ffffff', pad: 'p'.repeat(200) }));
    const doc = n => ({ version: 1, artboard: { name: 'A', w: 100, h: 100, bg: '#ffffff' }, nodes: nodes(n) });
    assert.equal((await call('/api/projects/' + p.id, { method: 'PUT', cookie: a.cookie, body: { document: doc(100) } })).status, 200);
    const over = await call('/api/projects/' + p.id, { method: 'PUT', cookie: a.cookie, body: { document: doc(5000) } });
    assert.equal(over.status, 413); assert.match(over.data.error, /quota/i);
    assert.equal((await call('/api/projects/' + p.id, { method: 'PUT', cookie: a.cookie, body: { document: doc(10) } })).status, 200, 'shrinking is always allowed');
  } finally { if (prev === undefined) delete process.env.TOOLKIT_USER_QUOTA_MB; else process.env.TOOLKIT_USER_QUOTA_MB = prev; }
});

// ---------------------------------------------------------------- authorization
test('every data route enforces ownership (no cross-account access)', async () => {
  const a = await register(), b = await register();
  for (const [collection, key] of [['projects', 'project'], ['paintings', 'painting'], ['images', 'image']]) {
    const mine = (await call('/api/' + collection, { method: 'POST', cookie: a.cookie, body: { name: 'Private' } })).data[key];
    const u = `/api/${collection}/${mine.id}`;
    assert.equal((await call(u, { cookie: b.cookie })).status, 404);
    assert.equal((await call(u, { method: 'PUT', cookie: b.cookie, body: { name: 'Hijack' } })).status, 404);
    assert.equal((await call(u, { method: 'DELETE', cookie: b.cookie })).status, 404);
    assert.equal((await call(u, { cookie: a.cookie })).data[key].name, 'Private');
    assert.ok(!(await call('/api/' + collection, { cookie: b.cookie })).data[collection].some(x => x.id === mine.id));
  }
});

// ---------------------------------------------------------------- audit trail
test('audit log records security events without secrets and detects tampering', async () => {
  const a = await register();
  await call('/api/auth/login', { method: 'POST', body: { email: a.account.email, password: 'wrong-password-zz' } });
  await call('/api/auth/logout', { method: 'POST', cookie: a.cookie });
  const files = fs.readdirSync(audit.AUDIT_DIR);
  assert.ok(files.length >= 1);
  const text = files.map(f => fs.readFileSync(path.join(audit.AUDIT_DIR, f), 'utf8')).join('');
  for (const ev of ['register', 'login.fail', 'logout']) assert.ok(text.includes(`"event":"${ev}"`), ev);
  assert.ok(!text.includes('wrong-password-zz') && !text.includes(a.account.password), 'no passwords in logs');
  assert.ok(!text.includes(a.cookie.split('=')[1]), 'no session tokens in logs');
  assert.deepEqual({ ok: audit.verify().ok }, { ok: true });
  // Edit one byte of one entry: the chain must break.
  const file = path.join(audit.AUDIT_DIR, files.sort()[0]);
  const original = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, original.replace('"event":"register"', '"event":"regxster"'));
  const broken = audit.verify();
  assert.equal(broken.ok, false); assert.match(broken.error, /chain broken/);
  fs.writeFileSync(file, original);
  assert.equal(audit.verify().ok, true);
});

// ---------------------------------------------------------------- encryption at rest
test('database encryption at rest: ciphertext on disk, wrong key refused, migration and rotation safe', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-enc-'));
  const key1 = Buffer.alloc(32, 7).toString('base64'), key2 = Buffer.alloc(32, 9).toString('base64');
  const run = (script, env) => spawnSync(process.execPath, ['-e', script], { cwd: path.join(__dirname, '..'), encoding: 'utf8', env: { ...process.env, TOOLKIT_DATA_DIR: dir, ...env } });
  const write = `const s=require('./server/store'); s.db.users.push({id:'u1',email:'secret-marker@example.com'}); s.save(); s.flush();`;
  const read = `const s=require('./server/store'); console.log(JSON.stringify(s.db.users.map(u=>u.id)));`;
  // 1. Start plaintext, then enable the key: migrates, keeps a plaintext premigration copy once.
  assert.equal(run(write, { TOOLKIT_DATA_KEY: '' }).status, 0);
  assert.ok(fs.readFileSync(path.join(dir, 'db.json'), 'utf8').includes('secret-marker'));
  const migrated = run(`const s=require('./server/store'); setTimeout(()=>{s.flush();},50); setTimeout(()=>{},400);`, { TOOLKIT_DATA_KEY: key1 });
  assert.equal(migrated.status, 0, migrated.stderr);
  const raw = fs.readFileSync(path.join(dir, 'db.json'));
  assert.equal(raw.subarray(0, 6).toString(), 'TKENC1');
  assert.ok(!raw.includes('secret-marker'), 'plaintext no longer in the database file');
  assert.ok(fs.existsSync(path.join(dir, 'db.json.premigration')));
  // 2. Reads back with the key; refuses without it or with the wrong one, never overwriting.
  assert.equal(run(read, { TOOLKIT_DATA_KEY: key1 }).stdout.trim(), '["u1"]');
  const before = fs.readFileSync(path.join(dir, 'db.json'));
  for (const env of [{ TOOLKIT_DATA_KEY: '' }, { TOOLKIT_DATA_KEY: key2 }]) {
    const r = run(read, env);
    assert.notEqual(r.status, 0); assert.match(r.stderr, /refusing to overwrite/);
  }
  assert.ok(fs.readFileSync(path.join(dir, 'db.json')).equals(before), 'file untouched after refused loads');
  // 3. Key rotation: old key as PREVIOUS, new key as current, re-encrypted under the new key.
  assert.equal(run(`const s=require('./server/store'); setTimeout(()=>{s.flush();},50); setTimeout(()=>{},400);`, { TOOLKIT_DATA_KEY: key2, TOOLKIT_DATA_KEY_PREVIOUS: key1 }).status, 0);
  assert.equal(run(read, { TOOLKIT_DATA_KEY: key2 }).stdout.trim(), '["u1"]');
  assert.notEqual(run(read, { TOOLKIT_DATA_KEY: key1 }).status, 0, 'old key no longer opens the rotated file');
  // 4. A malformed key is rejected loudly.
  assert.notEqual(run(read, { TOOLKIT_DATA_KEY: 'too-short' }).status, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------- operator tooling
test('admin CLI: refuses while a server is running; exports, edits and erases through the store', () => {
  const toolkitRoot = path.join(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-admin-'));
  const env = { ...process.env, TOOLKIT_DATA_DIR: dir, TOOLKIT_DATA_KEY: '' };
  const admin = (...args) => spawnSync(process.execPath, [path.join(toolkitRoot, 'scripts', 'admin.cjs'), ...args], { encoding: 'utf8', env });
  const seed = "const s=require('./server/store');"
    + "s.db.users.push({id:'u1',name:'Ann',email:'ann@example.org',passwordHash:'$2a$11$secret-hash-value',createdAt:Date.now(),emailVerified:true});"
    + "s.db.users.push({id:'u2',name:'Bob',email:'bob@example.org',passwordHash:'$2a$11$other-hash-value',createdAt:Date.now()});"
    + "s.db.projects.push({id:'p1',ownerId:'u1',name:'Ann work',document:{},createdAt:1,updatedAt:1});"
    + "s.db.projects.push({id:'p2',ownerId:'u2',name:'Bob work',document:{},createdAt:1,updatedAt:1});"
    + "s.db.sessions.h1={userId:'u1',createdAt:Date.now(),lastSeen:Date.now(),expiresAt:Date.now()+1e6};s.save();s.flush();";
  assert.equal(spawnSync(process.execPath, ['-e', seed], { cwd: toolkitRoot, env }).status, 0);

  fs.writeFileSync(path.join(dir, 'runtime.json'), '{}');
  assert.equal(admin('list').status, 3, 'refuses while the server lock file exists');
  fs.unlinkSync(path.join(dir, 'runtime.json'));

  const listed = admin('list');
  assert.equal(listed.status, 0); assert.match(listed.stdout, /ann@example\.org/); assert.ok(!/secret-hash/.test(listed.stdout));
  const exported = admin('export', 'ANN@example.org');
  assert.equal(exported.status, 0);
  const data = JSON.parse(exported.stdout);
  assert.equal(data.projects.length, 1); assert.equal(data.projects[0].name, 'Ann work');
  assert.ok(!/secret-hash|passwordHash/.test(exported.stdout), 'credentials never exported');
  assert.notEqual(admin('export', 'nobody@example.org').status, 0);

  assert.notEqual(admin('set-email', 'ann@example.org', 'not-an-email', '--yes').status, 0);
  assert.notEqual(admin('set-email', 'ann@example.org', 'bob@example.org', '--yes').status, 0, 'addresses stay unique');
  assert.notEqual(admin('set-email', 'ann@example.org', 'ann2@example.org').status, 0, 'needs --yes');
  assert.equal(admin('set-email', 'ann@example.org', 'ann2@example.org', '--yes').status, 0);
  assert.match(admin('list').stdout, /ann2@example[.]org	.*unverified/, 'a changed address must be re-confirmed');
  assert.equal(admin('revoke-sessions', 'ann2@example.org').status, 0);

  assert.notEqual(admin('delete', 'ann2@example.org').status, 0, 'deletion needs --yes');
  assert.equal(admin('delete', 'ann2@example.org', '--yes').status, 0);
  const after = admin('list').stdout;
  assert.ok(!/ann2@example\.org/.test(after) && /bob@example\.org/.test(after), 'only the target account is removed');
  const files = ['db.json', 'db.json.bak'].map(f => fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const text of files) assert.ok(!/Ann work|ann2@example\.org|secret-hash/.test(text), 'erased from the database and the backup copy');
  assert.match(files[0], /Bob work/);
  assert.equal(audit.verify(path.join(dir, 'audit')).ok, true, 'admin actions are in a valid audit chain');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------- source hygiene
// "Trojan Source": bidirectional-override and zero-width characters can make code read
// differently to a human than it executes. None belong in this project's source files.
// (Zero-width joiners inside emoji sequences, U+200C/U+200D, are legitimate and allowed.)
test('source files contain no hidden bidi/zero-width/control characters', () => {
  const root = path.join(__dirname, '..', '..');
  const roots = ['toolkit/server', 'toolkit/public', 'toolkit/test', 'toolkit/desktop', 'toolkit/scripts', 'toolkit/deploy', 'sigma/public', 'pigment', 'imagevendor', 'placeholder'];
  const skip = /(^|\/)(node_modules|vendor|dist|data)(\/|$)/;      // matched against forward-slash paths
  const ranges = [[0, 8], [11, 12], [14, 31], [127, 159], [0x200b, 0x200b], [0x200e, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069], [0xfffd, 0xfffd]];
  const isBad = code => ranges.some(([a, b]) => code >= a && code <= b);
  const offenders = [];
  let scanned = 0;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (skip.test(path.relative(root, full).split(path.sep).join('/'))) continue;
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(js|cjs|mjs|html|css|json|md|svg|example)$/i.test(entry.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      scanned++;
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code === 0xfeff && i === 0) continue;                       // a byte-order mark may start a file
        if (isBad(code)) { offenders.push(`${path.relative(root, full)} @${i} U+${code.toString(16).toUpperCase().padStart(4, '0')}`); break; }
      }
    }
  }
  for (const r of roots) walk(path.join(root, r));
  assert.ok(scanned > 50, 'the scan really covered the project (' + scanned + ' files)');
  assert.deepEqual(offenders, []);
});
