# Incident Response Policy and Breach Procedure

> **DRAFT. Not approved.** Owner: `[OWNER NAME / ROLE]`  Approval date: `[DATE]`  Next review: `[DATE + 12 months]`

## 1. Purpose and scope

Detect, contain, assess and learn from security incidents, and meet the breach duties in PIPEDA
(section 10.1 to 10.3 and the Breach of Security Safeguards Regulations). A *breach of security
safeguards* is the loss of, unauthorised access to or unauthorised disclosure of personal information
caused by a breach of safeguards or a failure to establish them.

## 2. Roles

Incident lead `[NAME]` (decides, coordinates); privacy officer `[NAME]` (harm assessment, OPC and
individual notices); technical responder `[NAME]`; communications `[NAME]`. One person may hold several roles.

## 3. Severity

| Level | Meaning | Response |
|---|---|---|
| 1 Critical | Confirmed exposure of personal data, key compromise, service takeover | Start now; lead and privacy officer within 1 hour |
| 2 High | Suspected exposure, audit-chain break, active attack | Within 4 hours |
| 3 Medium | Contained issue, vulnerability with exploit path | Within 2 working days |
| 4 Low | Policy deviation, failed attack | Log and review weekly |

## 4. Procedure

1. **Detect and triage.** Sources: audit-log spikes (`login.fail`, `login.locked`, `ratelimit.hit`, `csrf.blocked`), `scripts/verify-audit.cjs` exit code 2, user reports, supplier notices. Record the time and open an incident record.
2. **Contain.** Rotate secrets (`TOOLKIT_DATA_KEY`, SMTP credentials, Google client secret), block sources at the proxy, disable a route, sign everyone out (stop service, empty `db.sessions`), or take the service offline.
3. **Preserve evidence.** Copy `audit/` and proxy logs to read-only storage before changing anything.
4. **Assess.** What data, whose, how many, encrypted or not, how long exposed, who had access.
5. **Real risk of significant harm (RROSH) assessment.** Decide, and write down why, using two factors: the *sensitivity* of the information (identity and contact data, credentials, user artwork; hashed passwords still count) and the *probability of misuse* (who obtained it, malicious intent, evidence of misuse, whether it was encrypted and the key was safe). Significant harm includes humiliation, damage to reputation, identity theft, loss of employment or business, financial loss, bodily harm.
6. **Report to the OPC.** If RROSH is met, report to the Office of the Privacy Commissioner of Canada as soon as feasible after determining there is a breach, using the OPC breach report form. Include: circumstances and cause, date or period, the information involved, number of individuals, steps taken to reduce harm, notification steps, and a contact.
7. **Notify individuals.** Same threshold and timing. Plain-language direct notice (email) covering what happened, the information involved, what we have done, what they can do (for example change password, watch for phishing), and a contact. Use another channel or a public notice if direct contact is impossible.
8. **Notify others.** Tell any other organisation or government institution that could reduce harm (for example Google, the SMTP provider, a payment or identity partner, police).
9. **Record.** Keep a record of **every** breach of security safeguards, reportable or not, for **24 months** after the day we determined the breach occurred (see section 5).
10. **Recover and learn.** Restore from verified backup if needed, fix root cause, add a regression test, update the risk register, and hold a review within 10 working days.

## 5. Breach record (retain 24 months minimum)

`ID | date detected | date occurred | summary and cause | data types | number of individuals | encrypted? | RROSH decision and reasoning | OPC reported (date, reference) | individuals notified (date, method) | others notified | containment and remediation | owner | closed date`

Records are kept in `[LOCATION, access-restricted]`. When contracts or other regimes (GDPR, US state
law) apply to particular users, check their timelines too.

## 6. Contacts

OPC breach line and form: `[VERIFY CURRENT DETAILS AT priv.gc.ca]`. Hosting provider security `[CONTACT]`.
Counsel `[CONTACT]`. Cyber insurer `[CONTACT, if any]`.

## 7. Testing and evidence

A tabletop exercise at least once a year (scenario: leaked `.env`, stolen backup, compromised mail
account). Evidence: incident records, breach register, exercise write-up, review notes.
