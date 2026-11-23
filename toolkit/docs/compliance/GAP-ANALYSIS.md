# Gap analysis (first pass, 2026-11-22)

Toolkit is **designed to support** SOC 2 (Security, Confidentiality, Privacy), ISO/IEC 27001:2022 and
PIPEDA. It is **not certified or compliant** with any of them: each needs organisational controls and,
for SOC 2 / ISO, an independent auditor. Work items are in [`ROADMAP.md`](ROADMAP.md) (IDs T-nn for
technical, O-nn for organisational).

**Status:** `Built` = code or test seen during this review. `Partial` = some of it exists. `Missing` = nothing yet.
`Organisational` = needs an owner decision, policy or process (draft policies are in [`policies/`](policies/)).

Evidence paths are relative to `toolkit/`. "security.test" = `test/security.test.cjs`, and so on.
Reflected here: emailed 6-digit confirmation code (mandatory), Google sign-in (OIDC + PKCE, desktop
browser handoff), 10+ character password with capital, number and symbol, established email providers
only, and the secrets-never-committed test.

## 1. SOC 2 Trust Services Criteria (Security, Confidentiality, Privacy)

| Requirement | Status | Evidence | Gap / next action |
|---|---|---|---|
| CC1.1-1.5 Control environment | Organisational | `policies/information-security-policy.md` (draft) | Name owner and roles, approve policies, training, disciplinary process (O-01, O-02, O-09) |
| CC2.1-2.3 Information and communication | Partial | `public/privacy.html`; this folder | Security contact / disclosure page; Terms page (drafted elsewhere) (O-10) |
| CC3.1-3.4 Risk assessment | Partial | `SECURITY-ASSESSMENT.md`; `policies/risk-assessment.md` starter register | Formal annual risk assessment and treatment plan (O-03) |
| CC4.1-4.2 Monitoring of controls | Partial | `SECURITY-ASSESSMENT.md`; `scripts/verify-audit.cjs` | Independent penetration test; control self-assessment; deficiency tracking (O-11) |
| CC5.1-5.3 Control activities and policies | Organisational | `policies/` drafts | Approval, communication, annual review (O-01) |
| CC6.1 Logical access: identification and authentication | Partial | `server/auth.js`, `passwords.js`, `google.js`, `security.js`; security.test, mail.test, google.test | Built: bcrypt cost 11, 10+ char policy, lockout, sessions, Google OIDC + PKCE. **No MFA** (T-01). Host/admin access outside code (O-05) |
| CC6.2 Provisioning and deprovisioning | Partial | `server/account.js` (delete, sessions); `scripts/admin.cjs`; mail.test | Mailbox ownership proven by code. No staff joiner/mover/leaver process or access review (T-08, O-05) |
| CC6.3 Role-based access, least privilege | Partial | Ownership checks on every record route (security.test: ownership) | Users only; no admin roles in app. Server/OS privileges need a role list and review (O-05) |
| CC6.4 Physical access | Organisational | n/a | Inherit from hosting provider; collect their report (O-06) |
| CC6.5 Disposal of data and media | Partial | `server/store.js` erasure and backup replacement; security.test: erasure | Operator backups and `db.json.premigration` need a disposal procedure (O-04) |
| CC6.6 Boundary protection | Partial | `server/index.js`, `server/security.js`, `deploy/nginx.conf.example`; security.test: CSRF, headers, rate limit | Template only; firewall rules and network diagram are operator tasks (O-06) |
| CC6.7 Transmission protection | Partial | HSTS and `__Host-` Secure cookie (security.test); nginx TLS 1.2+ template | Production TLS unverified; desktop local mode is HTTP over loopback only (O-06) |
| CC6.8 Malicious software prevention | Partial | CSP `script-src 'self'` and `style-src 'self'` (T-02 done); upload signature checks (security.test, upload-guard.test); source hygiene test | Installer unsigned (T-05) |
| CC7.1 Vulnerability detection | Partial | `npm audit` clean when run manually | CI, Dependabot and CodeQL built (activates on push; owner applies `GITHUB-SETTINGS.md`) (T-03) |
| CC7.2 Monitoring for anomalies | Partial | `server/audit.js` hash-chained log; `scripts/verify-audit.cjs` | No centralised logging or alerting (T-04) |
| CC7.3 Evaluate security events | Organisational | `policies/incident-response.md`; OPERATIONS.md s.6 | Severity matrix, contacts, tabletop exercise (O-07) |
| CC7.4 Incident response | Organisational | same | Runbook only; never exercised (O-07) |
| CC7.5 Recovery from incidents | Partial | rolling `.bak` (`server/store.js`); OPERATIONS.md s.3 | No off-machine backup or restore test (T-06) |
| CC8.1 Change management | Partial | `npm test` (`test/run-all.cjs`); git history | CI built (activates on push); branch protection and review evidence pending (T-03, O-08) |
| CC9.1 Business disruption | Organisational | `policies/backup-and-continuity.md` | RPO/RTO undefined (O-04) |
| CC9.2 Vendor and partner risk | Partial | `policies/vendor-management.md`; `placeholder/vendor/VENDOR.md` | Subprocessor list drafted; no reviews, DPAs or provider reports (O-06) |
| C1.1 Identify and protect confidential information | Partial | AES-256-GCM at rest (`server/store.js`; security.test: encryption); static allow-list | Encryption is optional (needs `TOOLKIT_DATA_KEY`) (T-07); classification scheme not written (O-12) |
| C1.2 Dispose of confidential information | Partial | Account deletion (security.test: erasure); log purge (`server/audit.js`) | Backup ageing and deletion is manual (O-04) |
| P1 Notice | Partial | `public/privacy.html`; `TOOLKIT_PRIVACY_CONTACT` | Fuller notice being drafted elsewhere; counsel review (O-13) |
| P2 Choice and consent | Built | Consent checkbox, version and time stored (`server/auth.js`, `server/policy.js`; security.test: account) | Re-consent on policy change not verified (T-12) |
| P3 Collection | Built | Minimal data model; no analytics or third-party scripts | Describe Google sign-in data (email, name) in the notice (O-13) |
| P4 Use, retention, disposal | Partial | TTLs in code; erasure | Schedule in `policies/data-retention-and-disposal.md`; backup retention is operator-defined |
| P5 Access | Built | Account page and JSON export (security.test: account) | Out-of-band identity check for locked-out users is manual (`scripts/admin.cjs`) |
| P6 Disclosure and notification | Partial | OPERATIONS.md s.6 | Subprocessor disclosure; breach record log not started (O-06, O-07) |
| P7 Quality | Built | Name editable; mailbox proven by emailed code (mail.test) | Email change is admin-assisted only (T-11) |
| P8 Monitoring and enforcement | Organisational | Privacy contact in notice | Complaint procedure, privacy officer (O-13) |

