// Security audit trail: append-only JSON Lines, one file per UTC day, each entry
// chained to the previous one with SHA-256 so deletion or editing of any record
// is detectable (see scripts/verify-audit.cjs).
//
// What is logged: authentication and account lifecycle events, authorization
// and CSRF refusals, rate-limit trips, data export/deletion. What is never
// logged: passwords, session tokens, request bodies, document contents. Users
// are referenced by opaque id; unknown emails are referenced by a short hash so
// repeated attacks can be correlated without storing the address.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataDirectory } = require('./storage-path');

const DIR = path.join(dataDirectory(), 'audit');
const RETENTION_DAYS = Math.max(30, Number(process.env.TOOLKIT_AUDIT_RETENTION_DAYS) || 365);
const GENESIS = '0'.repeat(64);

let seq = 0;
let prevHash = GENESIS;
let ready = false;
const throttle = new Map();

function fileFor(date) { return path.join(DIR, `audit-${date.toISOString().slice(0, 10)}.jsonl`); }

function lastLineOf(file) {
  try {
    const text = fs.readFileSync(file, 'utf8').trimEnd();
    const i = text.lastIndexOf('\n');
    return JSON.parse(i === -1 ? text : text.slice(i + 1));
  } catch { return null; }
}

function init() {
  if (ready) return;
  ready = true;
  try {
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
    const files = fs.readdirSync(DIR).filter(f => /^audit-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
    for (let i = files.length - 1; i >= 0; i--) {
      const last = lastLineOf(path.join(DIR, files[i]));
      if (last && typeof last.hash === 'string') { prevHash = last.hash; seq = Number(last.seq) || 0; break; }
    }
    purgeOld();
  } catch (err) { console.error('[audit] init failed:', err.message); }
}

function purgeOld() {
  try {
    const cutoff = Date.now() - RETENTION_DAYS * 86400000;
    for (const f of fs.readdirSync(DIR)) {
      const m = /^audit-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f);
      if (m && Date.parse(m[1] + 'T00:00:00Z') < cutoff) fs.unlinkSync(path.join(DIR, f));
    }
  } catch { /* retention is best effort; never block the app */ }
}
setInterval(() => { if (ready) purgeOld(); }, 24 * 3600 * 1000).unref();

function chain(prev, body) { return crypto.createHash('sha256').update(prev + '\n' + body).digest('hex'); }

function clientIp(req) { return (req && (req.ip || (req.socket && req.socket.remoteAddress))) || ''; }

// Short, non-reversible tag for a value we do not want to store (e.g. an unknown email).
function tag(value) {
  return crypto.createHash('sha256').update('toolkit-audit:' + String(value).toLowerCase()).digest('hex').slice(0, 12);
}

// audit('login.fail', { req, userId, detail: {...}, throttleKey })
function audit(event, { req, userId = null, detail, throttleKey, throttleMs = 60000 } = {}) {
  try {
    if (throttleKey) {
      const now = Date.now();
      if ((throttle.get(throttleKey) || 0) > now) return;
      if (throttle.size > 5000) throttle.clear();
      throttle.set(throttleKey, now + throttleMs);
    }
    init();
    const entry = {
      ts: new Date().toISOString(), seq: ++seq, event,
      user: userId, ip: clientIp(req) || null,
      ua: req && req.headers ? String(req.headers['user-agent'] || '').slice(0, 120) || null : null,
      detail: detail || null,
    };
    const body = JSON.stringify(entry);
    entry.prev = prevHash;
    entry.hash = chain(prevHash, body);
    prevHash = entry.hash;
    fs.appendFileSync(fileFor(new Date()), JSON.stringify(entry) + '\n', { mode: 0o600 });
  } catch (err) { console.error('[audit] write failed:', err.message); }
}

// A user's own security events (for the data-access export). Newest last, capped.
function eventsFor(userId, limit = 500) {
  const out = [];
  try {
    const files = fs.readdirSync(DIR).filter(f => /^audit-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort().reverse();
    for (const f of files) {
      const lines = fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').filter(Boolean).reverse();
      for (const line of lines) {
        let e; try { e = JSON.parse(line); } catch { continue; }
        if (e.user === userId) { out.push({ ts: e.ts, event: e.event, ip: e.ip, agent: e.ua, detail: e.detail }); if (out.length >= limit) return out.reverse(); }
      }
    }
  } catch { /* no log yet */ }
  return out.reverse();
}

// Re-computes the whole chain. Returns { ok, entries, files, error? }.
function verify(dir = DIR) {
  let prev = GENESIS, entries = 0, expectedSeq = null;
  let files;
  try { files = fs.readdirSync(dir).filter(f => /^audit-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort(); }
  catch { return { ok: true, entries: 0, files: 0 }; }
  for (const f of files) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      let e;
      try { e = JSON.parse(line); } catch { return { ok: false, entries, files: files.length, error: `${f}: unreadable entry after #${entries}` }; }
      const { prev: p, hash, ...rest } = e;
      // Retention may have removed older files; the first surviving entry anchors the chain.
      if (entries === 0) prev = p;
      if (p !== prev || chain(prev, JSON.stringify(rest)) !== hash) {
        return { ok: false, entries, files: files.length, error: `${f}: chain broken at seq ${e.seq}` };
      }
      if (expectedSeq !== null && e.seq !== expectedSeq) {
        return { ok: false, entries, files: files.length, error: `${f}: missing entries before seq ${e.seq}` };
      }
      expectedSeq = e.seq + 1; prev = hash; entries++;
    }
  }
  return { ok: true, entries, files: files.length };
}

module.exports = { audit, verify, eventsFor, tag, clientIp, AUDIT_DIR: DIR, RETENTION_DAYS };
