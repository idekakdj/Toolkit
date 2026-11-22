const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { dataDirectory } = require('../server/storage-path');
const source = path.resolve(process.argv[2] || path.join(__dirname, '../data/db.json'));
const directory = dataDirectory(), destination = path.join(directory, 'db.json');
const fingerprint = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function validate(bytes) {
  const db = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(db.users) || !Array.isArray(db.projects) || !db.sessions || typeof db.sessions !== 'object') throw new Error('Invalid source database');
  const owners = new Set(), emails = new Set();
  for (const user of db.users) {
    if (!user.id || typeof user.email !== 'string' || typeof user.passwordHash !== 'string' || !/^\$2[aby]\$\d\d\$/.test(user.passwordHash) || owners.has(user.id) || emails.has(user.email)) throw new Error('Invalid or duplicate account');
    owners.add(user.id); emails.add(user.email);
  }
  for (const group of ['projects', 'paintings', 'images']) {
    if (db[group] != null && !Array.isArray(db[group])) throw new Error('Invalid artwork collection');
    for (const item of db[group] || []) if (!owners.has(item.ownerId)) throw new Error('Artwork has an unknown owner');
  }
  return db;
}
try {
  if (source.toLowerCase() === destination.toLowerCase()) throw new Error('Source is already the shared database');
  const lock = path.join(directory, 'runtime.json');
  if (fs.existsSync(lock)) throw new Error('Close the shared Toolkit server/app before migrating');
  const bytes = fs.readFileSync(source), db = validate(bytes);
  fs.mkdirSync(directory, { recursive: true });
  const migrationKey = crypto.randomUUID();
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, port: 0, key: migrationKey, migration: true }), { flag: 'wx' });
  process.once('exit', () => {
    try { if (JSON.parse(fs.readFileSync(lock, 'utf8')).key === migrationKey) fs.unlinkSync(lock); } catch {}
  });
  let previous = null;
  if (fs.existsSync(destination)) {
    previous = fs.readFileSync(destination);
    const old = validate(previous);
    if (fingerprint(previous) === fingerprint(bytes)) { console.log('The shared database already matches the source.'); process.exit(0); }
    if (old.users.length || ['projects', 'paintings', 'images'].some(key => (old[key] || []).length)) throw new Error('Shared database contains existing accounts/artwork; refusing to replace them. Merge must be reviewed separately.');
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(path.dirname(directory), 'migration-backups', stamp);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, 'web-db.json'), bytes, { flag: 'wx' });
  if (previous) fs.writeFileSync(path.join(backupDir, 'desktop-db.json'), previous, { flag: 'wx' });
  if (fingerprint(fs.readFileSync(source)) !== fingerprint(bytes) || JSON.parse(fs.readFileSync(lock, 'utf8')).key !== migrationKey) throw new Error('Database changed during migration. No destination was replaced.');
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(directory, 'migration-' + crypto.randomUUID() + '.tmp');
  fs.writeFileSync(temporary, bytes, { flag: 'wx' });
  validate(fs.readFileSync(temporary));
  fs.renameSync(temporary, destination);
  if (fingerprint(fs.readFileSync(destination)) !== fingerprint(bytes)) throw new Error('Migration verification failed');
  console.log(JSON.stringify({ migrated: true, accounts: db.users.length, projects: db.projects.length,
    paintings: (db.paintings || []).length, images: (db.images || []).length,
    destination, backupDir, passwordHashesAndOwnershipPreserved: true }));
} catch (err) { console.error(err.message); process.exitCode = 1; }
