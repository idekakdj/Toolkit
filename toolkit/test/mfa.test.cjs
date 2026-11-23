// Two-step sign-in (TOTP + recovery codes): algorithm vectors, the QR encoder, enrolment,
// the sign-in challenge, replay and lock-out protection, Google and desktop sign-in with
// two-step on, the operator policy TOOLKIT_REQUIRE_MFA=1, and the admin reset command.
// Uses an isolated temporary data directory; Google is a local fake.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-mfa-'));
const CLIENT = 'test-client.apps.googleusercontent.com';
process.env.TOOLKIT_DATA_DIR = temp;
process.env.TOOLKIT_EMAIL_DNS_CHECK = 'off';
process.env.TOOLKIT_EMAIL_VERIFICATION = 'off';
process.env.GOOGLE_CLIENT_ID = CLIENT;
process.env.GOOGLE_CLIENT_SECRET = 'test-secret-value';
delete process.env.GOOGLE_REDIRECT_URI;
delete process.env.TOOLKIT_REQUIRE_MFA;
const app = require('../server/index');
const sec = require('../server/security');
const google = require('../server/google');
const mfa = require('../server/mfa');
const qr = require('../server/qr');
const { db } = require('../server/store');
const { LOGIN_FAILED } = require('../server/auth');

// ---------- fake Google (same approach as google.test.cjs) ----------
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const issued = new Map();
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
function sign(claims) {
  const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'RS256', kid: 'test-key', typ: 'JWT' });
  const body = enc(claims);
  return `${head}.${body}.${crypto.sign('RSA-SHA256', Buffer.from(head + '.' + body), privateKey).toString('base64url')}`;
}
google.setFetch(async (url, options = {}) => {
  if (url === 'https://www.googleapis.com/oauth2/v3/certs') return json({ keys: [jwk] }, 200, { 'cache-control': 'public, max-age=3600' });
  if (url === 'https://oauth2.googleapis.com/token') {
    const form = new URLSearchParams(options.body);
    const grant = issued.get(form.get('code'));
    issued.delete(form.get('code'));
    if (!grant) return json({ error: 'invalid_grant' }, 400);
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: 'https://accounts.google.com', aud: CLIENT, azp: CLIENT, sub: '1001', email: 'pat@gmail.com',
      email_verified: true, name: 'Pat Example', iat: now, exp: now + 3600, nonce: grant.nonce, ...grant.claims };
    return json({ id_token: sign(claims), access_token: 'unused', token_type: 'Bearer' });
  }
  throw new Error('unexpected request to ' + url);
});

let server, base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(r => server.close(r)); fs.rmSync(temp, { recursive: true, force: true }); });

function resetLimits() {
  for (const l of [sec.oauthLimiter, sec.loginLimiter, sec.registerLimiter, sec.authLimiter, sec.apiLimiter, sec.writeLimiter, sec.mfaLimiter]) l.resetKey('127.0.0.1');
  for (const u of db.users) sec.sensitiveLimiter.resetKey('u:' + u.id);
}
const cookieOf = (res, name) => {
  const c = res.headers.getSetCookie().find(x => x.startsWith(name + '=') && !x.startsWith(name + '=;'));
  return c ? c.split(';')[0] : null;
};
async function call(url, { method = 'GET', body, cookie } = {}) {
  resetLimits();
  const headers = { 'X-Requested-With': 'test' };
  if (cookie) headers.Cookie = Array.isArray(cookie) ? cookie.filter(Boolean).join('; ') : cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers, redirect: 'manual', body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { res, status: res.status, data, text, cookie: cookieOf(res, 'toolkit_session'), mfaCookie: cookieOf(res, 'toolkit_mfa') };
}
const sessionKey = cookie => crypto.createHash('sha256').update(cookie.split('=')[1]).digest('hex');
const PASSWORD = 'Maple-Lantern-River-77';
const userOf = email => db.users.find(u => u.email === email);

