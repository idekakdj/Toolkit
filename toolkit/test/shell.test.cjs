// Tab shell routing: "/" is the shell for signed-in people and the landing page for visitors,
// app landing pages and the old Sigma dashboard redirect signed-in people to "/", and
// same-origin framing is allowed (other sites still cannot frame Toolkit).
// Uses an isolated temporary data directory; writes nothing to the repository.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-shell-'));
process.env.TOOLKIT_DATA_DIR = temp;
process.env.TOOLKIT_EMAIL_DNS_CHECK = 'off';
process.env.TOOLKIT_EMAIL_VERIFICATION = 'off';
delete process.env.TOOLKIT_REQUIRE_MFA;
const app = require('../server/index');
const sec = require('../server/security');
const { db } = require('../server/store');

const PUBLIC = path.join(__dirname, '..', 'public');
const HOME_FILE = path.join(PUBLIC, 'home.html');
const LANDING_MARKER = 'every tool, one channel';
const PASSWORD = 'Violet-Harbor-Lamp-42';
let server, base, cookie, count = 0;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });

function resetLimits() {
  for (const l of [sec.loginLimiter, sec.registerLimiter, sec.authLimiter, sec.apiLimiter, sec.writeLimiter, sec.pageLimiter]) l.resetKey('127.0.0.1');
}
async function get(url, session) {
  resetLimits();
  const headers = { 'X-Requested-With': 'test' };
  if (session) headers.Cookie = session;
  return fetch(base + url, { headers, redirect: 'manual' });
}
async function register() {
  resetLimits();
  const res = await fetch(base + '/api/auth/register', {
    method: 'POST', headers: { 'X-Requested-With': 'test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Shell Tester', email: `shell${++count}@example.com`, password: PASSWORD, acceptTerms: true }),
  });
  assert.equal(res.status, 201);
  return res.headers.get('set-cookie').split(';')[0];
}

const LANDINGS = ['/sigma', '/sigma/', '/sigma/index.html', '/pigment', '/pigment/', '/pigment/index.html',
  '/imagevendor', '/imagevendor/', '/imagevendor/index.html', '/placeholder/', '/placeholder/index.html'];

test('/placeholder redirects to /placeholder/ (its landing page uses relative links), keeping the query', async () => {
  for (const [url, to] of [['/placeholder', '/placeholder/'], ['/placeholder?x=1', '/placeholder/?x=1']]) {
    const res = await get(url);
    assert.equal(res.status, 301, url);
    assert.equal(res.headers.get('location'), to, url);
  }
});

test('pages that must not sit inside a tab load frame-escape.js; the shell is marked as the shell', async () => {
  for (const f of ['index.html', 'auth.html', '404.html', 'home.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');
    assert.match(html, /<script src="\/js\/frame-escape\.js"><\/script>/, f);
  }
  assert.match(fs.readFileSync(HOME_FILE, 'utf8'), /<html lang="en" data-shell="1">/);
  const js = await get('/js/frame-escape.js');
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
});

test('signed-out "/" serves the landing page; signed-out /home.html redirects to "/"', async () => {
  const res = await get('/');
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes(LANDING_MARKER));
  const home = await get('/home.html');
  assert.equal(home.status, 302);
  assert.equal(home.headers.get('location'), '/');
});

test('signed-in "/" serves the shell (home.html) with no-store', async t => {
  cookie = await register();
  const res = await get('/', cookie);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const html = await res.text();
  if (!fs.existsSync(HOME_FILE)) {
    t.diagnostic('SKIPPED shell assertions: toolkit/public/home.html does not exist yet');
    return;
  }
  assert.equal(html, fs.readFileSync(HOME_FILE, 'utf8'), '"/" serves home.html');
  assert.ok(!html.includes(LANDING_MARKER), 'signed-in people never get the landing page');
  const direct = await get('/home.html', cookie);
  assert.equal(direct.status, 200);
  assert.equal(await direct.text(), html, '/home.html behaves like "/"');
});

test('app landing pages: 200 when signed out, 302 to "/" when signed in', async () => {
  for (const url of LANDINGS) {
    const out = await get(url);
    assert.equal(out.status, 200, 'signed out ' + url);
    assert.match(out.headers.get('content-type'), /text\/html/);
    const inn = await get(url, cookie);
    assert.equal(inn.status, 302, 'signed in ' + url);
    assert.equal(inn.headers.get('location'), '/', url);
  }
});

test('/sigma/dashboard (and .html) always redirect to "/"; app pages stay gated', async () => {
  for (const url of ['/sigma/dashboard', '/sigma/dashboard.html']) {
    for (const session of [undefined, cookie]) {
      const res = await get(url, session);
      assert.equal(res.status, 302, url);
      assert.equal(res.headers.get('location'), '/', url);
    }
  }
  for (const url of ['/sigma/editor/abc', '/pigment/app', '/imagevendor/app', '/placeholder/convert.html']) {
    const out = await get(url);
    assert.equal(out.status, 302, url);
    assert.match(out.headers.get('location'), /^\/auth\?next=/, url);
    assert.equal((await get(url, cookie)).status, 200, 'signed in ' + url);
  }
});

test('framing: same-origin only', async () => {
  for (const url of ['/', '/pigment/app']) {
    const res = await get(url, cookie);
    assert.match(res.headers.get('content-security-policy'), /(^|;)\s*frame-ancestors 'self'(;|$)/, url);
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN', url);
  }
});

test('/js/tabs-bridge.js is served as JavaScript when present', async t => {
  if (!fs.existsSync(path.join(PUBLIC, 'js', 'tabs-bridge.js'))) { t.diagnostic('SKIPPED: toolkit/public/js/tabs-bridge.js does not exist yet'); return; }
  const res = await get('/js/tabs-bridge.js');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
});

test('TOOLKIT_REQUIRE_MFA=1: a session still setting up two-step is sent from "/" to the account page', async () => {
  process.env.TOOLKIT_REQUIRE_MFA = '1';
  try {
    const pending = await register();
    const key = crypto.createHash('sha256').update(pending.split('=')[1]).digest('hex');
    assert.equal(db.sessions[key].mfaSetup, true);
    for (const url of ['/', '/home.html']) {
      const res = await get(url, pending);
      assert.equal(res.status, 302, url);
      assert.equal(res.headers.get('location'), '/account?setup-mfa=1', url);
    }
  } finally { delete process.env.TOOLKIT_REQUIRE_MFA; }
});
