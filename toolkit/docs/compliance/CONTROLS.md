# Control map

How each technical control relates to **SOC 2 Trust Services Criteria**, **ISO/IEC 27001:2022
Annex A** and the **PIPEDA** fair-information principles (Schedule 1) and breach provisions.
The mapping is indicative: an auditor decides whether a control satisfies a criterion.

**Status:** `Built` = implemented in code and tested. `Operator` = the software provides it, the
operator must configure or run it. `Org` = a policy or process only the organization can supply
(see [`POLICY-TEMPLATES.md`](POLICY-TEMPLATES.md)).

## 1. Identity and access

| Control | Implementation | SOC 2 | ISO 27001 | PIPEDA | Evidence | Status |
|---|---|---|---|---|---|---|
| Unique accounts, validated identifiers | Strict email syntax + reserved-domain refusal + DNS deliverability (`email-check.js`); unique case-insensitive email | CC6.1, CC6.2 | A.5.16, A.5.17 | 4.6 | `security.test`: email tests | Built |
| Proof of mailbox ownership | Signed single-use verification link, 24 h, hash stored; sign-in blocked until confirmed (when SMTP configured) | CC6.2 | A.5.16 | 4.6 | `mail.test` | Built / Operator (SMTP) |
| Password policy | 12+ chars, 72-byte cap, common/derived passwords refused (`passwords.js`), consent-time check | CC6.1 | A.5.17, A.8.5 | 4.7 | `security.test`: password tests | Built |
| Credential storage | bcrypt (cost 11), never logged or exported | CC6.1 | A.8.5, A.8.24 | 4.7 | `security.test`: export | Built |
| Brute-force protection | Failed-login limiter per client (10 / 15 min), per-account lockout (5 failures / 15 min), signup limiter, uniform failure response | CC6.1, CC6.6 | A.8.5, A.8.16 | 4.7 | `security.test`: login, rate limit | Built |
| Session management | 256-bit random tokens, hashed at rest; idle + absolute expiry; fresh id at login; max 20 per account; HttpOnly, SameSite=Strict, Secure and `__Host-` when hosted | CC6.1, CC6.2 | A.5.15, A.8.5 | 4.7 | `security.test`: sessions | Built |
| Session visibility and revocation | Account page lists sessions, ends one or all others; password change/reset ends all others | CC6.2, CC6.3 | A.5.18 | 4.9 | `security.test`: account | Built |
| Account recovery | Email reset link (1 h, single use, signs out everywhere, owner notified) | CC6.2 | A.5.17 | 4.7 | `mail.test` | Built / Operator (SMTP) |
| Authorization | Ownership checked on every record route; 404 for others' ids; data routes require a session before bodies are parsed | CC6.1, CC6.3 | A.5.15, A.8.3 | 4.7 | `security.test`: ownership | Built |
| Privileged access to the host and database | OS accounts, key custody, SSH, MFA for admins | CC6.1, CC6.3 | A.5.18, A.8.2 | 4.7 | n/a | Org / Operator |
| Multi-factor authentication | Not implemented (recommended next step) | CC6.1 | A.8.5 | 4.7 | n/a | Gap |

## 2. Application and network security

| Control | Implementation | SOC 2 | ISO 27001 | PIPEDA | Evidence | Status |
|---|---|---|---|---|---|---|
| CSRF defence | SameSite=Strict, Origin match, `Sec-Fetch-Site`, required header | CC6.1, CC6.6 | A.8.26 | 4.7 | `security.test`: CSRF | Built |
| Content Security Policy and headers | One strict CSP (no third-party hosts, `script-src 'self'`), HSTS, nosniff, frame-ancestors none, Referrer-Policy, Permissions-Policy, COOP/CORP | CC6.6, CC6.8 | A.8.23, A.8.26 | 4.7 | `security.test`: headers | Built |
| Output encoding / injection | DOM APIs for user data; stored names refuse control and bidi characters | CC6.8 | A.8.28 | 4.7 | browser verification | Built |
| Input validation | Document schema, depth, size and key checks; names; dimensions | CC6.1, CC7.1 | A.8.26, A.8.28 | 4.4, 4.6 | `server.test`, `security.test` | Built |
| Upload validation | Real file signature and dimensions verified server-side and in a shared browser guard; size limits | CC6.8 | A.8.26, A.8.7 | 4.7 | `security.test`, `upload-guard.test` | Built |
| Rate limiting and resource limits | Per-class limiters, per-route body limits, request timeouts, per-account quota | CC6.6, A1.1 | A.8.6, A.8.20 | 4.7 | `security.test` | Built |
| Static file exposure | Allow-list of web assets; tests, reports, dotfiles refused | CC6.1, C1.1 | A.8.3, A.8.9 | 4.7 | `security.test` | Built |
| Transport security | TLS 1.2+ at the reverse proxy (template), HSTS, Secure cookies | CC6.7 | A.8.20, A.8.24 | 4.7 | `deploy/nginx.conf.example` | Operator |
| Third-party code | Libraries pinned, self-hosted, hashes recorded; no external hosts in CSP | CC9.2, CC6.8 | A.5.19-A.5.22, A.8.30 | 4.7 | `placeholder/vendor/VENDOR.md`; browser verification | Built |
| Desktop shell | Sandbox, context isolation, no Node integration, navigation lock, permissions denied, no webview | CC6.6 | A.8.9 | 4.7 | `desktop/main.cjs` | Built |

