#!/usr/bin/env node
// Operator tool for account requests that cannot be handled by the user themselves
// (locked out, no mail server configured, deceased, requests received by other means).
// It goes through the same store as the server, so encryption at rest is handled.
//
//   TOOLKIT_DATA_DIR=/var/lib/toolkit TOOLKIT_DATA_KEY=... node scripts/admin.cjs <command> [args]
//
//   list                          accounts (never shows password hashes)
//   export <email> [file]         everything held about one account, as JSON (stdout or file)
//   delete <email> --yes          erase the account, its documents and sessions, and the backup copy
//   set-email <old> <new> --yes   correct an address (validated, must be unused); signs the user out
//   revoke-sessions <email>       sign one account out everywhere
//   reset-mfa <email> --yes       remove two-step sign-in (lost phone and recovery codes); signs the user out
//
// STOP THE SERVICE FIRST. The server keeps the database in memory and would overwrite
// changes made here; this tool refuses to run while the server's lock file exists.
const fs = require('node:fs');
const path = require('node:path');
const { dataDirectory } = require('../server/storage-path');

const dir = dataDirectory();
if (fs.existsSync(path.join(dir, 'runtime.json'))) {
  console.error(`Refusing to run: ${path.join(dir, 'runtime.json')} exists, so a Toolkit server may be using this data.\n` +
    'Stop the service first. If it crashed and left the file behind, delete runtime.json and retry.');
  process.exit(3);
}

const { db, save, eraseDurably } = require('../server/store');
const { audit, eventsFor } = require('../server/audit');
const { normalizeEmail } = require('../server/email-check');

const [command, ...rest] = process.argv.slice(2);
const flag = rest.includes('--yes');
const args = rest.filter(a => a !== '--yes');
const COLLECTIONS = ['projects', 'paintings', 'images'];

function find(emailArg) {
  const parsed = normalizeEmail(emailArg || '');
  const user = parsed.ok ? db.users.find(u => u.email === parsed.email) : null;
  if (!user) { console.error('No account with that email address.'); process.exit(1); }
  return user;
}
const sessionsOf = id => Object.keys(db.sessions).filter(k => db.sessions[k].userId === id);
const done = () => { require('../server/store').flush(); };

switch (command) {
  case 'list': {
    for (const u of db.users) {
      console.log([u.id, u.email, new Date(u.createdAt).toISOString().slice(0, 10), u.emailVerified === false ? 'unverified' : 'ok',
        COLLECTIONS.map(c => db[c].filter(r => r.ownerId === u.id).length).join('/'), u.mfa && u.mfa.enabled ? 'mfa-on' : 'mfa-off'].join('\t'));
    }
    console.log(`\n${db.users.length} account(s). Columns: id, email, created, email status, projects/paintings/images, two-step sign-in`);
    break;
  }
  case 'export': {
    const u = find(args[0]);
    const { passwordHash, failedLogins, lockedUntil, verify, reset, mfa, mfaPending, ...account } = u;
    account.mfa = { enabled: !!(mfa && mfa.enabled), enrolledAt: (mfa && mfa.enrolledAt) || null };   // never the secret or recovery hashes
    const out = { exportedAt: new Date().toISOString(), account, activity: eventsFor(u.id) };
    for (const c of COLLECTIONS) out[c] = db[c].filter(r => r.ownerId === u.id);
    const text = JSON.stringify(out, null, 2);
    if (args[1]) { fs.writeFileSync(args[1], text, { mode: 0o600 }); console.log(`Wrote ${args[1]}`); } else console.log(text);
    audit('admin.export', { userId: u.id, detail: { by: 'admin-cli' } });
    break;
  }
  case 'delete': {
    const u = find(args[0]);
    if (!flag) { console.error(`This permanently erases ${u.email} and all of their work. Re-run with --yes to confirm.`); process.exit(1); }
    const removed = {};
    for (const c of COLLECTIONS) { removed[c] = db[c].filter(r => r.ownerId === u.id).length; db[c] = db[c].filter(r => r.ownerId !== u.id); }
    for (const k of sessionsOf(u.id)) delete db.sessions[k];
    db.users = db.users.filter(x => x.id !== u.id);
    audit('account.delete', { userId: u.id, detail: { ...removed, by: 'admin-cli' } });
    eraseDurably();
    console.log(`Deleted ${u.email}: ${JSON.stringify(removed)}. The rolling backup copy was replaced.`);
    console.log('Operator backups made earlier still contain this data until they expire; see OPERATIONS.md section 3.');
    break;
  }
  case 'set-email': {
    const u = find(args[0]);
    const parsed = normalizeEmail(args[1] || '');
    if (!parsed.ok) { console.error('New address is not valid: ' + parsed.reason); process.exit(1); }
    if (db.users.some(x => x.email === parsed.email)) { console.error('That address is already in use.'); process.exit(1); }
    if (!flag) { console.error(`Change ${u.email} to ${parsed.email}? Verify the owner out of band, then re-run with --yes.`); process.exit(1); }
    u.email = parsed.email;
    if (u.emailVerified === true) u.emailVerified = false;           // the new address has not proved ownership
    for (const k of sessionsOf(u.id)) delete db.sessions[k];
    audit('admin.set-email', { userId: u.id, detail: { by: 'admin-cli' } });
    save(); done();
    console.log(`Updated to ${u.email}. They are signed out and must sign in again (and confirm the new address when mail is configured).`);
    break;
  }
  case 'revoke-sessions': {
    const u = find(args[0]);
    const keys = sessionsOf(u.id);
    for (const k of keys) delete db.sessions[k];
    audit('admin.revoke-sessions', { userId: u.id, detail: { count: keys.length, by: 'admin-cli' } });
    save(); done();
    console.log(`Signed ${u.email} out of ${keys.length} session(s).`);
    break;
  }
  case 'reset-mfa': {
    const u = find(args[0]);
    const keys = sessionsOf(u.id);
    if (!flag) {
      console.error(`This removes two-step sign-in from ${u.email} (${u.mfa && u.mfa.enabled ? 'currently on' : 'currently off'}) and signs them out of ${keys.length} session(s). Verify the owner out of band, then re-run with --yes.`);
      process.exit(1);
    }
    delete u.mfa; delete u.mfaPending;
    for (const k of keys) delete db.sessions[k];
    audit('admin.reset-mfa', { userId: u.id, detail: { count: keys.length, by: 'admin-cli' } });
    save(); done();
    console.log(`Two-step sign-in removed for ${u.email}; signed out of ${keys.length} session(s). They can sign in with their password and set it up again.`);
    break;
  }
  default:
    console.error('Usage: node scripts/admin.cjs list | export <email> [file] | delete <email> --yes | set-email <old> <new> --yes | revoke-sessions <email> | reset-mfa <email> --yes');
    process.exit(command ? 1 : 0);
}
process.exit(0);
