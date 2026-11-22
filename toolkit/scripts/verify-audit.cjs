#!/usr/bin/env node
// Verify the integrity of the security audit log.
//
//   TOOLKIT_DATA_DIR=/var/lib/toolkit node scripts/verify-audit.cjs
//
// Each entry carries a SHA-256 hash covering the previous entry, so an edited or deleted
// record in the middle of the log breaks the chain. Run this on a schedule and alert on a
// non-zero exit. NOTE: an attacker with write access to the server can still delete the
// NEWEST entries or rewrite the whole chain; ship the log off the host (a log collector or
// write-once storage) so a compromised server cannot erase its own history.
const { verify, AUDIT_DIR, RETENTION_DAYS } = require('../server/audit');

const result = verify();
console.log(`Audit directory : ${AUDIT_DIR}`);
console.log(`Retention       : ${RETENTION_DAYS} days`);
console.log(`Files / entries : ${result.files} / ${result.entries}`);
if (result.ok) {
  console.log('Chain           : OK, no gaps or alterations detected');
  process.exit(0);
}
console.error('Chain           : BROKEN - ' + result.error);
process.exit(2);