## 3. Data protection

| Control | Implementation | SOC 2 | ISO 27001 | PIPEDA | Evidence | Status |
|---|---|---|---|---|---|---|
| Encryption at rest | Optional AES-256-GCM of the database; authenticated, key rotation supported | CC6.1, C1.1 | A.8.24 | 4.7 | `security.test`: encryption | Built / Operator (set key) |
| Key management | Key from environment/secret store; generation, backup and rotation procedure | CC6.1 | A.8.24 | 4.7 | `OPERATIONS.md` | Operator |
| Backup and recovery | Rolling last-good copy; refusal to overwrite unreadable data; restore procedure | A1.2, A1.3, CC7.5 | A.8.13 | 4.7 | `OPERATIONS.md` | Built / Operator (off-host copy, restore test) |
| Secure deletion on request | Account deletion erases records and sessions and replaces the backup copy | C1.2, P4 | A.8.10 | 4.5 | `security.test`: erasure | Built |
| Storage limits | Per-account quota | A1.1 | A.8.6 | 4.7 | `security.test`: quota | Built |
| Data minimisation | Only name, email, password hash, content, session metadata and security events are stored; no analytics or tracking | P3 | A.5.34 | 4.4 | privacy notice | Built |

## 4. Logging, monitoring, vulnerabilities, change

| Control | Implementation | SOC 2 | ISO 27001 | PIPEDA | Evidence | Status |
|---|---|---|---|---|---|---|
| Security event log | Sign-ins, failures, lockouts, account changes, exports, deletions, CSRF refusals, rate-limit trips, quota hits; no secrets | CC7.2 | A.8.15, A.8.16 | 4.7 | `security.test`: audit | Built |
| Log integrity | SHA-256 hash chain; `scripts/verify-audit.cjs` | CC7.2 | A.8.15 | 4.7 | `security.test`: audit | Built / Operator (off-host copy, alerting) |
| Log retention | 365 days by default, configurable (minimum 30) | CC7.2 | A.8.15 | 4.5 | `audit.js` | Built |
| Vulnerability management | `npm audit` clean; assessment performed; hidden-character source scan | CC7.1 | A.8.8, A.8.29 | 4.7 | `SECURITY-ASSESSMENT.md`; `npm audit` | Built / Operator (schedule) |
| Regression testing | One command runs every app's suite plus security suites | CC8.1 | A.8.29, A.8.28 | n/a | `npm test` | Built |
| Change management | Pull-request review, approvals, deployment records | CC8.1 | A.8.32 | 4.1 | n/a | Org |
| Incident response | Runbook and breach-record template | CC7.3, CC7.4 | A.5.24-A.5.28 | breach provisions | `OPERATIONS.md` | Org / Operator |
| Independent penetration test | Not performed | CC4.1 | A.8.29 | 4.7 | n/a | Gap (commission one) |

## 5. Privacy (PIPEDA principles and SOC 2 Privacy criteria)

| PIPEDA principle | How it is met | SOC 2 | ISO 27001 | Status |
|---|---|---|---|---|
| 4.1 Accountability | Privacy contact shown in the notice (`TOOLKIT_PRIVACY_CONTACT`); named privacy officer and policies are required | P1, P8 | A.5.34, A.5.36 | Operator / Org |
| 4.2 Identifying purposes | Purposes stated in the notice | P1 | A.5.34 | Built |
| 4.3 Consent | Explicit checkbox at signup; the version and time of acceptance stored with the account | P2 | A.5.34 | Built |
| 4.4 Limiting collection | Minimal data; no analytics, ads, third-party fonts or scripts | P3 | A.5.34 | Built |
| 4.5 Limiting use, disclosure, retention | Stated retention for each data class; deletion erases content; log retention bounded | P4, P6 | A.5.34, A.8.10 | Built |
| 4.6 Accuracy | Name correctable; email verified (when mail configured) | P7 | A.5.34 | Built |
| 4.7 Safeguards | Sections 1 to 4 above | CC6, CC7 | A.8.x | Built / Operator |
| 4.8 Openness | `/privacy` page describing practices in plain language | P1 | A.5.34 | Built |
| 4.9 Individual access | Account page: view profile and sessions, download everything as JSON | P5 | A.5.34 | Built |
| 4.10 Challenging compliance | Complaint contact in the notice; process owned by the organization | P8 | A.5.34 | Org |
| s.10.1 breach reporting (with the Breach of Security Safeguards Regulations) | Runbook: assess real risk of significant harm, report to the Privacy Commissioner, notify individuals, keep records for 24 months | CC7.4, P6 | A.5.24-A.5.28 | Org |
| Cross-border transfers | Operator chooses hosting location; disclose it in the notice | P6 | A.5.34 | Operator |
