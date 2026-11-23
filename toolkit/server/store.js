// JSON-file data store with atomic, debounced writes.
// Holds users, sessions, projects, paintings and images for every Toolkit app.
//
// Hardening:
//  - Optional AES-256-GCM encryption at rest. Set TOOLKIT_DATA_KEY (32 random bytes,
//    base64 or 64 hex chars). A plaintext database is migrated on first write; set
//    TOOLKIT_DATA_KEY_PREVIOUS while rotating keys. Without a key the file is plain
//    JSON, exactly as before, so desktop and existing installs keep working.
//  - A corrupt or undecryptable database is never overwritten.
//  - A rolling last-good backup (db.json.bak, at most every 10 minutes) supports recovery.
//  - Files are created owner-only (0600) where the platform honours it.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = require('./storage-path').dataDirectory();
const DB_FILE = path.join(DATA_DIR, 'db.json');
const MAGIC = Buffer.from('TKENC1');
const BACKUP_EVERY_MS = 10 * 60 * 1000;
const DEBOUNCE_MS = 250;
const MAX_DELAY_MS = 2000;        // a continuous stream of saves can never postpone a flush longer than this

function parseKey(value) {
  if (!value || !value.trim()) return null;
  const s = value.trim();
  const buf = /^[0-9a-fA-F]{64}$/.test(s) ? Buffer.from(s, 'hex') : Buffer.from(s, 'base64');
  if (buf.length !== 32) throw new Error('TOOLKIT_DATA_KEY must be exactly 32 bytes (64 hex characters or base64).');
  return buf;
}
const KEY = parseKey(process.env.TOOLKIT_DATA_KEY);
const PREVIOUS_KEY = parseKey(process.env.TOOLKIT_DATA_KEY_PREVIOUS);

function encrypt(plain, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}
// Returns { plain, keyIndex } or throws when no supplied key authenticates the file.
function decrypt(file, keys) {
  const iv = file.subarray(6, 18), tag = file.subarray(18, 34), body = file.subarray(34);
  for (let i = 0; i < keys.length; i++) {
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', keys[i], iv);
      d.setAAD(MAGIC); d.setAuthTag(tag);
      return { plain: Buffer.concat([d.update(body), d.final()]), keyIndex: i };
    } catch { /* try the next key */ }
  }
  throw new Error('the data key is missing or wrong');
}

let db = { users: [], sessions: {}, projects: [], paintings: [], images: [] };
let writeTimer = null;
let writing = false;
let dirtyAgain = false;
let pendingWrite = false;
let plaintextOnDisk = false;     // true while the file on disk is unencrypted but a key is configured
let lastBackup = 0;
let flushError = null;           // last write error, null after a successful flush
let dirtySince = 0;              // when the oldest unflushed change was made

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE);
      let text;
      if (raw.length >= 34 && raw.subarray(0, 6).equals(MAGIC)) {
        if (!KEY) throw new Error('the database is encrypted but TOOLKIT_DATA_KEY is not set');
        const { plain, keyIndex } = decrypt(raw, [KEY, PREVIOUS_KEY].filter(Boolean));
        text = plain.toString('utf8');
        if (keyIndex > 0) pendingWrite = true;           // re-encrypt under the new key
      } else {
        text = raw.toString('utf8');
        if (KEY) { plaintextOnDisk = true; pendingWrite = true; }
      }
      db = JSON.parse(text);
    }
    db.users = db.users || [];
    db.sessions = db.sessions || {};
    db.projects = db.projects || [];
    db.paintings = db.paintings || [];
    db.images = db.images || [];
  } catch (err) {
    throw new Error('Cannot load Toolkit database; refusing to overwrite existing data: ' + err.message);
  }
}

function flush() {
  if (!pendingWrite) return;
  if (writing) { dirtyAgain = true; return; }
  writing = true;
  pendingWrite = false;
  dirtySince = 0;
  flushError = null;
  let migrating = false;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    const plain = Buffer.from(JSON.stringify(db));
    const out = KEY ? encrypt(plain, KEY) : plain;
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, out, { mode: 0o600 });
    const exists = fs.existsSync(DB_FILE);
    if (KEY && plaintextOnDisk) {
      // First encrypted write: prove the new file decrypts to the same data, and keep
      // the old plaintext copy (once) so a mistake can never lose data.
      const check = decrypt(fs.readFileSync(tmp), [KEY]).plain;
      if (!check.equals(plain)) throw new Error('encrypted copy failed verification');
      if (exists) fs.copyFileSync(DB_FILE, DB_FILE + '.premigration');
      console.warn('[store] Database is now encrypted. A plaintext copy remains at db.json.premigration; delete it securely once you have confirmed the app works.');
      plaintextOnDisk = false;
      migrating = true;
    }
    // While migrating, the .bak copy is taken after the rename (below) so it is ciphertext.
    if (exists && !migrating && Date.now() - lastBackup > BACKUP_EVERY_MS) {
      try { fs.copyFileSync(DB_FILE, DB_FILE + '.bak'); lastBackup = Date.now(); } catch { /* backup is best effort */ }
    }
    fs.renameSync(tmp, DB_FILE);
    if (migrating) {
      // An older .bak may still hold the plaintext database. Replace it with a copy of the
      // encrypted file; if that is impossible, remove it rather than leave plaintext behind.
      const bak = DB_FILE + '.bak';
      try { fs.copyFileSync(DB_FILE, bak); lastBackup = Date.now(); }
      catch { try { fs.rmSync(bak, { force: true }); } catch { /* reported by the operator runbook */ } }
    }
  } catch (err) {
    pendingWrite = true;
    console.error('[store] write failed:', err.message);
    flushError = err;
  } finally {
    writing = false;
    if (dirtyAgain) { dirtyAgain = false; flush(); }
  }
}

function save() {
  pendingWrite = true;
  if (!dirtySince) dirtySince = Date.now();
  clearTimeout(writeTimer);
  // Debounce bursts, but never hold an acknowledged change longer than MAX_DELAY_MS.
  writeTimer = setTimeout(flush, Math.max(0, Math.min(DEBOUNCE_MS, dirtySince + MAX_DELAY_MS - Date.now())));
}

// Write now; throws if the data could not be written (flush() itself only logs and retries).
function flushStrict() {
  clearTimeout(writeTimer);
  flush();
  if (pendingWrite || writing) {
    throw new Error('the database was not written to disk' + (flushError ? ': ' + flushError.message : ''));
  }
}

// Write now and replace the rolling backup with the current state. Used after an
// erasure request so deleted personal data does not linger in db.json.bak.
function eraseDurably() {
  pendingWrite = true;
  flushStrict();
  if (fs.existsSync(DB_FILE)) {
    try { fs.copyFileSync(DB_FILE, DB_FILE + '.bak'); lastBackup = Date.now(); }
    catch (err) { throw new Error('the backup copy could not be replaced: ' + err.message); }
  }
}

// Load before registering shutdown writers: a corrupt file must never be replaced.
load();
if (pendingWrite) save();       // migrate to encryption / newest key soon after startup

// Flush pending writes on shutdown.
process.on('exit', () => { clearTimeout(writeTimer); flush(); });
process.on('SIGINT', () => { process.exit(0); });
process.on('SIGTERM', () => { process.exit(0); });

module.exports = { db, save, flush, flushStrict, eraseDurably, encryptionEnabled: !!KEY };
