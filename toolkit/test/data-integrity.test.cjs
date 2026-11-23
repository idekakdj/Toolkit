// Regression tests for store durability and the operator tool. Every test uses its own
// temporary TOOLKIT_DATA_DIR in a child process; nothing here touches real data.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const DAY = 24 * 60 * 60 * 1000;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-integrity-'));
const node = (dir, script, extra = {}) => spawnSync(process.execPath, ['-e', script], {
  cwd: root, encoding: 'utf8', env: { ...process.env, TOOLKIT_DATA_DIR: dir, TOOLKIT_DATA_KEY: '', ...extra },
});
const admin = (dir, ...args) => spawnSync(process.execPath, [path.join(root, 'scripts', 'admin.cjs'), ...args], {
  encoding: 'utf8', env: { ...process.env, TOOLKIT_DATA_DIR: dir, TOOLKIT_DATA_KEY: '' },
});
const seedUsers = users => `const s=require('./server/store');s.db.users.push(...${JSON.stringify(users)});s.save();s.flush();`;
const readDb = dir => JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8'));

test('admin set-email: a verified account is not purged by the 7-day cleanup, a stale pending one still is', () => {
  const dir = tmp();
  const old = Date.now() - 30 * DAY;
  node(dir, seedUsers([
    { id: 'est', name: 'Est', email: 'est@example.org', createdAt: old, emailVerified: true },
    { id: 'pend', name: 'Pend', email: 'pend@example.org', createdAt: old, emailVerified: false },
    { id: 'gone', name: 'Gone', email: 'gone@example.org', createdAt: old, emailVerified: false, unverifiedSince: Date.now() - 8 * DAY },
  ]));
  const r = admin(dir, 'set-email', 'est@example.org', 'est2@example.org', '--yes');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readDb(dir).users.find(u => u.id === 'est').emailVerified, false);
  const purged = node(dir, "const a=require('./server/auth');a.purgeUnverified();console.log(JSON.stringify(require('./server/store').db.users.map(u=>u.id)))");
  assert.equal(purged.status, 0, purged.stderr);
  assert.deepEqual(JSON.parse(purged.stdout.trim().split('\n').pop()), ['est'], 'established account kept; never-verified and 8-day-old unverified purged');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('admin set-email: reset and verification tokens issued to the old mailbox are revoked', () => {
  const dir = tmp();
  node(dir, seedUsers([{ id: 'u1', name: 'Ann', email: 'ann@example.org', createdAt: Date.now(), emailVerified: true,
    reset: { hash: 'a'.repeat(64), expires: Date.now() + 1e6, sentAt: 1 }, verify: { hash: 'b'.repeat(64), expires: Date.now() + 1e6, sentAt: 1, attempts: 0 } }]));
  assert.equal(admin(dir, 'set-email', 'ann@example.org', 'ann2@example.org', '--yes').status, 0);
  const u = readDb(dir).users[0];
  assert.equal(u.email, 'ann2@example.org');
  assert.equal(u.reset, undefined, 'old reset token must not survive');
  assert.equal(u.verify, undefined, 'old verification code must not survive');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('erasure never reports success when the write fails', () => {
  for (const blocker of ['db.json.tmp', 'db.json.bak']) {
    const dir = tmp();
    node(dir, seedUsers([{ id: 'u1', name: 'Ann', email: 'ann@example.org', createdAt: Date.now(), emailVerified: true },
      { id: 'u2', name: 'Bob', email: 'bob@example.org', createdAt: Date.now(), emailVerified: true }]));
    fs.mkdirSync(path.join(dir, blocker));                 // makes that write fail
    const del = admin(dir, 'delete', 'ann@example.org', '--yes');
    assert.notEqual(del.status, 0, blocker + ': admin delete must fail loudly\n' + del.stdout);
    assert.doesNotMatch(del.stdout, /Deleted ann/, blocker);
    const lib = node(dir, "const s=require('./server/store');s.db.users.length=0;try{s.eraseDurably();console.log('OK')}catch(e){console.log('THROWN')}");
    assert.match(lib.stdout, /THROWN/, blocker + ': eraseDurably must throw');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('admin set-email reports failure when the database cannot be written', () => {
  const dir = tmp();
  node(dir, seedUsers([{ id: 'u1', name: 'Ann', email: 'ann@example.org', createdAt: Date.now(), emailVerified: true }]));
  fs.mkdirSync(path.join(dir, 'db.json.tmp'));
  const r = admin(dir, 'set-email', 'ann@example.org', 'ann2@example.org', '--yes');
  assert.notEqual(r.status, 0);
  assert.doesNotMatch(r.stdout, /Updated to/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('encryption migration leaves no plaintext in db.json.bak', () => {
  const dir = tmp();
  const key = Buffer.alloc(32, 5).toString('base64');
  const write = n => node(dir, `const s=require('./server/store');s.db.users.push({id:'u${n}',email:'plain-marker-${n}@example.com'});s.save();s.flush();`);
  write(1); write(2);                                      // the second run creates a plaintext db.json.bak
  assert.ok(fs.readFileSync(path.join(dir, 'db.json.bak'), 'utf8').includes('plain-marker'));
  const m = node(dir, "const s=require('./server/store');setTimeout(()=>s.flush(),50);setTimeout(()=>{},300)", { TOOLKIT_DATA_KEY: key });
  assert.equal(m.status, 0, m.stderr);
  assert.equal(fs.readFileSync(path.join(dir, 'db.json')).subarray(0, 6).toString(), 'TKENC1');
  assert.ok(fs.existsSync(path.join(dir, 'db.json.premigration')), 'the single, documented plaintext copy');
  const bak = fs.readFileSync(path.join(dir, 'db.json.bak'));
  assert.equal(bak.subarray(0, 6).toString(), 'TKENC1', 'the backup is ciphertext');
  assert.ok(!bak.includes('plain-marker'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('continuous saves cannot postpone a flush beyond the maximum delay', () => {
  const dir = tmp();
  const script = "const fs=require('fs'),path=require('path');const s=require('./server/store');let n=0;"
    + "const t=setInterval(()=>{s.db.users.push({id:'x'+(n++)});s.save();},50);"
    + "setTimeout(()=>{console.log(fs.existsSync(path.join(process.env.TOOLKIT_DATA_DIR,'db.json'))?'FLUSHED':'STARVED');clearInterval(t);process.exit(0)},3000);";
  const r = node(dir, script);
  assert.match(r.stdout, /FLUSHED/, 'debounce must be capped; output: ' + r.stdout + r.stderr);
  fs.rmSync(dir, { recursive: true, force: true });
});