## 2. ISO/IEC 27001:2022

### 2.1 Management system clauses 4-10

| Clause | Status | Evidence | Gap / next action |
|---|---|---|---|
| 4 Context, interested parties, ISMS scope | Organisational | scope paragraph in `policies/information-security-policy.md` | Document context and scope statement (O-01) |
| 5 Leadership, policy, roles | Organisational | draft policy | Management approval, role assignment (O-01) |
| 6 Planning: risk assessment, treatment, objectives | Partial | `policies/risk-assessment.md`; `STATEMENT-OF-APPLICABILITY.md` | Complete method, treatment plan, objectives (O-03) |
| 7 Support: resources, competence, awareness, documented information | Organisational | this folder | Training records, document control (O-09) |
| 8 Operation | Partial | `OPERATIONS.md`; `npm test` | Run the routines and keep evidence (O-04, O-08) |
| 9 Performance evaluation: monitoring, internal audit, management review | Missing | n/a | Internal audit programme; management review minutes (O-11) |
| 10 Improvement: nonconformity, corrective action | Missing | `SECURITY-ASSESSMENT.md` findings table is a precedent | Corrective-action register (O-11) |

### 2.2 Annex A theme 5: Organizational controls

| Control | Status | Evidence | Gap / next action |
|---|---|---|---|
| 5.1 Policies for information security | Organisational | `policies/information-security-policy.md` | Approve and publish (O-01) |
| 5.2 Roles and responsibilities | Organisational | policy draft | Assign (O-01) |
| 5.3 Segregation of duties | Organisational | n/a | Sole operator: document compensating review (O-05) |
| 5.4 Management responsibilities | Organisational | n/a | O-01 |
| 5.5 Contact with authorities | Organisational | `policies/incident-response.md` (OPC) | List contacts (O-07) |
| 5.6 Contact with special-interest groups | Organisational | n/a | Optional (O-08) |
| 5.7 Threat intelligence | Missing | n/a | Advisory subscriptions, Dependabot alerts (T-03) |
| 5.8 Security in project management | Missing | n/a | Security/privacy checklist in change process (O-08) |
| 5.9 Inventory of information and assets | Partial | `package.json`; `policies/vendor-management.md` | Asset and data inventory (O-12) |
| 5.10 Acceptable use | Organisational | n/a | Add to information security policy (O-01) |
| 5.11 Return of assets | Organisational | n/a | Needed once there is staff (O-05) |
| 5.12 Classification of information | Missing | n/a | Classification scheme (O-12) |
| 5.13 Labelling of information | Missing | n/a | Low priority |
| 5.14 Information transfer | Partial | TLS (hosted); email via SMTP | Document transfer rules (O-06) |
| 5.15 Access control | Built | ownership checks (security.test) | App level only; see 5.18 |
| 5.16 Identity management | Built | `server/auth.js`, `server/email-check.js`; mail.test | Staff identities (O-05) |
| 5.17 Authentication information | Built | `server/passwords.js` (bcrypt, policy); TOTP two-step sign-in with hashed one-time recovery codes (`server/mfa.js`, `server/qr.js`; mfa.test) | Optional per user unless `TOOLKIT_REQUIRE_MFA=1`; recovery codes are the owner's responsibility |
| 5.18 Access rights | Partial | session list and revoke (`server/account.js`) | Access review tooling (T-08, O-05) |
| 5.19 Supplier relationships | Partial | `policies/vendor-management.md` | Reviews (O-06) |
| 5.20 Supplier agreements | Missing | n/a | DPAs and terms review (O-06) |
| 5.21 ICT supply chain | Partial | pinned self-hosted libs (`placeholder/vendor/VENDOR.md`), lockfile, manual `npm audit` | SBOM, automated scanning (T-03) |
| 5.22 Monitoring of supplier services | Missing | n/a | O-06 |
| 5.23 Cloud services | Organisational | n/a | Hosting provider not yet chosen/documented (O-06) |
| 5.24 Incident planning | Partial | OPERATIONS.md s.6; `policies/incident-response.md` | O-07 |
| 5.25 Assessment of security events | Partial | same | O-07 |
| 5.26 Response | Partial | same | Never exercised (O-07) |
| 5.27 Learning from incidents | Partial | `SECURITY-ASSESSMENT.md` precedent | O-11 |
| 5.28 Collection of evidence | Partial | tamper-evident `audit/` | Off-host copy (T-04) |
| 5.29 Security during disruption | Partial | `policies/backup-and-continuity.md` | T-06 |
| 5.30 ICT readiness for continuity | Missing | n/a | RPO/RTO, restore test (T-06, O-04) |
| 5.31 Legal, statutory, contractual requirements | Partial | `CONTROLS.md` PIPEDA mapping | Legal register, counsel review (O-13) |
| 5.32 Intellectual property | Partial | `VENDOR.md` (lamejs LGPL notice) | Licence check in CI (T-03) |
| 5.33 Protection of records | Partial | audit retention and integrity (`server/audit.js`) | Retention schedule (policy draft) |
| 5.34 Privacy and PII protection | Partial | export, delete, consent, minimisation | See PIPEDA table |
| 5.35 Independent review | Missing | n/a | Pen test, internal audit (O-11) |
| 5.36 Compliance with policies and standards | Organisational | n/a | O-01, O-11 |
| 5.37 Documented operating procedures | Partial | `OPERATIONS.md` | Keep current |

