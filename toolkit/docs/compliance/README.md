# Security and compliance documentation

This folder describes the security and privacy controls built into Toolkit (Sigma, Pigment,
ImageVendor, Placeholder), maps them to SOC 2, ISO/IEC 27001 and PIPEDA, and lists what the
operator must do for the rest.

## What "compliant" can and cannot mean here

Software can **implement controls**. It cannot, by itself, be "SOC 2 compliant", "ISO 27001
certified" or "PIPEDA compliant":

| Framework | What it actually is | Who decides |
|---|---|---|
| **SOC 2** (AICPA Trust Services Criteria) | An attestation report about an *organization's* controls over a period of time (Type II) or at a point in time (Type I) | An independent CPA firm |
| **ISO/IEC 27001:2022** | A certification of an organization's *information security management system* (policies, risk assessment, audits, management review, improvement) | An accredited certification body |
| **PIPEDA** (Canada) | A *law* governing personal information handled in commercial activity. There is no certificate; there are ten fair-information principles and a breach-reporting duty | The organization is accountable; the Privacy Commissioner of Canada enforces |

So this work delivers the **technical foundation** those audits look at, honestly mapped and
tested. The organizational parts (written policies approved by management, a risk assessment,
staff training, vendor reviews, an independent penetration test, evidence collection over time,
a named privacy officer) are listed in [`OPERATIONS.md`](OPERATIONS.md) and the draft
[`policies/`](policies/) and need a person or team to own them. Where the
law applies to you, have qualified counsel review the privacy notice before relying on it.

## Contents

| Document | Purpose |
|---|---|
| [`SECURITY-ASSESSMENT.md`](SECURITY-ASSESSMENT.md) | The vulnerability assessment: what was found, how it was proven, what was fixed, what remains |
| [`CONTROLS.md`](CONTROLS.md) | Control-by-control map to SOC 2 criteria, ISO 27001 Annex A and PIPEDA principles, with the code and tests that implement each |
| [`OPERATIONS.md`](OPERATIONS.md) | Operator checklist, configuration reference, backup/restore, key rotation, data-subject requests, incident response and breach reporting, retention |
| [`GAP-ANALYSIS.md`](GAP-ANALYSIS.md) | Requirement-by-requirement status for SOC 2 (Security, Confidentiality, Privacy), ISO 27001:2022 and PIPEDA |
| [`GITHUB-SETTINGS.md`](GITHUB-SETTINGS.md) | Click-by-click GitHub settings the owner must apply (security features, Actions, branch ruleset) for the CI pipeline |
| [`ROADMAP.md`](ROADMAP.md) | Prioritised technical and organisational backlog with acceptance criteria |
| [`STATEMENT-OF-APPLICABILITY.md`](STATEMENT-OF-APPLICABILITY.md) | ISO 27001 Annex A applicability skeleton |
| [`policies/`](policies/) | Draft policies: [information security](policies/information-security-policy.md), [access control](policies/access-control.md), [incident response](policies/incident-response.md), [data retention](policies/data-retention-and-disposal.md), [vendor management](policies/vendor-management.md), [change management](policies/change-management.md), [backup and continuity](policies/backup-and-continuity.md), [risk assessment](policies/risk-assessment.md) |
| [`POLICY-TEMPLATES.md`](POLICY-TEMPLATES.md) | Superseded index pointing to `policies/` |

## Verifying the claims yourself

```
cd toolkit
npm test                                # every regression suite, all four apps
node --test test/security.test.cjs      # the security controls
npm audit                               # dependency advisories (expected: 0)
node scripts/verify-audit.cjs           # integrity of the security log
```

The security suite is the evidence for most rows in `CONTROLS.md`: each control names the test
that would fail if it regressed.
