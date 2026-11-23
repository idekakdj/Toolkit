# Backup and Business Continuity Policy

> **DRAFT. Not approved.** Owner: `[OWNER NAME / ROLE]`  Approval date: `[DATE]`  Next review: `[DATE + 12 months]`

## 1. Purpose and scope

Recover Toolkit and users' data after loss, corruption or outage (SOC 2 A1.2, CC7.5, CC9.1; ISO
27001 A.8.13, A.5.29, A.5.30). Covers the hosted database (`db.json`), the audit log (`audit/`),
configuration and the keys needed to read them.

## 2. Objectives (to be confirmed)

| Measure | Target `[CONFIRM]` | Notes |
|---|---|---|
| RPO (maximum data loss) | 24 hours | Daily off-machine backup |
| RTO (time to restore service) | 8 hours | Single-process service; rebuild on a new host from backup |
| Backup retention | 30 days | Balance recovery with erasure (see `data-retention-and-disposal.md`) |

## 3. What exists today

| Control | Status | Source |
|---|---|---|
| Atomic writes; refusal to overwrite an unreadable or undecryptable database | Built | `server/store.js` |
| Rolling last-good copy `db.json.bak` (at most every 10 minutes), replaced on account erasure | Built, same machine only | `server/store.js` |
| AES-256-GCM encryption at rest with key rotation | Built, optional | `server/store.js`; `OPERATIONS.md` s.4 |
| Off-machine encrypted backup | **Missing** (roadmap T-06) | n/a |
| Restore test | **Missing** (T-06, quarterly) | n/a |

## 4. Procedure

1. **Backup:** daily copy of the data directory to storage that is separate from the host and from the key. Encrypt backups (they are already ciphertext when `TOOLKIT_DATA_KEY` is set, but protect the destination too). Alert on failure.
2. **Key custody:** `TOOLKIT_DATA_KEY` is stored in the password manager and in a second sealed location held by `[BACKUP KEY HOLDER]`. Without it backups are unreadable. Record who can recover it.
3. **Restore test:** every quarter restore the latest backup into a scratch directory, open it, run `scripts/verify-audit.cjs`, count accounts, and record date, backup age, duration, result and tester.
4. **Restore for real:** stop the service, replace `db.json`, start. Re-apply erasures done since the backup. Check the start-up warnings.
5. **Desktop app:** data lives in `%APPDATA%\Toolkit\data`; users are told how to copy it; installers are kept for every version.
6. **Configuration:** `/etc/toolkit/toolkit.env`, nginx and systemd units are in `deploy/` templates and a private record of values `[LOCATION]`.

## 5. Disaster scenarios and response

| Scenario | Response |
|---|---|
| Host lost or compromised | Provision a new host from `deploy/` templates, restore backup, rotate all secrets, follow `incident-response.md` if compromise |
| Database corrupted | Server refuses to start without overwriting; restore `db.json.bak` or the latest backup |
| Key lost | Data unrecoverable; keep key backup (section 4.2) |
| Provider outage | Wait or move to another region from backup; communicate status to users |
| Mail provider outage | Sign-ups pause (confirmation by code is mandatory); existing accounts unaffected |

## 6. Evidence

Backup job logs, restore-test records, key-custody record, annual continuity review notes.