### 2.3 Annex A theme 6: People controls

| Control | Status | Evidence | Gap / next action |
|---|---|---|---|
| 6.1 Screening | Organisational | n/a | When hiring (O-09) |
| 6.2 Terms of employment | Organisational | n/a | O-09 |
| 6.3 Awareness and training | Missing | n/a | Annual training (O-09) |
| 6.4 Disciplinary process | Organisational | n/a | O-09 |
| 6.5 Responsibilities after termination | Organisational | n/a | O-05 |
| 6.6 Confidentiality / NDAs | Organisational | n/a | O-09 |
| 6.7 Remote working | Organisational | desktop shell hardening only | Device policy (O-05) |
| 6.8 Event reporting | Partial | privacy contact; audit log | Staff reporting channel (O-07) |

### 2.4 Annex A theme 7: Physical controls

| Control | Status | Evidence | Gap / next action |
|---|---|---|---|
| 7.1-7.14 (perimeters, entry, offices, monitoring, threats, secure areas, clear desk, equipment siting, off-premises assets, storage media, utilities, cabling, equipment maintenance, secure disposal) | Organisational | n/a | Hosted: inherit from provider and collect their report. Owner laptop and OneDrive: full-disk encryption, clear-desk rule. Legacy `toolkit/data/db.json` sits in a OneDrive-synced folder (SECURITY-ASSESSMENT F-19) (O-06) |

