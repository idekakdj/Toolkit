# Security assessment

**Date:** 2026-10-29  **Scope:** the Toolkit server (`toolkit/server`), the shell pages, and the
browser code of Sigma, Pigment, ImageVendor and Placeholder; the hosted deployment templates;
the Electron desktop shell; npm dependencies.
**Method:** manual source review of every server module and every `innerHTML`/file-input path,
automated dependency audit, secret and hidden-character scans, and *live probes* against an
isolated server to confirm each suspected weakness before changing anything. Every fix below was
re-tested and is covered by an automated test (see the last column).

## Findings and fixes

Severity is the assessor's judgement of impact × likelihood for a hosted deployment.

| ID | Severity | Finding | Evidence | Fix | Test |
|---|---|---|---|---|---|
| F-01 | **High** | **Email addresses were not validated.** The pattern accepted `a@..com`, `bad@-.-x`, `a@b.c1`, `a@1.2.3.4`; nothing proved the person owns the mailbox. | Live probe: all returned HTTP 201 | Strict RFC-subset syntax; reserved/private TLDs refused; internationalised domains canonicalised to punycode; header-injection characters rejected; DNS check refuses domains that cannot receive mail (NXDOMAIN, no MX/A, null MX) but never blocks on resolver trouble; when SMTP is configured, accounts must confirm their address and gain password reset | `security.test` (email syntax, deliverability, registration); `mail.test` |
| F-01b | **High** | **Made-up mailboxes at real domains could still sign up** (reported by the owner, 2026-11-20). The DNS check only proves a *domain* accepts mail; `nobody-xyz@gmail.com` passed, and without a mail server nothing confirmed the address. | Live probe: account created and usable | Email confirmation is now **mandatory**: a 6-digit code (15 min, 5 attempts, hash stored) must be entered before an account can sign in; without a mail server sign-ups are refused (503) rather than skipped. Unconfirmed sign-ups can be re-claimed by the real mailbox owner and are purged after 7 days. Mail can be configured by file (`setup-mail.cjs`) for the desktop app | `mail.test` (10 tests); browser verification |
| F-02 | **High** | **bcrypt silently ignores bytes after 72.** A password differing only after byte 72 authenticated as the original. | Live probe: login with a different tail returned 200 | Policy caps passwords at 72 bytes (rejects instead of truncating) and requires at least 10 characters, a capital, a number and a symbol (was 12 at the time of this finding; policy since revised) | `security.test` (72-byte) |
| F-03 | **High** | **Developer files were served to anonymous users:** `pigment/tests/*.cjs`, `imagevendor/REVIEW.md`, `placeholder/README.md`, report files. The static mounts exposed whole application folders. | Live probe: all returned 200 | Static files come from an allow-list of web asset types; anything under `tests/`, dotfiles, `.md`, `.cjs` and Windows alias forms (`::$DATA`, trailing dot) are refused | `security.test` (internal files) |
| F-04 | **High** | **Unauthenticated requests made the server parse up to 25 MB bodies** before the 401 (memory/CPU amplification). | Live probe: 20 MB POST read in full, then 401 | Authentication runs before body parsing; per-route limits (auth 16 KB, account 16 KB, projects/paintings 10 MB, images 27 MB) | `security.test` (large bodies) |
| F-05 | **High** | **Vulnerable dependencies:** `body-parser` < 1.20.9 (high, DoS), `qs` (moderate, DoS) in production; Electron (high, certificate-authority mitigation), `undici`, `fast-uri` in build tooling. A stale install also hid the fix (see note). | `npm audit` | Updated all; Electron 44.7.0 to 44.10.0 (desktop start-up verified); `npm audit`: **0 vulnerabilities** | `npm audit` in CI |
| F-06 | Medium | **Third-party scripts with no integrity protection** (7 libraries from two CDNs) under a CSP that explicitly allowed those hosts, plus Google Fonts (sends every visitor's IP to a third party). | Source review | Pinned versions self-hosted under `placeholder/vendor/` with recorded SHA-256 (`VENDOR.md`); fonts self-hosted; CDN allowances **removed** from the CSP (one strict policy for all apps). Verified in a real browser: zero external requests, all conversions work | browser verification; `security.test` (headers) |
| F-07 | Medium | **Account enumeration:** a locked account returned a different status (429) from an unknown one (401); duplicate signup revealed existence. | Live probe | One identical login failure for unknown email / wrong password / locked account; with mail enabled, signup responses are identical for new and existing addresses and the real owner is emailed | `security.test` (login), `mail.test` |
| F-08 | Medium | **Session weaknesses:** sliding expiry with no absolute lifetime; sessions survived password change; no way to see or revoke sessions; old session not replaced at login. | Source review | Idle and absolute expiry (hosted 12 h / 7 d); fresh id on login; password change/reset signs out all other devices; account page lists and ends sessions; max 20 per account; `__Host-` cookie when hosted | `security.test` (sessions) |
| F-09 | Medium | **Stored HTML injection** in the ImageVendor gallery: image names were inserted with `innerHTML`. (The CSP blocked script execution, which is why impact was limited.) | Source review; browser test with hostile names | Built with DOM APIs; all other sinks reviewed (Sigma, Pigment, Placeholder already safe) | browser verification |
| F-10 | Medium | **Uploads were not verified.** Server accepted any `data:image/png;base64,...` text; browsers accepted any `image/*` file of any size or dimension. | Source review | Server decodes the header and requires the real PNG/JPEG/WebP signature and bounded PNG dimensions; shared browser guard identifies the real format from bytes, reads pixel dimensions without decoding and enforces size/dimension limits (SVG and disguised scripts refused) in ImageVendor and Sigma; Placeholder caps input size | `security.test` (uploads), `upload-guard.test`; browser verification |
| F-11 | Medium | **No per-account storage limit.** The whole database lives in memory: 100 images × 24 MB from one account could exhaust the server. | Source review | Per-account quota (default 512 MB, configurable) across all apps; shrinking is always allowed | `security.test` (quota) |
| F-12 | Medium | **No audit trail** of security events. | Source review | Append-only, hash-chained JSON Lines log; verification tool; secrets never logged | `security.test` (audit) |
| F-13 | Medium | **No privacy rights tooling:** no account page, no way to export or delete data, no consent record, no privacy notice. | Source review | Account page (profile, password, sessions, export, deletion that purges the backup copy), consent version stored per account, privacy notice at `/privacy` | `security.test` (account) |
| F-14 | Medium | **Database stored in plain text with no backup.** | Source review | Optional AES-256-GCM encryption at rest with key rotation; rolling last-good backup; undecryptable/corrupt data is never overwritten | `security.test` (encryption) |
| F-15 | Low | Missing `Permissions-Policy`; signed-in pages cacheable; non-API routes unthrottled; no slow-request timeouts; client-error statuses reported as 500. | Live probe | Header added; `Cache-Control: no-store`; page rate limiter; Node header/request timeouts; correct 4xx statuses | `security.test` (headers) |
| F-16 | Low | CSRF defence ignored `Sec-Fetch-Site`. | Source review | Cross-site and same-site (non-same-origin) requests refused in addition to the Origin and header checks | `security.test` (CSRF) |
| F-17 | Low | Desktop shell: no global refusal of `<webview>` (main window already sandboxed, context-isolated, navigation-locked, permissions denied). | Source review | `will-attach-webview` blocked for every window | desktop probe |
| F-18 | Info | **Hidden Unicode in source.** While fixing the above, the editing toolchain converted some `\u` escapes into literal bidirectional/zero-width characters inside regular expressions (a known supply-chain attack form, "Trojan Source"). Found and removed. | Scan | All converted to visible escapes; a test now scans every project source file | `security.test` (source hygiene) |
| F-19 | Info | A legacy copy of the old database (`toolkit/data/db.json`: 2 accounts with password hashes, 2 sessions) sits in a OneDrive-synced folder. It is git-ignored, outside any web root, and no longer used. | Inspection | **Not changed** (it is your data). Recommend deleting it after confirming the migrated `%APPDATA%/Toolkit/data` copy is complete | n/a |

> **Note on F-05:** after `npm audit fix`, `npm` reported success while `node_modules` still held the
> vulnerable files (a stale hidden lockfile made it think the tree was current). The audit reads the
> lockfile, so it said "0 vulnerabilities" while the code that would actually run was unpatched. The
> packages were removed and reinstalled, and versions were then verified on disk. Worth knowing for CI:
> verify installed versions, not just the audit output.

## What was probed and found sound

Ownership checks on every project/painting/image route (no cross-account access, UUID ids, 404 not
403); prototype-pollution keys rejected in documents; revision guards; open-redirect protection of
`?next=`; constant-time runtime-key comparison; DNS-rebinding protection (Host allow-list); the
corrupt-database refusal; Electron's renderer settings; no secrets in the repository; no `eval` or
`new Function` in application code; prepared output encoding in Sigma, Pigment and Placeholder pickers.

## Residual risk (accepted or needing operator action)

| Risk | Why it remains | Mitigation / next step |
|---|---|---|
| `style-src 'unsafe-inline'` in the CSP | The editors set styles through inline attributes and `style.cssText` throughout | **Resolved 2026-11-22 (T-02):** all apps use classes and CSSOM properties; CSP is `style-src 'self'`; a test scans sources so it cannot regress |
| No multi-factor authentication | Not built | TOTP or passkeys is the highest-value next control for SOC 2 CC6.1 |
| Single-process, in-memory JSON store | By design; one process, no replication | Fine for the intended scale; move to a transactional database if you need HA or large data |
| Audit log is on the same host | A host compromise could drop the newest entries | Ship logs off-host (collector or write-once storage); alert on `verify-audit` failure |
| Rate limits are per process and per client address | Reset on restart; a distributed attack can spread attempts | Keep the nginx limits; add IP reputation/WAF if exposed to hostile traffic. Per-account lockout (5 failures / 15 min) also lets an attacker briefly lock a known user out |
| No malware scanning of uploads | Files are only validated as images and stored as inert data | Acceptable: content is never executed or served as a document. Add scanning if you accept non-image files |
| Email security depends on the mail provider | SMTP credentials and SPF/DKIM/DMARC of the sender domain are outside this code | Configure DMARC for the sender domain |
| Desktop installer `dist/` still holds the old code | Built artifacts are not rebuilt by this change | Rebuild (`npm run build:desktop`) before distributing; desktop local mode uses plain HTTP over loopback only |
| Existing hosted sessions end once | The hosted cookie was renamed to `__Host-toolkit_session` | Users sign in again after deploying |
| Existing accounts have no consent record or verified-email flag | They predate both | They are treated as verified; consent is shown on the account page as "before consent was recorded" |

## Not assessed

Operating-system and network hardening of the hosting environment, physical security, personnel
controls, third-party providers (hosting, mail, DNS), backups outside the application, and an
independent penetration test. These need the operator and, for certification, an external assessor.
