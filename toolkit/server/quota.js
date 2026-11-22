// Per-account storage quota. The whole database lives in server memory and is
// rewritten as one file, so unbounded per-user growth is an availability risk
// (one account could exhaust memory for everyone). Quota counts the serialized
// size of every document and thumbnail an account owns across all apps.
//
// TOOLKIT_USER_QUOTA_MB: default 512; 0 disables the limit.
const { db } = require('./store');

const COLLECTIONS = ['projects', 'paintings', 'images'];
const MB = 1024 * 1024;

function limitBytes() {
  const raw = process.env.TOOLKIT_USER_QUOTA_MB;
  const mb = raw === undefined || raw === '' ? 512 : Number(raw);
  return Number.isFinite(mb) && mb > 0 ? mb * MB : Infinity;
}

// Cached on the record; computed once for records saved before quotas existed.
function recordBytes(record) {
  if (!Number.isFinite(record.docBytes)) {
    record.docBytes = Buffer.byteLength(JSON.stringify(record.document || {})) + (record.thumbnail ? record.thumbnail.length : 0);
  }
  return record.docBytes;
}

function usage(userId, except) {
  let total = 0;
  for (const c of COLLECTIONS) {
    for (const rec of db[c] || []) if (rec.ownerId === userId && rec !== except) total += recordBytes(rec);
  }
  return total;
}

// True when `record` may grow to `newBytes`. Shrinking is always allowed so a user
// who is over quota can still free space by deleting or trimming.
function withinQuota(userId, record, newBytes) {
  const limit = limitBytes();
  if (limit === Infinity) return true;
  if (newBytes <= recordBytes(record)) return true;
  return usage(userId, record) + newBytes <= limit;
}

module.exports = { withinQuota, recordBytes, usage, limitBytes };
