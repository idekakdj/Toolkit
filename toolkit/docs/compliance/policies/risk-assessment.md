# Risk Assessment and Treatment Policy

> **DRAFT. Not approved.** Owner: `[OWNER NAME / ROLE]`  Approval date: `[DATE]`  Next review: `[DATE + 12 months]`

## 1. Purpose and scope

Identify, score, treat and monitor risks to the confidentiality, integrity and availability of
Toolkit and to the privacy of its users (SOC 2 CC3, ISO 27001 clause 6.1 and 8.2-8.3). Applies to
all assets in the scope of the information security policy.

## 2. Method

1. Identify assets and threats (inventory, threat model, `SECURITY-ASSESSMENT.md`, incidents, supplier changes).
2. Score **likelihood** (1 rare to 5 almost certain) and **impact** (1 minor to 5 severe; consider privacy harm to users) to give inherent risk = L x I.
3. Rating: 1-6 Low, 8-12 Medium, 15-25 High.
4. Choose treatment: reduce (control), avoid, transfer (insurance, supplier), or accept. High risks need a dated treatment plan; acceptance of High risk needs management sign-off.
5. Re-score for residual risk after treatment. Review the register at least annually, after each incident and before major features.
6. Privacy impact assessment for any feature that adds personal data or a new recipient of it.

## 3. Starter risk register (first pass, scores are the analyst's judgement and need owner review)

| ID | Risk | L | I | Rating | Existing controls | Treatment | Roadmap | Owner |
|---|---|---|---|---|---|---|---|---|
| R-01 | Credential stuffing or phished password takes over an account | 4 | 3 | 12 Medium | Lockout, rate limits, 10+ char policy, code-confirmed email | Reduce: MFA | T-01 | `[ ]` |
| R-02 | XSS or style injection in the app | 2 | 4 | 8 Medium | `script-src 'self'`, DOM APIs, validation | Reduce: remove `unsafe-inline` | T-02 | `[ ]` |
| R-03 | Vulnerable dependency shipped unnoticed | 3 | 4 | 12 Medium | Manual `npm audit`, lockfile | Reduce: CI scanning | T-03 | `[ ]` |
| R-04 | Data loss (disk failure, corruption, ransomware) with no usable backup | 3 | 5 | 15 High | `.bak` copy on same machine, atomic writes | Reduce: off-machine backups, restore test | T-06 | `[ ]` |
| R-05 | Attack or abuse goes unnoticed (no alerting) | 3 | 4 | 12 Medium | Hash-chained log, manual review | Reduce: export and alerting | T-04 | `[ ]` |
| R-06 | Tampered or malicious installer distributed | 2 | 5 | 10 Medium | Sandboxed shell, installers kept | Reduce: code signing, published hashes | T-05 | `[ ]` |
| R-07 | Secret (data key, Google secret, SMTP URL) leaked via git or backup | 2 | 5 | 10 Medium | `.gitignore`, secrets test, env files mode 600 | Reduce: secret scanning; rotate on leak | T-03 | `[ ]` |
| R-08 | Database stored unencrypted on host or OneDrive-synced folder | 3 | 4 | 12 Medium | Optional AES-256-GCM, legacy file git-ignored | Reduce: require key when hosted; delete legacy copy | T-07, O-04 | `[ ]` |
| R-09 | Single-process JSON store exhausted or unavailable | 3 | 3 | 9 Medium | Quotas, limits, timeouts | Accept at current scale; revisit | n/a | `[ ]` |
| R-10 | Breach not recognised, reported late or not recorded (PIPEDA) | 2 | 4 | 8 Medium | Runbook | Reduce: exercise, breach register | O-07 | `[ ]` |
| R-11 | Supplier (mail, hosting, Google) failure or breach | 3 | 3 | 9 Medium | Minimal data shared | Reduce: due diligence, DPAs | O-06 | `[ ]` |
| R-12 | Administrator account compromised (no MFA, no access review) | 2 | 5 | 10 Medium | Admin script audited, host hardening templates | Reduce: MFA everywhere, quarterly review | O-05, T-08 | `[ ]` |
| R-13 | Privacy notice and Terms inaccurate or missing, consent invalid | 3 | 3 | 9 Medium | Consent version stored | Reduce: counsel review, re-consent | O-13, T-12 | `[ ]` |
| R-14 | Sole-maintainer dependency (key person) | 4 | 3 | 12 Medium | Documentation | Reduce: documented procedures, key custody backup | O-04 | `[ ]` |
| R-15 | Old plaintext `db.json` remains in git history | 2 | 4 | 8 Medium | Repo ignores it going forward | Treat: assess exposure; consider history rewrite and notify if real data | O-04, O-07 | `[ ]` |

## 4. Evidence

Dated register versions, treatment plans, management sign-off of accepted risk, review minutes.