async function register(email, name = 'Test Person') {
  const r = await call('/api/auth/register', { method: 'POST', body: { name, email, password: PASSWORD, acceptTerms: true } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r;
}
const login = (email, password = PASSWORD) => call('/api/auth/login', { method: 'POST', body: { email, password } });
const clean = secret => secret.replace(/ /g, '');
const codeFor = (secret, steps = 0) => mfa.totpAt(clean(secret), Date.now() / 1000 + 30 * steps);
function wrongCode(secret) {
  const valid = new Set([-1, 0, 1].map(s => codeFor(secret, s)));
  return ['000000', '111111', '222222', '333333'].find(c => !valid.has(c));
}
// Setup then enable with a code computed from the returned secret.
async function enrol(cookie, email, body = { currentPassword: PASSWORD }) {
  const setup = await call('/api/account/mfa/setup', { method: 'POST', cookie, body });
  assert.equal(setup.status, 200, JSON.stringify(setup.data));
  const secret = clean(setup.data.secret);
  const enable = await call('/api/account/mfa/enable', { method: 'POST', cookie, body: { code: codeFor(secret) } });
  assert.equal(enable.status, 200, JSON.stringify(enable.data));
  assert.equal(userOf(email).mfa.secret, secret);
  return { secret, codes: enable.data.recoveryCodes, setup, enable };
}
const freshStep = email => { userOf(email).mfa.lastStep = 0; };

// ================================================================ TOTP and base32
const RFC_SECRET = mfa.base32Encode(Buffer.from('12345678901234567890'));

test('TOTP matches the RFC 6238 SHA-1 test vectors (6-digit truncation)', () => {
  assert.equal(RFC_SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(mfa.totpAt(RFC_SECRET, 59), '287082');
  assert.equal(mfa.totpAt(RFC_SECRET, 1111111109), '081804');
  assert.equal(mfa.totpAt(RFC_SECRET, 1234567890), '005924');
  assert.equal(mfa.totpAt(RFC_SECRET, 2000000000), '279037');
});

test('base32 is RFC 4648 without padding and round-trips', () => {
  assert.equal(mfa.base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
  assert.equal(mfa.base32Encode(Buffer.from('f')), 'MY');
  for (let n = 0; n <= 25; n++) {
    const buf = crypto.randomBytes(n);
    const text = mfa.base32Encode(buf);
    assert.match(text, /^[A-Z2-7]*$/);
    assert.ok(mfa.base32Decode(text).equals(buf), 'length ' + n);
  }
  assert.equal(mfa.newSecret().length, 32, '20 random bytes');
  assert.notEqual(mfa.newSecret(), mfa.newSecret());
});

test('the verifier accepts one step either side, ignores spaces and refuses replays', () => {
  const at = 59000;                                         // step 1
  assert.equal(mfa.verifyTotp(RFC_SECRET, '287082', { now: at }), 1);
  assert.equal(mfa.verifyTotp(RFC_SECRET, '287 082', { now: at }), 1);
  assert.equal(mfa.verifyTotp(RFC_SECRET, '287082', { now: at, lastStep: 1 }), null, 'same step again is a replay');
  assert.equal(mfa.verifyTotp(RFC_SECRET, '287082', { now: at, lastStep: 0 }), 1);
  assert.equal(mfa.verifyTotp(RFC_SECRET, '287082', { now: 89000 }), 1, 'the previous step is still accepted');
  assert.equal(mfa.verifyTotp(RFC_SECRET, '287082', { now: 119000 }), null, 'two steps old is not');
  assert.equal(mfa.verifyTotp(RFC_SECRET, '28708', { now: at }), null);
  assert.equal(mfa.verifyTotp(RFC_SECRET, 287082, { now: at }), null);
  assert.equal(mfa.verifyTotp(RFC_SECRET, '', { now: at }), null);
});

test('recovery codes have the xxxx-xxxx format, are stored only as hashes and work once', () => {
  const { codes, records } = mfa.newRecoverySet('user-1');
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[abcdefghjkmnpqrstuvwxyz2-9]{4}-[abcdefghjkmnpqrstuvwxyz2-9]{4}$/);
  assert.equal(records.length, 10);
  for (const r of records) { assert.equal(r.usedAt, null); assert.match(r.hash, /^[0-9a-f]{64}$/); }
  const blob = JSON.stringify(records);
  for (const c of codes) assert.ok(!blob.includes(c.replace('-', '')) && !blob.includes(c));
  const user = { id: 'user-1', mfa: { enabled: true, recovery: records } };
  assert.equal(mfa.useRecoveryCode(user, codes[3].toUpperCase().replace('-', ' - ')), true, 'case, spaces and dashes are ignored');
  assert.equal(mfa.useRecoveryCode(user, codes[3]), false, 'single use');
  assert.equal(mfa.useRecoveryCode({ ...user, id: 'someone-else' }, codes[4]), false, 'bound to the account');
  assert.equal(mfa.recoveryRemaining(user), 9);
});

// ================================================================ QR encoder
const alphaPow = [];
for (let i = 0, x = 1; i < 255; i++) { alphaPow.push(x); x <<= 1; if (x & 256) x ^= 0x11d; }
const gfMul = (a, b) => {
  let r = 0;
  for (let i = 0; i < 8; i++) { if ((b >> i) & 1) r ^= a << i; }
  for (let i = 14; i >= 8; i--) if ((r >> i) & 1) r ^= 0x11d << (i - 8);
  return r;
};

test('QR: every Reed-Solomon block evaluates to zero at alpha^0..alpha^(ec-1)', () => {
  for (const len of [2, 30, 60, 100, 120, 160, 213]) {
    const { blocks, codewords, version } = qr.buildBlocks('x'.repeat(len));
    assert.ok(version >= 1 && version <= 10);
    let total = 0;
    for (const block of blocks) {
      total += block.data.length + block.ec.length;
      const poly = block.data.concat(block.ec);
      for (let i = 0; i < block.ec.length; i++) {
        let acc = 0;
        for (const c of poly) acc = gfMul(acc, alphaPow[i]) ^ c;
        assert.equal(acc, 0, `length ${len}, root ${i}`);
      }
    }
    assert.equal(codewords.length, total, 'interleaving keeps every codeword');
  }
  // Mode and count header of a tiny message: 0100, length 2, 'h', 'i', terminator, pad bytes.
  const tiny = qr.buildBlocks('hi').blocks[0].data;
  assert.deepEqual(tiny.slice(0, 4), [0x40, 0x26, 0x86, 0x90]);
  assert.deepEqual(tiny.slice(4, 6), [0xec, 0x11]);
});

const FORMAT_M = ['101010000010010', '101000100100101', '101111001111100', '101101101001011',
  '100010111111001', '100000011001110', '100111110010111', '100101010100000'];
function readFormat({ size, rows }, copy) {
  const cell = (x, y) => rows[y][x];
  let out = '';
  for (let i = 14; i >= 0; i--) {
    if (copy === 1) {
      if (i <= 5) out += cell(8, i); else if (i === 6) out += cell(8, 7); else if (i === 7) out += cell(8, 8);
      else if (i === 8) out += cell(7, 8); else out += cell(14 - i, 8);
    } else if (i < 8) out += cell(size - 1 - i, 8); else out += cell(8, size - 15 + i);
  }
  return out;
}

test('QR: format information for level M matches the specification table, in both copies', () => {
  for (let mask = 0; mask < 8; mask++) {
    assert.equal(qr.formatBits(mask).toString(2).padStart(15, '0'), FORMAT_M[mask], 'mask ' + mask);
    const code = qr.encode('https://example.org/' + mask, mask);
    assert.equal(readFormat(code, 1), FORMAT_M[mask], 'copy 1, mask ' + mask);
    assert.equal(readFormat(code, 2), FORMAT_M[mask], 'copy 2, mask ' + mask);
    assert.equal(code.rows[code.size - 8][8], '1', 'dark module');
  }
});

test('QR: version information for version 7 and larger', () => {
  assert.equal(qr.versionBits(7).toString(2).padStart(18, '0'), '000111110010010100');
  const code = qr.encode('a'.repeat(115));                // 115 bytes needs version 7 at level M
  assert.equal(code.size, 17 + 4 * 7);
  for (const [bx, by] of [[0, 1], [1, 0]]) {              // both copies: top-right block and bottom-left block
    let text = '';
    for (let i = 17; i >= 0; i--) {
      const a = code.size - 11 + (i % 3), b = Math.floor(i / 3);
      text += bx ? code.rows[a][b] : code.rows[b][a];
    }
    assert.equal(text, '000111110010010100', 'copy ' + (bx + by));
  }
  const small = qr.encode('hello');
  assert.equal(small.size, 21, 'version 1');
});

test('QR: finder and timing patterns, shape, and sizes', () => {
  const FINDER = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
  for (const text of ['hi', 'a'.repeat(115), 'b'.repeat(213)]) {
    const { size, rows } = qr.encode(text);
    assert.equal(rows.length, size);
    assert.ok(rows.every(r => /^[01]+$/.test(r) && r.length === size));
    assert.equal((size - 17) % 4, 0);
    for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
      for (let y = 0; y < 7; y++) assert.equal(rows[oy + y].slice(ox, ox + 7), FINDER[y], `finder at ${ox},${oy}`);
    }
    for (let i = 8; i < size - 8; i++) {
      assert.equal(rows[6][i], i % 2 === 0 ? '1' : '0', 'horizontal timing');
      assert.equal(rows[i][6], i % 2 === 0 ? '1' : '0', 'vertical timing');
    }
    for (let i = 0; i < 8; i++) {                         // light separators beside the finders
      assert.equal(rows[7][i], '0'); assert.equal(rows[i][7], '0');
    }
  }
  // Version 2 and up carry an alignment pattern.
  const v2 = qr.encode('x'.repeat(20));
  assert.equal(v2.size, 25);
  assert.equal(v2.rows[18][18], '1'); assert.equal(v2.rows[17][17], '0'); assert.equal(v2.rows[16][16], '1');
});

test('QR: a typical otpauth URI encodes; the largest message fits and anything longer is refused', () => {
  const uri = mfa.otpauthUri('someone@gmail.com', mfa.newSecret());
  assert.ok(uri.length > 110 && uri.length < 150, 'about 120 characters: ' + uri.length);
  const code = qr.encode(uri);
  assert.ok(code.size >= 41 && code.size <= 57);
  assert.equal(qr.encode('c'.repeat(213)).size, 57, 'version 10 holds 213 bytes at level M');
  assert.throws(() => qr.encode('c'.repeat(214)), /too long/i);
  assert.ok(qr.encode(String.fromCharCode(0xe9) + 'x').size >= 21, 'UTF-8 text works');
  assert.equal(mfa.otpauthUri('a b@c.d', 'ABC'), 'otpauth://totp/Toolkit:a%20b%40c.d?secret=ABC&issuer=Toolkit&algorithm=SHA1&digits=6&period=30');
});

// ================================================================ enrolment and sign-in
test('enrolment: setup, enable, recovery codes, other sessions revoked', async () => {
  const email = 'ann@gmail.com';
  const first = await register(email);
  const other = await login(email);
  assert.ok(other.cookie);
  assert.equal((await call('/api/auth/config')).data.mfaRequired, false);
  const before = await call('/api/account', { cookie: first.cookie });
  assert.deepEqual(before.data.account.mfa, { enabled: false, enrolledAt: null, recoveryRemaining: 0 });
  assert.equal(before.data.account.mfaSetupRequired, false);

  assert.equal((await call('/api/account/mfa/enable', { method: 'POST', cookie: first.cookie, body: { code: '123456' } })).data.code, 'mfa_no_setup');
  assert.equal((await call('/api/account/mfa/setup', { method: 'POST', cookie: first.cookie, body: {} })).status, 400, 'password required');
  const badPw = await call('/api/account/mfa/setup', { method: 'POST', cookie: first.cookie, body: { currentPassword: 'Wrong-Password-1' } });
  assert.equal(badPw.status, 403); assert.equal(badPw.data.error, 'Your current password is incorrect.');
  assert.equal(userOf(email).mfaPending, undefined, 'a refused setup stores nothing');

  const setup = await call('/api/account/mfa/setup', { method: 'POST', cookie: first.cookie, body: { currentPassword: PASSWORD } });
  assert.equal(setup.status, 200);
  assert.match(setup.data.secret, /^([A-Z2-7]{4} ){7}[A-Z2-7]{4}$/);
  const secret = clean(setup.data.secret);
  assert.equal(setup.data.otpauthUri, `otpauth://totp/Toolkit:ann%40gmail.com?secret=${secret}&issuer=Toolkit&algorithm=SHA1&digits=6&period=30`);
  assert.equal(setup.data.qr.rows.length, setup.data.qr.size);
  assert.equal(userOf(email).mfaPending.secret, secret);
  assert.ok(!userOf(email).mfa, 'not enabled until a code is confirmed');

  const wrong = await call('/api/account/mfa/enable', { method: 'POST', cookie: first.cookie, body: { code: wrongCode(secret) } });
  assert.equal(wrong.status, 400); assert.equal(wrong.data.code, 'mfa_invalid');
  assert.ok(!userOf(email).mfa);

  const enable = await call('/api/account/mfa/enable', { method: 'POST', cookie: first.cookie, body: { code: codeFor(secret) } });
  assert.equal(enable.status, 200);
  assert.equal(enable.data.recoveryCodes.length, 10);
  assert.equal(enable.data.otherSessionsRevoked, 1);
  assert.equal((await call('/api/auth/me', { cookie: other.cookie })).status, 401, 'the other device is signed out');
  assert.equal((await call('/api/auth/me', { cookie: first.cookie })).status, 200, 'this one stays');
  const u = userOf(email);
  assert.equal(u.mfa.enabled, true); assert.equal(u.mfa.secret, secret); assert.ok(u.mfa.lastStep > 0);
  assert.equal(u.mfaPending, undefined);
  assert.ok(!JSON.stringify(u.mfa.recovery).includes(enable.data.recoveryCodes[0]), 'recovery codes are hashed at rest');
  const after = await call('/api/account', { cookie: first.cookie });
  assert.equal(after.data.account.mfa.enabled, true);
  assert.equal(after.data.account.mfa.recoveryRemaining, 10);
  assert.ok(after.data.account.mfa.enrolledAt > 0);
  assert.equal((await call('/api/account/mfa/setup', { method: 'POST', cookie: first.cookie, body: { currentPassword: PASSWORD } })).data.code, 'mfa_already_enabled');
  assert.equal((await call('/api/account/mfa/setup', { method: 'POST', body: {} })).status, 401, 'needs a session');
  state.ann = { secret, codes: enable.data.recoveryCodes, cookie: first.cookie };
});
const state = {};

test('sign-in: a correct password alone gives no session, only a challenge', async () => {
  const email = 'ann@gmail.com';
  const r = await login(email);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { mfaRequired: true });
  assert.equal(r.cookie, null, 'no session cookie');
  assert.ok(r.mfaCookie, 'challenge cookie');
  const raw = r.res.headers.getSetCookie().find(c => c.startsWith('toolkit_mfa='));
  assert.match(raw, /HttpOnly/); assert.match(raw, /SameSite=Lax/); assert.match(raw, /Path=\//); assert.match(raw, /Max-Age=300/);
  assert.equal((await call('/api/auth/me', { cookie: r.mfaCookie })).status, 401);
  assert.equal((await login(email, 'Wrong-Password-1')).status, 401, 'a wrong password never reaches the challenge');
  // Cancel kills the challenge.
  const cancel = await call('/api/auth/mfa/cancel', { method: 'POST', cookie: r.mfaCookie });
  assert.equal(cancel.status, 200); assert.deepEqual(cancel.data, { ok: true });
  const dead = await call('/api/auth/mfa/verify', { method: 'POST', cookie: r.mfaCookie, body: { code: codeFor(state.ann.secret, 1) } });
  assert.equal(dead.status, 401); assert.equal(dead.data.code, 'mfa_expired');
  // No cookie at all.
  const none = await call('/api/auth/mfa/verify', { method: 'POST', body: { code: '123456' } });
  assert.equal(none.status, 401); assert.equal(none.data.code, 'mfa_expired');
});

test('sign-in: the right code gives a session; the same code cannot be used again (replay)', async () => {
  const email = 'ann@gmail.com';
  const code = codeFor(state.ann.secret, 1);
  const ch = await login(email);
  const ok = await call('/api/auth/mfa/verify', { method: 'POST', cookie: ch.mfaCookie, body: { code: ' ' + code.slice(0, 3) + ' ' + code.slice(3) } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.user.email, email);
  assert.equal(ok.data.recoveryUsed, undefined);
  assert.ok(ok.cookie, 'session cookie');
  assert.ok(ok.res.headers.getSetCookie().some(c => c.startsWith('toolkit_mfa=;')), 'challenge cookie cleared');
  assert.equal(db.sessions[sessionKey(ok.cookie)].method, 'password');
  assert.equal((await call('/api/auth/me', { cookie: ok.cookie })).status, 200);
  const reuse = await call('/api/auth/mfa/verify', { method: 'POST', cookie: ch.mfaCookie, body: { code: codeFor(state.ann.secret, 1) } });
  assert.equal(reuse.data.code, 'mfa_expired', 'a challenge is single use');

  const again = await login(email);
  const replay = await call('/api/auth/mfa/verify', { method: 'POST', cookie: again.mfaCookie, body: { code } });
  assert.equal(replay.status, 400);
  assert.equal(replay.data.code, 'mfa_invalid');
  assert.equal(replay.data.attemptsLeft, 4);
  assert.equal(replay.data.error, 'That code is not right. Check your authenticator app and try again.');
  assert.equal(replay.cookie, null);
  await call('/api/auth/mfa/cancel', { method: 'POST', cookie: again.mfaCookie });
  userOf(email).failedLogins = 0;
});

test('sign-in: wrong codes count down, the challenge dies at 5 and the account locks', async () => {
  const email = 'ann@gmail.com';
  const bad = wrongCode(state.ann.secret);
  const ch = await login(email);
  const lefts = [];
  for (let i = 0; i < 5; i++) {
    const r = await call('/api/auth/mfa/verify', { method: 'POST', cookie: ch.mfaCookie, body: { code: bad } });
    assert.equal(r.status, 400); assert.equal(r.data.code, 'mfa_invalid');
    lefts.push(r.data.attemptsLeft);
  }
  assert.deepEqual(lefts, [4, 3, 2, 1, 0]);
  const gone = await call('/api/auth/mfa/verify', { method: 'POST', cookie: ch.mfaCookie, body: { code: codeFor(state.ann.secret, 1) } });
  assert.equal(gone.status, 401); assert.equal(gone.data.code, 'mfa_expired', 'even a correct code cannot revive it');
  assert.ok(sec.loginLocked(userOf(email)), 'five failures lock the account');
  const locked = await login(email);
  assert.equal(locked.status, 401); assert.equal(locked.data.error, LOGIN_FAILED);
  // A challenge that exists while the account is locked also refuses.
  userOf(email).lockedUntil = 0;
  const ch2 = await login(email);
  userOf(email).lockedUntil = Date.now() + 60000;
  const refused = await call('/api/auth/mfa/verify', { method: 'POST', cookie: ch2.mfaCookie, body: { code: codeFor(state.ann.secret, 1) } });
  assert.equal(refused.status, 401); assert.equal(refused.data.code, 'mfa_expired');
  userOf(email).lockedUntil = 0; userOf(email).failedLogins = 0;
  // Malformed input is just a wrong code.
  const ch3 = await login(email);
  for (const code of [undefined, 123456, '', 'x'.repeat(100), { a: 1 }]) {
    const r = await call('/api/auth/mfa/verify', { method: 'POST', cookie: ch3.mfaCookie, body: { code } });
    assert.ok(r.status === 400 || r.status === 401);
    assert.equal(r.cookie, null);
  }
  userOf(email).lockedUntil = 0; userOf(email).failedLogins = 0;
});

test('sign-in: a per-network limiter stops guessing', async () => {
  resetLimits();
  let last;
  for (let i = 0; i < 11; i++) {
    last = await fetch(base + '/api/auth/mfa/verify', { method: 'POST', headers: { 'X-Requested-With': 'test', 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '123456' }) });
  }
  assert.equal(last.status, 429);
  assert.equal((await last.json()).error, 'Too many attempts. Try again in a few minutes.');
  resetLimits();
});

test('recovery codes: work once, the count drops, regenerating invalidates the old set', async () => {
  const email = 'ann@gmail.com';
  const { codes } = state.ann;
  const ch = await login(email);
  const used = await call('/api/auth/mfa/verify', { method: 'POST', cookie: ch.mfaCookie, body: { code: codes[0].toUpperCase().replace('-', ' ') } });
  assert.equal(used.status, 200, JSON.stringify(used.data));
  assert.equal(used.data.recoveryUsed, true);
  assert.equal(used.data.recoveryRemaining, 9);
  const session = used.cookie;
  assert.equal((await call('/api/account', { cookie: session })).data.account.mfa.recoveryRemaining, 9);
  const ch2 = await login(email);
  const again = await call('/api/auth/mfa/verify', { method: 'POST', cookie: ch2.mfaCookie, body: { code: codes[0] } });
  assert.equal(again.data.code, 'mfa_invalid', 'a used recovery code is refused');
  await call('/api/auth/mfa/cancel', { method: 'POST', cookie: ch2.mfaCookie });
  userOf(email).failedLogins = 0;

  // Regenerating needs the password and an authenticator code (a recovery code is not enough).
  const path = '/api/account/mfa/recovery-codes';
  freshStep(email);
  const goodCode = codeFor(state.ann.secret);
  assert.equal((await call(path, { method: 'POST', cookie: session, body: { code: goodCode } })).status, 400, 'password required');
  assert.equal((await call(path, { method: 'POST', cookie: session, body: { currentPassword: 'Wrong-Password-1', code: goodCode } })).status, 403);
  const viaRecovery = await call(path, { method: 'POST', cookie: session, body: { currentPassword: PASSWORD, code: codes[1] } });
  assert.equal(viaRecovery.status, 400); assert.equal(viaRecovery.data.code, 'mfa_invalid');
  const regen = await call(path, { method: 'POST', cookie: session, body: { currentPassword: PASSWORD, code: goodCode } });
  assert.equal(regen.status, 200, JSON.stringify(regen.data));
  assert.equal(regen.data.recoveryCodes.length, 10);
  assert.equal((await call(path, { method: 'POST', cookie: session, body: { currentPassword: PASSWORD, code: goodCode } })).status, 400, 'the same authenticator code twice is a replay');
  const ch3 = await login(email);
  const old = await call('/api/auth/mfa/verify', { method: 'POST', cookie: ch3.mfaCookie, body: { code: codes[1] } });
  assert.equal(old.data.code, 'mfa_invalid', 'the old set no longer works');
  const fresh = await call('/api/auth/mfa/verify', { method: 'POST', cookie: ch3.mfaCookie, body: { code: regen.data.recoveryCodes[0] } });
  assert.equal(fresh.status, 200);
  assert.equal(fresh.data.recoveryRemaining, 9);
  state.ann.codes = regen.data.recoveryCodes;
  state.ann.cookie = fresh.cookie;
});

test('the export holds no authenticator secret or recovery hashes', async () => {
  const email = 'ann@gmail.com';
  const exported = await call('/api/account/export', { cookie: state.ann.cookie });
  assert.equal(exported.status, 200);
  const u = userOf(email);
  assert.deepEqual(exported.data.account.mfa, { enabled: true, enrolledAt: u.mfa.enrolledAt });
  assert.ok(!exported.text.includes(u.mfa.secret), 'no secret');
  for (const r of u.mfa.recovery) assert.ok(!exported.text.includes(r.hash), 'no recovery hash');
  assert.ok(!/"recovery"|mfaPending|lastStep|"hash"/.test(exported.text));
  // Audit entries never contain the secret either.
  const audit = fs.readdirSync(path.join(temp, 'audit')).map(f => fs.readFileSync(path.join(temp, 'audit', f), 'utf8')).join('');
  assert.ok(!audit.includes(u.mfa.secret));
  assert.match(audit, /login\.mfa-challenge/); assert.match(audit, /mfa\.enable/); assert.match(audit, /mfa\.fail/);
});

test('disabling needs the password and a valid code; then sign-in is single-step again', async () => {
  const email = 'ann@gmail.com';
  const path = '/api/account/mfa/disable';
  const cookie = state.ann.cookie;
  freshStep(email);
  const code = codeFor(state.ann.secret);
  assert.equal((await call(path, { method: 'POST', cookie, body: { code } })).status, 400, 'password required');
  assert.equal((await call(path, { method: 'POST', cookie, body: { currentPassword: 'Wrong-Password-1', code } })).status, 403);
  const noCode = await call(path, { method: 'POST', cookie, body: { currentPassword: PASSWORD, code: wrongCode(state.ann.secret) } });
  assert.equal(noCode.status, 400); assert.equal(noCode.data.code, 'mfa_invalid');
  assert.ok(userOf(email).mfa, 'still on');
  const ok = await call(path, { method: 'POST', cookie, body: { currentPassword: PASSWORD, code } });
  assert.equal(ok.status, 200); assert.deepEqual(ok.data, { ok: true });
  assert.equal(userOf(email).mfa, undefined);
  const plain = await login(email);
  assert.ok(plain.cookie && plain.data.user, 'a password is enough again');
  assert.equal(plain.data.mfaRequired, undefined);
  // Disabling with a recovery code works too.
  const second = await enrol(plain.cookie, email);
  const viaRecovery = await call(path, { method: 'POST', cookie: plain.cookie, body: { currentPassword: PASSWORD, code: second.codes[2] } });
  assert.equal(viaRecovery.status, 200);
  assert.equal(userOf(email).mfa, undefined);
});

// ================================================================ Google and desktop
async function googleSignIn({ claims = {}, query = '' } = {}) {
  resetLimits();
  const s = await fetch(base + '/api/auth/google/start' + query, { redirect: 'manual' });
  assert.equal(s.status, 302);
  const stateCookie = s.headers.getSetCookie().find(c => c.startsWith(google.STATE_COOKIE + '=')).split(';')[0];
  const p = new URL(s.headers.get('location')).searchParams;
  const code = 'code-' + crypto.randomUUID();
  issued.set(code, { nonce: p.get('nonce'), claims });
  resetLimits();
  const cb = await fetch(`${base}/api/auth/google/callback?state=${p.get('state')}&code=${code}`, { redirect: 'manual', headers: { Cookie: stateCookie } });
  const html = await cb.text();
  const target = (/content="0;url=([^"]+)"/.exec(html) || [])[1];
  return { cb, html, target: target && target.replace(/&amp;/g, '&'), cookie: cookieOf(cb, 'toolkit_session'), mfaCookie: cookieOf(cb, 'toolkit_mfa') };
}
const GINA = { sub: '3101', email: 'gina@gmail.com', name: 'Gina' };

test('Google-only account with two-step: the callback sends the person to the code page, and verify signs in with method google', async () => {
  const first = await googleSignIn({ claims: GINA });
  assert.ok(first.cookie, 'no two-step yet: signed straight in');
  const e = await enrol(first.cookie, GINA.email, {});          // Google-only: confirmed by the fresh Google session
  state.gina = e;
  const r = await googleSignIn({ claims: GINA, query: '?next=' + encodeURIComponent('/sigma/dashboard') });
  assert.equal(r.cookie, null, 'no session yet');
  assert.ok(r.mfaCookie, 'challenge cookie');
  assert.equal(r.target, '/auth?mfa=1&next=%2Fsigma%2Fdashboard');
  const plain = await googleSignIn({ claims: GINA });
  assert.equal(plain.target, '/auth?mfa=1', 'no next parameter for the home page');
  assert.equal(plain.cookie, null);
  const v = await call('/api/auth/mfa/verify', { method: 'POST', cookie: r.mfaCookie, body: { code: codeFor(e.secret, 1) } });
  assert.equal(v.status, 200, JSON.stringify(v.data));
  assert.equal(v.data.user.email, GINA.email);
  assert.equal(db.sessions[sessionKey(v.cookie)].method, 'google');
  assert.equal((await call('/api/auth/me', { cookie: v.cookie })).status, 200);
  await call('/api/auth/mfa/cancel', { method: 'POST', cookie: plain.mfaCookie });
});

test('desktop handoff with two-step: /desktop/wait finishes to the code page with the challenge cookie', async () => {
  const id = crypto.randomBytes(32).toString('base64url'), secret = crypto.randomBytes(32).toString('base64url');
  resetLimits();
  const begin = await fetch(`${base}/api/auth/google/desktop/begin?id=${id}&secret=${secret}&next=${encodeURIComponent('/pigment/app')}`, { redirect: 'manual' });
  assert.equal(begin.status, 302);
  await googleSignIn({ claims: GINA, query: '?handoff=' + id });     // the web browser's part
  resetLimits();
  const wait = await fetch(`${base}/api/auth/google/desktop/wait?id=${id}&secret=${secret}`, { redirect: 'manual' });
  const html = await wait.text();
  assert.equal((/content="0;url=([^"]+)"/.exec(html) || [])[1].replace(/&amp;/g, '&'), '/auth?mfa=1&next=%2Fpigment%2Fapp');
  assert.equal(cookieOf(wait, 'toolkit_session'), null, 'no session for the app window yet');
  const challenge = cookieOf(wait, 'toolkit_mfa');
  assert.ok(challenge, 'the app window receives the challenge');
  freshStep(GINA.email);
  const v = await call('/api/auth/mfa/verify', { method: 'POST', cookie: challenge, body: { code: codeFor(state.gina.secret) } });
  assert.equal(v.status, 200, JSON.stringify(v.data));
  assert.equal(db.sessions[sessionKey(v.cookie)].method, 'google');
});

// ================================================================ operator policy
test('TOOLKIT_REQUIRE_MFA=1: sessions without two-step are limited to setting it up', async () => {
  process.env.TOOLKIT_REQUIRE_MFA = '1';
  try {
    assert.equal((await call('/api/auth/config')).data.mfaRequired, true);
    const reg = await register('rex@gmail.com', 'Rex');
    assert.equal(reg.data.mfaSetupRequired, true);
    const r = await login('rex@gmail.com');
    assert.equal(r.status, 200);
    assert.equal(r.data.mfaSetupRequired, true);
    const cookie = r.cookie;
    assert.equal(db.sessions[sessionKey(cookie)].mfaSetup, true);

    const blocked = await call('/api/projects', { cookie });
    assert.equal(blocked.status, 403);
    assert.deepEqual(blocked.data, { error: 'Set up two-step sign-in to continue.', code: 'mfa_setup_required' });
    assert.equal((await call('/api/paintings', { cookie })).data.code, 'mfa_setup_required');
    assert.equal((await call('/api/images', { cookie })).data.code, 'mfa_setup_required');
    assert.equal((await call('/api/account', { method: 'PATCH', cookie, body: { name: 'Rex Two' } })).data.code, 'mfa_setup_required');
    assert.equal((await call('/api/account/export', { cookie })).data.code, 'mfa_setup_required');
    assert.equal((await call('/api/account/sessions/revoke-others', { method: 'POST', cookie, body: {} })).data.code, 'mfa_setup_required');
    const account = await call('/api/account', { cookie });
    assert.equal(account.status, 200);
    assert.equal(account.data.account.mfaSetupRequired, true);
    assert.equal((await call('/api/auth/me', { cookie })).status, 200);
    assert.equal((await call('/api/account/sessions', { cookie })).status, 200);

    resetLimits();
    const gate = await fetch(base + '/', { redirect: 'manual', headers: { Cookie: cookie } });
    assert.equal(gate.status, 302);
    assert.equal(gate.headers.get('location'), '/account?setup-mfa=1');
    const accountPage = await fetch(base + '/account', { redirect: 'manual', headers: { Cookie: cookie } });
    assert.equal(accountPage.status, 200, 'the account page itself stays reachable');

    // A disabled-by-mistake attempt and a refusal to switch it off.
    const e = await enrol(cookie, 'rex@gmail.com');
    assert.equal(db.sessions[sessionKey(cookie)].mfaSetup, undefined, 'flag cleared on this session');
    assert.equal((await call('/api/projects', { cookie })).status, 200);
    assert.equal((await call('/api/account', { cookie })).data.account.mfaSetupRequired, false);
    resetLimits();
    assert.equal((await fetch(base + '/', { redirect: 'manual', headers: { Cookie: cookie } })).status, 200);
    freshStep('rex@gmail.com');
    const off = await call('/api/account/mfa/disable', { method: 'POST', cookie, body: { currentPassword: PASSWORD, code: codeFor(e.secret) } });
    assert.equal(off.status, 403); assert.equal(off.data.code, 'mfa_required');
    assert.ok(userOf('rex@gmail.com').mfa, 'still on');

    // From now on rex needs the code at sign-in, and the resulting session is not restricted.
    const ch = await login('rex@gmail.com');
    assert.deepEqual(ch.data, { mfaRequired: true });
    const v = await call('/api/auth/mfa/verify', { method: 'POST', cookie: ch.mfaCookie, body: { code: codeFor(e.secret, 1) } });
    assert.equal(v.status, 200);
    assert.equal(db.sessions[sessionKey(v.cookie)].mfaSetup, undefined);
    assert.equal((await call('/api/projects', { cookie: v.cookie })).status, 200);

    // A new Google account goes straight to the set-up page.
    const g = await googleSignIn({ claims: { sub: '3201', email: 'zed@gmail.com', name: 'Zed' }, query: '?next=' + encodeURIComponent('/pigment/app') });
    assert.equal(g.target, '/account?setup-mfa=1');
    assert.equal((await call('/api/projects', { cookie: g.cookie })).data.code, 'mfa_setup_required');
    // Switching the policy off frees restricted sessions (the variable is read per request).
    delete process.env.TOOLKIT_REQUIRE_MFA;
    assert.equal((await call('/api/projects', { cookie: g.cookie })).status, 200);
  } finally { delete process.env.TOOLKIT_REQUIRE_MFA; }
});

// ================================================================ admin tool
test('admin CLI: reset-mfa needs --yes, removes two-step sign-in and sessions, and the list and export show no secrets', () => {
  const toolkitRoot = path.join(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-admin-mfa-'));
  const env = { ...process.env, TOOLKIT_DATA_DIR: dir, TOOLKIT_DATA_KEY: '' };
  const admin = (...args) => spawnSync(process.execPath, [path.join(toolkitRoot, 'scripts', 'admin.cjs'), ...args], { encoding: 'utf8', env });
  const seed = "const s=require('./server/store');"
    + "s.db.users.push({id:'u1',name:'Ann',email:'ann@example.org',passwordHash:'$2a$11$secret-hash-value',createdAt:Date.now(),emailVerified:true,"
    + "mfa:{enabled:true,secret:'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',enrolledAt:12345,lastStep:5,recovery:[{hash:'deadbeef'.repeat(8),usedAt:null}]},"
    + "mfaPending:{secret:'PENDINGSECRETPENDINGSECRET234567',expires:Date.now()+1e6}});"
    + "s.db.users.push({id:'u2',name:'Bob',email:'bob@example.org',passwordHash:'$2a$11$other-hash-value',createdAt:Date.now(),emailVerified:true});"
    + "s.db.sessions.h1={userId:'u1',createdAt:Date.now(),lastSeen:Date.now(),expiresAt:Date.now()+1e6};"
    + "s.db.sessions.h2={userId:'u2',createdAt:Date.now(),lastSeen:Date.now(),expiresAt:Date.now()+1e6};s.save();s.flush();";
  assert.equal(spawnSync(process.execPath, ['-e', seed], { cwd: toolkitRoot, env }).status, 0);

  const listed = admin('list');
  assert.equal(listed.status, 0);
  assert.match(listed.stdout, /ann@example\.org.*mfa-on/);
  assert.match(listed.stdout, /bob@example\.org.*mfa-off/);
  const exported = admin('export', 'ann@example.org');
  assert.equal(exported.status, 0);
  assert.deepEqual(JSON.parse(exported.stdout).account.mfa, { enabled: true, enrolledAt: 12345 });
  assert.ok(!/JBSWY3DP|PENDINGSECRET|deadbeef|recovery/.test(exported.stdout), 'no secrets in the export');

  assert.equal(admin('reset-mfa', 'ann@example.org').status, 1, 'needs --yes');
  assert.match(admin('list').stdout, /ann@example\.org.*mfa-on/, 'nothing changed without --yes');
  assert.notEqual(admin('reset-mfa', 'nobody@example.org', '--yes').status, 0);
  const done = admin('reset-mfa', 'ann@example.org', '--yes');
  assert.equal(done.status, 0, done.stderr);
  assert.match(admin('list').stdout, /ann@example\.org.*mfa-off/);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));
  const ann = saved.users.find(u => u.id === 'u1');
  assert.equal(ann.mfa, undefined); assert.equal(ann.mfaPending, undefined);
  assert.deepEqual(Object.keys(saved.sessions), ['h2'], 'only the target is signed out');
  assert.ok(fs.readdirSync(path.join(dir, 'audit')).map(f => fs.readFileSync(path.join(dir, 'audit', f), 'utf8')).join('').includes('admin.reset-mfa'));
  fs.rmSync(dir, { recursive: true, force: true });
});
