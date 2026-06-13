// Simple JSON-file data store with atomic, debounced writes.
// Holds users, sessions and projects for Sigma.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let db = { users: [], sessions: {}, projects: [] };
let writeTimer = null;
let writing = false;
let dirtyAgain = false;

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db.users = db.users || [];
      db.sessions = db.sessions || {};
      db.projects = db.projects || [];
    }
  } catch (err) {
    console.error('[store] failed to load db, starting fresh:', err.message);
    db = { users: [], sessions: {}, projects: [] };
  }
}

function flush() {
  if (writing) { dirtyAgain = true; return; }
  writing = true;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error('[store] write failed:', err.message);
  } finally {
    writing = false;
    if (dirtyAgain) { dirtyAgain = false; flush(); }
  }
}

function save() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(flush, 250);
}

// Flush pending writes on shutdown.
process.on('exit', () => { clearTimeout(writeTimer); flush(); });
process.on('SIGINT', () => { process.exit(0); });
process.on('SIGTERM', () => { process.exit(0); });

load();

module.exports = { db, save };
