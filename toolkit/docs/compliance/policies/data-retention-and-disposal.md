# Data Retention and Disposal Policy

> **DRAFT. Not approved.** Owner: `[OWNER NAME / ROLE]`  Approval date: `[DATE]`  Next review: `[DATE + 12 months]`

## 1. Purpose and scope

Keep personal information only as long as needed for the purpose it was collected (PIPEDA 4.5), and
dispose of it securely (SOC 2 C1.2, ISO 27001 A.8.10). Covers the application database, the security
log, backups and exports.

## 2. Retention schedule (values as implemented)

| Data | Retention | How it ends | Source |
|---|---|---|---|
| Account, projects, paintings, images | Until the user deletes them or the account | Account deletion erases records and sessions immediately and replaces the `db.json.bak` copy | `server/account.js`, `server/store.js` |
| Unconfirmed sign-ups (not yet confirmed by emailed code) | 7 days | Purged automatically | `server/auth.js` (`UNVERIFIED_TTL`) |
| Email confirmation code | 15 minutes, 5 attempts, hash only | Deleted on use, expiry or attempts exhausted | `server/auth.js` |
| Password reset token | 1 hour, single use, hash only | Deleted on use | `server/auth.js` |
| Google sign-in state and desktop handoff | 10 minutes, in memory | Discarded on use or expiry | `server/google.js` |
| Sessions | Hosted 12 h idle / 7 days absolute; local 7 days idle / 30 days absolute | Removed on expiry or sign-out | `server/security.js` |
| Security (audit) log | 365 days by default; `TOOLKIT_AUDIT_RETENTION_DAYS`, minimum 30 | Files older than the period deleted automatically | `server/audit.js` |
| Consent record (version and time) | Life of the account | Erased with the account | `server/auth.js` |
| Last-good copy `db.json.bak` | Replaced at most every 10 minutes; replaced on erasure | Overwritten | `server/store.js` |
| Operator backups | 30 days `[CONFIRM]` | Securely deleted when aged out (roadmap T-06 automates) | `backup-and-continuity.md` |
| `db.json.premigration` (plaintext copy after enabling encryption) | Until confirmed, then immediately | Secure deletion | `OPERATIONS.md` s.4 |
| Breach records | 24 months minimum | Delete after review | `incident-response.md` |
| Individual-rights request log | 24 months `[CONFIRM]` | Delete | `OPERATIONS.md` s.5 |
| Source code history | Indefinite; must not contain personal data or secrets | n/a (an early `db.json` remains in git history; see risk R-15) | `.gitignore` |

## 3. Rules

1. No new personal data field is added without a stated purpose and a retention entry here.
2. Erasure requests are answered within 30 days; for signed-in users deletion is immediate.
3. **Backups and erasure:** deleted data may persist in operator backups until they age out. If an older backup is ever restored, re-apply deletions made since.
4. Exports delivered to a user are not retained after delivery.
5. Disposal means: for files, overwrite or delete and empty trash/OneDrive recycle bin; for cloud snapshots, delete and confirm expiry; for retired hardware, wipe or destroy. Record the date and method.
6. Legal hold: if counsel or a regulator requires it, suspend disposal for the affected data and record who ordered it.

## 4. Evidence

Quarterly check that audit files older than the retention period are gone; backup-prune log;
disposal records; request log.
