# Operations guide

Everything the software cannot do for you: configuration, routines and procedures.
Names in `CODE FONT` are environment variables; see `deploy/toolkit.env.example`.

## 1. Before going live (hosted deployment)

- [ ] **TLS everywhere.** Use `deploy/nginx.conf.example` (TLS 1.2+, rate and body limits, timeouts). Node listens on loopback only.
- [ ] **Encryption key.** Generate once: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Set `TOOLKIT_DATA_KEY` in `/etc/toolkit/toolkit.env` (root-owned, mode 600). **Back the key up separately from the data**, for example in a password manager or secrets service; without it the database is unreadable.
- [ ] **Email (required for sign-ups).** Every new account must confirm its address with an emailed 6-digit code, so **sign-ups are paused until email is configured**. Set `TOOLKIT_SMTP_URL` and `TOOLKIT_MAIL_FROM`, or run `node scripts/setup-mail.cjs` (writes `mail.json` in the data folder; used by the desktop app). Existing accounts are unaffected. Publish SPF, DKIM and DMARC for the sender domain.
- [ ] **Privacy contact.** Set `TOOLKIT_PRIVACY_CONTACT` to a monitored mailbox. Have counsel review `public/privacy.html`.
- [ ] **Run unprivileged.** Use `deploy/toolkit.service.example` (dedicated user, sandboxing, memory ceiling).
- [ ] **Start-up check.** `npm run start:hosted` prints a `[security]` warning for every safeguard that is off. Treat each as a to-do.
- [ ] **Firewall.** Only 80/443 public. Administration over a VPN or bastion with MFA.
- [ ] **Time sync** (chrony/systemd-timesyncd): log timestamps and token expiry depend on it.
- [ ] Delete the legacy `toolkit/data/db.json` once the migrated database is confirmed complete.
- [ ] Rebuild the desktop installer (`npm run build:desktop`) so distributed copies carry these changes.

## 2. Routines

| Frequency | Task |
|---|---|
| Daily | Automated off-host copy of the data directory (see section 3). Alert if it fails |
| Daily | `node scripts/verify-audit.cjs` (exit code 2 means the chain is broken: treat as an incident). Ship `audit/` to your log system |
| Weekly | `npm audit` in `toolkit/`; apply patches, run `npm test`, deploy. Critical advisories: within days |
| Weekly | Review the audit log for spikes in `login.fail`, `login.locked`, `ratelimit.hit`, `csrf.blocked`, `quota.exceeded` |
| Monthly | Update Node.js and the OS; review accounts and who has server access |
| Quarterly | Restore a backup into a scratch directory and open it (a backup you have not restored is a hope, not a backup) |
| Annually | Rotate `TOOLKIT_DATA_KEY` (section 4); review the policies, risk register and vendor list; commission a penetration test |

## 3. Backup and recovery

What to back up: the whole `TOOLKIT_DATA_DIR` (`db.json`, `audit/`). `db.json.bak` is an automatic
last-good copy, not a substitute for an off-host backup. When encryption is enabled the files are
ciphertext, so backups are protected too, **but they are useless without the key.**

- **Stop-free copy:** the file is replaced atomically, so copying `db.json` is consistent. Use filesystem snapshots where available.
- **Restore:** stop the service, replace `db.json` with the backup, start. Wrong or missing key: the server refuses to start and leaves the file untouched.
- **Do not** restore an old backup over newer data without considering account deletions made since (below).
- **Erasure and backups:** the automatic copy is replaced when an account is deleted. Operator-made backups still contain the data until they age out; keep a short backup retention period (for example 30 days), record it in your privacy notice, and re-apply deletions if you ever restore an older backup.

## 4. Key rotation

1. Set `TOOLKIT_DATA_KEY_PREVIOUS` to the old key and `TOOLKIT_DATA_KEY` to a new one.
2. Restart. The server decrypts with either key and rewrites the database under the new key.
3. Confirm it started and `db.json` opens, then remove `TOOLKIT_DATA_KEY_PREVIOUS`.
4. Retire old backups encrypted under the old key per your retention schedule.

