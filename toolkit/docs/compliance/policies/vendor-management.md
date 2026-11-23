# Vendor and Subprocessor Management Policy

> **DRAFT. Not approved.** Owner: `[OWNER NAME / ROLE]`  Approval date: `[DATE]`  Next review: `[DATE + 12 months]`

## 1. Purpose and scope

Make sure suppliers that touch Toolkit's data, code or availability are chosen and monitored
deliberately (SOC 2 CC9.2, ISO 27001 A.5.19-5.23, PIPEDA 4.1.3 which makes us responsible for
personal information handled by our service providers).

## 2. Subprocessor and supplier register

| Supplier | Purpose | Data involved | Location | Assurance to obtain | Status |
|---|---|---|---|---|---|
| Google Identity (Google Cloud OAuth client) | Optional Google sign-in (OIDC, PKCE) | Email address, name, Google account id, from Google to us; sign-in events at Google | `[CONFIRM]` | Google Cloud / Workspace SOC 2 and ISO reports; terms and API Services policy review | `[ ]` |
| SMTP provider `[NAME]` | Sends confirmation codes and password-reset mail | Recipient address, message content (code or link) | `[CONFIRM]` | SOC 2 or ISO report; DPA; SPF/DKIM/DMARC set up | `[ ]` |
| Hosting provider `[NAME]` | Runs the hosted service, stores the encrypted database and logs | All user data (encrypted at rest if `TOOLKIT_DATA_KEY` set) | `[CONFIRM region]` | SOC 2 / ISO 27001 report; physical security statement; DPA | `[ ]` |
| GitHub | Source hosting (public repo `idekakdj/Toolkit`), future CI | Source code and commit identities only; must hold no personal data or secrets | US `[CONFIRM]` | GitHub SOC 2; secret scanning and push protection on | `[ ]` |
| npm registry and packages | Dependencies (`bcryptjs`, `express`, `express-rate-limit`, `helmet`, `nodemailer`; Electron and electron-builder for builds) | None | n/a | Lockfile, `npm audit`, Dependabot (T-03) | Partial |
| Vendored libraries | `placeholder/vendor/` (hash-pinned, `VENDOR.md`; lamejs is LGPL-3.0) | None | n/a | Hash check on update | Built |
| DNS / domain registrar `[NAME]` | Domain, SPF/DKIM, TLS validation | None | `[CONFIRM]` | MFA, registrar lock | `[ ]` |
| Code-signing provider `[NAME]` (future, T-05) | Signs the installer | Signing key | `[CONFIRM]` | Key custody terms | Planned |

## 3. Onboarding a supplier

1. Business case and data classification: what personal information will they see?
2. Due diligence: security report (SOC 2 Type II or ISO 27001 certificate), privacy terms, breach-notification commitment, data location, subprocessors, exit terms.
3. Contract or accepted terms reviewed for confidentiality, security, breach notice within 72 hours, deletion on exit, and comparable PIPEDA protection.
4. Record in the register above, approved by `[OWNER]`.
5. Technical controls: least-privilege credentials, MFA, secrets in the env file or secret store, never in git.

## 4. Ongoing monitoring

Annually: re-obtain assurance reports, re-read changed terms, confirm data location, check access
lists and credential age, and review incidents. Subscribe to supplier security advisories. Any supplier
breach affecting our users is handled under `incident-response.md`.

## 5. Offboarding

Revoke credentials and API clients, request deletion of our data and written confirmation, rotate
secrets they held, update the register and the privacy notice.

## 6. Transparency

The privacy notice names each supplier that receives personal information and the countries involved.
Update it when the register changes.
