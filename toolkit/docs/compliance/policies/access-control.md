# Access Control Policy

> **DRAFT. Not approved.** Owner: `[OWNER NAME / ROLE]`  Approval date: `[DATE]`  Next review: `[DATE + 12 months]`

## 1. Purpose and scope

Ensure only authorised people and systems reach Toolkit systems, secrets and data. Covers (a)
end-user access to the application and (b) administrative access to the host, database files,
source repository, cloud consoles, mail provider, DNS and signing keys.

## 2. End-user access (as built in the application)

| Control | Setting | Source |
|---|---|---|
| Account identity | Unique email; established providers only; mailbox proven by emailed 6-digit code (15 min, 5 attempts) before first sign-in | `server/auth.js`, `server/email-check.js`, `server/email-providers.js` |
| Password | At least 10 characters with a capital, a number and a symbol; 72-byte maximum; common and derived passwords refused; bcrypt cost 11 | `server/passwords.js` |
| Google sign-in | OIDC authorization code with PKCE, state and nonce; verified email required | `server/google.js` |
| Lockout and limits | 5 failures per account per 15 min; 10 failed sign-ins per client per 15 min | `server/security.js` |
| Sessions | Hosted 12 h idle and 7 days absolute; local 7 days idle and 30 days absolute; maximum 20 per account; users can end sessions | `server/security.js`, `server/account.js` |
| Multi-factor | Not yet available (roadmap T-01) | n/a |

## 3. Administrative access

1. **Individual accounts only.** No shared logins. Service accounts are documented with an owner.
2. **MFA is mandatory** on: GitHub, hosting console, Google Cloud project holding the OAuth client, mail provider, DNS registrar, password manager, and the code-signing service.
3. **Least privilege.** Server access uses a non-root account and `sudo` only when required; the Toolkit service runs as a dedicated unprivileged user (`deploy/toolkit.service.example`).
4. **Secrets** (`TOOLKIT_DATA_KEY`, SMTP URL, Google client secret) live in `/etc/toolkit/toolkit.env` (mode 600) or `%APPDATA%\Toolkit\.env`, are git-ignored (`.gitignore`, test in `security.test`), and are shared only through a password manager.
5. **Administrative utility** `scripts/admin.cjs` is run only by named administrators, with the service stopped; each action is audited.
6. **Remote administration** is over SSH keys or a VPN; no password SSH; firewall exposes 80/443 only.

## 4. Joiner, mover, leaver

| Event | Steps | Evidence |
|---|---|---|
| Joiner | Written request approved by `[OWNER]`; confirm training and confidentiality terms; grant least privilege; enable MFA; add to access list | Ticket / PR note |
| Mover | Re-approve required access; remove what is no longer needed within 5 working days | Updated access list |
| Leaver | Revoke all access and rotate any secret they knew on the same day; recover devices; remove from GitHub and consoles | Leaver checklist |

## 5. Access review

Quarterly the owner reviews the access list for every system in section 3 and the account report for
the application (roadmap T-08), removes dormant or excess access, and records date, reviewer and
actions. Emergency (break-glass) access, if any, is logged and reviewed within 2 working days.

## 6. Authentication standards

Passwords for administrative accounts: password manager generated, 16+ characters. MFA: authenticator
app or hardware key; SMS only as last resort. Keys: SSH keys protected by passphrase.

## 7. Evidence

Access list with approvals, quarterly review records, MFA enrolment screenshots, leaver checklists.