### 2.5 Annex A theme 8: Technological controls

| Control | Status | Evidence | Gap / next action |
|---|---|---|---|
| 8.1 User endpoint devices | Partial | Electron sandbox, context isolation (`desktop/main.cjs`; desktop-smoke) | Installer unsigned (T-05); no auto-update |
| 8.2 Privileged access rights | Partial | `scripts/admin.cjs` audited, refuses while server runs | Admin MFA and access review (T-01, T-08) |
| 8.3 Information access restriction | Built | ownership checks; static allow-list (security.test) | None |
| 8.4 Access to source code | Partial | public GitHub repo; secrets test | Branch protection, GitHub 2FA, secret scanning (T-03, O-05) |
| 8.5 Secure authentication | Built | `server/auth.js`, `security.js`, `google.js`, `server/mfa.js`, `server/qr.js`; mfa.test; security.test, google.test, mfa.test | Decide whether to set `TOOLKIT_REQUIRE_MFA=1` when hosted (O-05) |
| 8.6 Capacity management | Built | `server/quota.js`, body limits, timeouts; security.test | Single process; no capacity monitoring (T-04) |
| 8.7 Protection against malware | Partial | upload signature checks; CSP | No scanning; installer unsigned (T-05) |
| 8.8 Management of technical vulnerabilities | Partial | manual `npm audit`; assessment | CI scanning (T-03); patch SLAs in policy |
| 8.9 Configuration management | Partial | `deploy/*` templates; start-up `[security]` warnings (`server/hosted.cjs`) | Host baselines are the operator's (O-06) |
| 8.10 Information deletion | Built | account erasure; token, session, log expiry (security.test) | Operator backup deletion manual |
| 8.11 Data masking | Partial | log uses hashed tags (`tag()` in `server/audit.js`); no secrets logged | Adequate for current scope |
| 8.12 Data leakage prevention | Partial | no-store caching, CSP, secrets-not-committed test (security.test) | No DLP tooling; reasonable at this scale |
| 8.13 Information backup | Partial | rolling `db.json.bak` (`server/store.js`) | No off-machine encrypted backup or restore test (T-06) |
| 8.14 Redundancy of facilities | Missing | single-process JSON store | Accepted risk; revisit with scale |
| 8.15 Logging | Built | `server/audit.js` hash-chained, 365-day default retention | Off-host export (T-04) |
| 8.16 Monitoring activities | Missing | n/a | Alerting on failed-login spikes and chain break (T-04) |
| 8.17 Clock synchronisation | Organisational | OPERATIONS.md s.1 | Operator confirms NTP |
| 8.18 Use of privileged utility programs | Partial | `scripts/admin.cjs` audited | T-08 |
| 8.19 Installation of software on operational systems | Organisational | n/a | O-08 |
| 8.20 Networks security | Partial | `deploy/nginx.conf.example`, Host allow-list, loopback listen | Operator |
| 8.21 Security of network services | Partial | same | Operator |
| 8.22 Segregation of networks | Organisational | n/a | Operator |
| 8.23 Web filtering | Partial | CSP restricts browser connections | Outbound filtering not applicable |
| 8.24 Use of cryptography | Built | bcrypt, AES-256-GCM, SHA-256 chain, PKCE, RS256 verification (security.test, google.test) | Key custody and backup policy (O-04) |
| 8.25 Secure development life cycle | Partial | tests; hidden-character scan | Document SDLC (`policies/change-management.md`); CI built (activates on push) (T-03) |
| 8.26 Application security requirements | Built | validation, CSRF, strict CSP with no unsafe-inline, upload checks (security.test, server.test) | Keep the inline-style scan test green |
| 8.27 Secure architecture principles | Partial | `SECURITY-ASSESSMENT.md` | Threat model document (O-03) |
| 8.28 Secure coding | Partial | output encoding, no eval, source hygiene test | No SAST (T-03) |
| 8.29 Security testing in development and acceptance | Partial | security.test, browser-smoke, desktop-smoke | No pen test (O-11); no DAST |
| 8.30 Outsourced development | Organisational | n/a | Document human review of AI-assisted changes (O-08) |
| 8.31 Separation of dev, test, production | Partial | tests use temp dirs and synthetic data | Production environment undocumented |
| 8.32 Change management | Partial | git; `npm test` | CI gate built (activates on push); PR review and branch protection pending (T-03, O-08) |
| 8.33 Test information | Built | synthetic data only (test files) | None |
| 8.34 Protection during audit testing | Organisational | n/a | O-11 |