**Enabling encryption on an existing install:** set `TOOLKIT_DATA_KEY` and restart. The first write
encrypts the database after verifying the encrypted copy, and leaves one plaintext copy,
`db.json.premigration`. Confirm everything works, then **delete that file securely**. The
migration replaces `db.json.bak` with a copy of the encrypted file. If you enabled encryption on an
older version, `db.json.bak` may still be plaintext (it does not start with `TKENC1`): delete it
securely too, and also any plaintext copies you made yourself (operator backups, snapshots).

## 5. Handling individual-rights requests

| Request | How |
|---|---|
| Access / copy of data | The user downloads it from **Account → Download my data**. If they cannot sign in, verify their identity by another means first, then (service stopped) `node scripts/admin.cjs export <email> file.json` and deliver it securely |
| Correction | Name: Account page. Email change: verify the owner of the new address out of band, then (service stopped) `node scripts/admin.cjs set-email <old> <new> --yes`; the user is signed out, outstanding reset and confirmation codes are revoked, and the address must be re-confirmed within 7 days of the change or the unconfirmed account is removed by the hourly cleanup |
| Deletion / withdrawal of consent | **Account → Delete account** (immediate and irreversible). For a user who cannot sign in: verify identity, then (service stopped) `node scripts/admin.cjs delete <email> --yes`. Respond within the statutory period (30 days under PIPEDA) |
| Locked out, no mail server | Verify identity, then `node scripts/admin.cjs revoke-sessions <email>`; with mail configured the user can reset their own password |
| Complaint | Acknowledge, investigate, correct practices if justified, and tell the user they may also contact the Office of the Privacy Commissioner of Canada |

`scripts/admin.cjs` goes through the same store as the server (so encryption is handled), refuses to
run while the server's lock file exists, never prints password hashes, and records each action in the
audit log. Run `node scripts/admin.cjs` with no arguments for usage.

Keep a log of each request (date, type, outcome). Security-log entries retain an anonymous account id
and IP address until the retention period expires; the privacy notice says so.

## 6. Incident response

1. **Detect and triage** (alerts, `verify-audit` failure, user reports). Record the time and who is leading.
2. **Contain.** Revoke exposure: rotate secrets, block the source address at the proxy, disable the affected route, or take the service offline. To sign everyone out: with the service stopped, set `db.sessions = {}`.
3. **Preserve evidence.** Copy `audit/` and the proxy logs to read-only storage before changing anything.
4. **Assess.** What data, whose, how many, whether it was encrypted, and whether there is a **real risk of significant harm** (sensitivity of the information and probability it is misused).
5. **Report and notify.** If a breach of security safeguards creates a real risk of significant harm, PIPEDA requires you to **report to the Office of the Privacy Commissioner of Canada and notify affected individuals as soon as feasible**, and to tell other organizations that may reduce the harm. Notices must describe what happened, the information involved, steps taken and what individuals can do.
6. **Record.** Keep a record of **every** breach of security safeguards, reportable or not, for **24 months**: date, circumstances, information involved, whether it was reported, and the harm assessment.
7. **Recover and learn.** Restore from a verified backup if needed, fix the cause, add a regression test, and review what detection missed.

Breach record template: `date detected | date occurred | summary | data and number of people | encrypted? | harm assessment | OPC reported (date) | individuals notified (date) | actions | owner`.

## 7. Retention

| Data | Kept | Then |
|---|---|---|
| Account, projects, paintings, images | Until the user deletes them | Erased immediately; backup copy replaced |
| Sessions | Hosted: 12 h idle / 7 d maximum. Local: 7 d idle / 30 d maximum | Removed automatically |
| Email confirmation code | 15 min, 5 attempts; unconfirmed sign-ups purged after 7 days | Removed on use, expiry or purge |
| Password reset token | 1 h, single use | Removed on use or expiry check |
| Security log | `TOOLKIT_AUDIT_RETENTION_DAYS` (default 365, minimum 30) | Files deleted automatically |
| Operator backups | Your schedule (recommend 30 days) | Securely deleted |

## 8. What to configure at the infrastructure layer

OS patching and hardening, firewall, SSH keys and MFA, disk encryption, time sync, monitoring and
alerting, off-host log storage, DDoS protection, DNS security (DNSSEC, CAA), and certificate renewal
monitoring. These are outside the application but are part of any SOC 2 or ISO 27001 scope.
