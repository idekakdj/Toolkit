# Information Security Policy

> **DRAFT. Not approved.** Owner: `[OWNER NAME / ROLE]`  Approved by: `[APPROVER]`  Approval date: `[DATE]`  Next review: `[DATE + 12 months]`

## 1. Purpose

Protect the confidentiality, integrity and availability of Toolkit and of the personal information
and user content it holds, and meet our legal duties (PIPEDA). This policy is designed to support
SOC 2 (Security, Confidentiality, Privacy) and ISO/IEC 27001:2022 clauses 4-5 and control 5.1. It
does not by itself make the organisation certified or compliant.

## 2. Scope

The Toolkit service (Sigma, Pigment, ImageVendor, Placeholder), the hosted deployment and its
infrastructure, the Windows desktop app and installer, the source repository, build and release
tooling, and the people and suppliers with access to any of them. Out of scope: users' own devices.

## 3. Principles

- Security and privacy are considered when a feature is designed, not after (see `change-management.md`).
- Collect the minimum personal information; keep it only as long as needed (`data-retention-and-disposal.md`).
- Least privilege: access is granted for a purpose, reviewed and removed promptly (`access-control.md`).
- Defence in depth: validation, authentication, encryption, logging and backups each assume another may fail.
- Be honest: we describe controls as built, partial or planned, and never claim certification we do not hold.

## 4. Roles

| Role | Responsibility |
|---|---|
| Information security lead `[NAME]` | Owns this policy and the ISMS, reports on risk to management, runs reviews |
| Privacy officer `[NAME]` | Accountable under PIPEDA principle 4.1; handles access requests, complaints and breach reporting |
| Engineers / maintainers | Follow secure development and change rules; report incidents at once |
| Management `[NAME]` | Approves policies, accepts residual risk, provides resources |

## 5. Policy statements

1. A documented risk assessment is performed at least annually and on major change (`risk-assessment.md`).
2. Access to systems and data follows `access-control.md`; MFA is required for all administrative and source-control accounts.
3. Personal information and secrets are encrypted at rest where the platform supports it and always in transit (TLS 1.2+).
4. Secrets (keys, passwords, Google client secret, SMTP credentials) are never committed to source control; they live in environment files kept out of git or a secret store.
5. Changes go through review and testing (`change-management.md`); dependencies are scanned and patched on a schedule.
6. Security events are logged, retained and reviewed; incidents follow `incident-response.md`.
7. Backups are taken off the machine, encrypted, and restore-tested (`backup-and-continuity.md`).
8. Suppliers that handle personal information are assessed (`vendor-management.md`).
9. Everyone with access completes security and privacy training on joining and each year.
10. Acceptable use: systems and data are used only for Toolkit purposes; no sharing of credentials; report loss of a device or key immediately.

## 6. Exceptions and enforcement

Exceptions are requested in writing, approved by the security lead, time-limited (maximum 6 months)
and recorded with the compensating control. Breach of this policy may lead to loss of access and,
for staff, disciplinary action.

## 7. Review and evidence

Reviewed at least annually and after any significant incident. Evidence kept: approved copy,
approval record, training records, review minutes.

## 8. Related documents

`access-control.md`, `incident-response.md`, `data-retention-and-disposal.md`, `vendor-management.md`,
`change-management.md`, `backup-and-continuity.md`, `risk-assessment.md`, `../OPERATIONS.md`, `../GAP-ANALYSIS.md`.