## 3. PIPEDA (Schedule 1 principles and breach provisions)

| Requirement | Status | Evidence | Gap / next action |
|---|---|---|---|
| 4.1 Accountability | Organisational | `TOOLKIT_PRIVACY_CONTACT` shown in `public/privacy.html` | Name a privacy officer; privacy management programme; contractual protection for processors (O-13, O-06) |
| 4.2 Identifying purposes | Partial | `public/privacy.html` | Expanded page in progress; add Google sign-in and email use (O-13) |
| 4.3 Consent | Built | consent checkbox; version and time stored (security.test: account) | Terms page in progress; re-consent on change (T-12) |
| 4.4 Limiting collection | Built | minimal schema; no analytics; Google data limited (`server/google.js`) | Confirm Google scopes stay minimal |
| 4.5 Limiting use, disclosure, retention | Partial | deletion; TTLs | Retention schedule (`policies/data-retention-and-disposal.md`); backup retention (O-04) |
| 4.6 Accuracy | Built | name edit; mailbox verified by code | Self-service email change (T-11) |
| 4.7 Safeguards | Partial | `CONTROLS.md` sections 1-4 | MFA, off-site backups, alerting, encryption on by default (T-01, T-04, T-06, T-07) |
| 4.8 Openness | Partial | `/privacy` | Fuller notice and Terms (drafted elsewhere) |
| 4.9 Individual access | Built | Account page, JSON export; `scripts/admin.cjs export` | Track 30-day response (O-13) |
| 4.10 Challenging compliance | Organisational | contact in notice | Complaint procedure and record (O-13) |
| Breach record of every breach, kept 24 months | Organisational | `policies/incident-response.md` template | Create the breach register (O-07) |
| Breach: report to the OPC when real risk of significant harm | Organisational | same | Rehearse; OPC form (O-07) |
| Breach: notify affected individuals | Organisational | same | Notice templates; no in-app notification tool (T-09) |
| Breach: notify other organisations that can reduce harm | Organisational | same | O-07 |
| Service providers and cross-border processing | Partial | `policies/vendor-management.md` | Disclose hosting region, Google and SMTP provider in the notice (O-06, O-13) |
