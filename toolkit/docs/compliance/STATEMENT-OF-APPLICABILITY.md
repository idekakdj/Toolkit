# Statement of Applicability (ISO/IEC 27001:2022, draft skeleton)

> **DRAFT.** Owner: `[OWNER]`  Approved: `[DATE]`  Next review: `[DATE + 12 months]`
> Scope: the Toolkit service, hosted deployment, desktop app, source repository and supporting suppliers.
> This is a working skeleton for a future ISMS. It is not a certification claim. Applicability
> decisions are the analyst's proposals and need the owner's approval after the risk assessment.

Implementation status: **Implemented** (seen in code/tests), **Partial**, **Planned** (roadmap item), **Org** (policy/process outstanding), **Inherited** (from supplier). Detail and evidence are in [`GAP-ANALYSIS.md`](GAP-ANALYSIS.md); IDs in [`ROADMAP.md`](ROADMAP.md).

| Control | Applicable | Justification | Status |
|---|---|---|---|
| 5.1 Policies for information security | Yes | Required by clause 5.2 | Org (drafts in `policies/`) |
| 5.2 Roles and responsibilities | Yes | Accountability for data | Org (O-02) |
| 5.3 Segregation of duties | Yes | Limits error and abuse; compensating review for sole operator | Org (O-05) |
| 5.4 Management responsibilities | Yes | Leadership commitment | Org (O-01) |
| 5.5 Contact with authorities | Yes | OPC breach reporting | Org (O-07) |
| 5.6 Contact with special-interest groups | Yes | Advisory feeds | Planned (O-08) |
| 5.7 Threat intelligence | Yes | Dependency and platform advisories | Planned (T-03) |
| 5.8 Information security in project management | Yes | Features add data and inputs | Org (O-08) |
| 5.9 Inventory of information and assets | Yes | Needed for risk assessment | Partial (O-12) |
| 5.10 Acceptable use | Yes | Staff and admin conduct | Org (O-01) |
| 5.11 Return of assets | Yes (when staff) | No staff today | Org (O-05) |
| 5.12 Classification of information | Yes | Personal and confidential data | Org (O-12) |
| 5.13 Labelling of information | No (for now) | Single small data set; classification handled by location | n/a |
| 5.14 Information transfer | Yes | TLS and email transfer | Partial |
| 5.15 Access control | Yes | User data isolation | Implemented |
| 5.16 Identity management | Yes | Unique, verified accounts | Implemented |
| 5.17 Authentication information | Yes | Passwords, Google, reset codes | Implemented (passwords, Google, TOTP MFA) |
| 5.18 Access rights | Yes | Admin and user rights | Partial (T-08) |
| 5.19 Information security in supplier relationships | Yes | Google, SMTP, hosting, GitHub | Partial (O-06) |
| 5.20 Security within supplier agreements | Yes | Subprocessors handle personal data | Org (O-06) |
| 5.21 ICT supply chain | Yes | npm and vendored libraries | Partial (T-03) |
| 5.22 Monitoring and review of supplier services | Yes | Annual review | Org (O-06) |
| 5.23 Information security for cloud services | Yes | Hosting provider | Org (O-06) |
| 5.24 Incident management planning | Yes | Breach duties | Partial (O-07) |
| 5.25 Assessment of security events | Yes | Triage | Partial (O-07) |
| 5.26 Response to incidents | Yes | Containment | Partial (O-07) |
| 5.27 Learning from incidents | Yes | Improvement | Partial (O-11) |
| 5.28 Collection of evidence | Yes | Tamper-evident log | Partial (T-04) |
| 5.29 Security during disruption | Yes | Availability expectations | Partial (T-06) |
| 5.30 ICT readiness for business continuity | Yes | Backups and restore | Planned (T-06, O-04) |
| 5.31 Legal, statutory, regulatory, contractual | Yes | PIPEDA | Partial (O-13) |
| 5.32 Intellectual property rights | Yes | Third-party licences (lamejs LGPL) | Partial |
| 5.33 Protection of records | Yes | Audit logs, breach records | Partial |
| 5.34 Privacy and protection of PII | Yes | Personal data processed | Partial (O-13) |
| 5.35 Independent review of information security | Yes | Penetration test, internal audit | Org (O-11) |
| 5.36 Compliance with policies, rules, standards | Yes | Internal checks | Org (O-11) |
| 5.37 Documented operating procedures | Yes | `OPERATIONS.md` | Partial |
| 6.1 Screening | Yes (when staff) | Access to personal data | Org (O-09) |
| 6.2 Terms and conditions of employment | Yes (when staff) | Security duties | Org (O-09) |
| 6.3 Awareness, education and training | Yes | Human error risk | Org (O-09) |
| 6.4 Disciplinary process | Yes (when staff) | Enforcement | Org (O-09) |
| 6.5 Responsibilities after termination | Yes | Revoke and rotate | Org (O-05) |
| 6.6 Confidentiality or non-disclosure agreements | Yes | Data access | Org (O-09) |
| 6.7 Remote working | Yes | Owner works from a personal machine with OneDrive | Org (O-05) |
| 6.8 Information security event reporting | Yes | Reporting channel | Partial (O-07) |
| 7.1 Physical security perimeters | Yes | Hosting and workstation | Inherited / Org (O-06) |
| 7.2 Physical entry | Yes | same | Inherited |
| 7.3 Securing offices, rooms and facilities | Yes | Home office | Org |
| 7.4 Physical security monitoring | No | Delegated to hosting provider; no own premises | Inherited |
| 7.5 Protecting against physical and environmental threats | Yes | Provider | Inherited |
| 7.6 Working in secure areas | No | No secure areas | n/a |
| 7.7 Clear desk and clear screen | Yes | Workstation | Org |
| 7.8 Equipment siting and protection | Yes | Provider and workstation | Inherited / Org |
| 7.9 Security of assets off-premises | Yes | Laptop, installers | Org (O-05) |
| 7.10 Storage media | Yes | Backup media | Org (O-04) |
| 7.11 Supporting utilities | No | Provider | Inherited |
| 7.12 Cabling security | No | Provider | Inherited |
| 7.13 Equipment maintenance | Yes | Workstation and provider | Org |
| 7.14 Secure disposal or re-use of equipment | Yes | Disk wipe | Org |
| 8.1 User endpoint devices | Yes | Desktop app and admin laptop | Partial (T-05) |
| 8.2 Privileged access rights | Yes | Server and admin script | Partial (T-01, T-08) |
| 8.3 Information access restriction | Yes | Per-account isolation | Implemented |
| 8.4 Access to source code | Yes | Public repository | Partial (O-05, T-03) |
| 8.5 Secure authentication | Yes | Core control | Implemented (TOTP MFA; T-01 done) |
| 8.6 Capacity management | Yes | Quotas and limits | Implemented |
| 8.7 Protection against malware | Yes | Uploads, installer | Partial (T-05) |
| 8.8 Management of technical vulnerabilities | Yes | Dependencies | Partial (T-03) |
| 8.9 Configuration management | Yes | `deploy/` templates, start-up warnings | Partial |
| 8.10 Information deletion | Yes | PIPEDA retention | Implemented (backups manual) |
| 8.11 Data masking | Yes | Hashed tags in logs | Partial |
| 8.12 Data leakage prevention | Yes | Secrets and personal data | Partial |
| 8.13 Information backup | Yes | Availability | Partial (T-06) |
| 8.14 Redundancy of information processing facilities | No (accepted) | Single-process by design; risk R-09 accepted at current scale | n/a |
| 8.15 Logging | Yes | Audit log | Implemented (T-04 export) |
| 8.16 Monitoring activities | Yes | Detect abuse | Planned (T-04) |
| 8.17 Clock synchronisation | Yes | Token expiry and logs | Org (operator NTP) |
| 8.18 Use of privileged utility programs | Yes | `scripts/admin.cjs` | Partial (T-08) |
| 8.19 Installation of software on operational systems | Yes | Production host | Org (O-08) |
| 8.20 Networks security | Yes | Reverse proxy, firewall | Partial (operator) |
| 8.21 Security of network services | Yes | TLS, rate limits | Partial (operator) |
| 8.22 Segregation of networks | Yes (hosted) | Loopback app behind proxy | Org (operator) |
| 8.23 Web filtering | No | No staff browsing of untrusted content in scope; CSP covers app | n/a |
| 8.24 Use of cryptography | Yes | At rest, in transit, hashing | Implemented (key custody O-04) |
| 8.25 Secure development life cycle | Yes | Software product | Partial (T-03) |
| 8.26 Application security requirements | Yes | Web app | Implemented (strict CSP; T-02 done) |
| 8.27 Secure system architecture and engineering principles | Yes | Design reviews | Partial (O-03) |
| 8.28 Secure coding | Yes | Code quality | Partial (T-03) |
| 8.29 Security testing in development and acceptance | Yes | Tests exist | Partial (O-11) |
| 8.30 Outsourced development | Yes | AI-assisted development | Org (O-08) |
| 8.31 Separation of development, test and production | Yes | Data protection | Partial |
| 8.32 Change management | Yes | Operational stability | Partial (T-03, O-08) |
| 8.33 Test information | Yes | Synthetic data only | Implemented |
| 8.34 Protection of information systems during audit testing | Yes | Auditor access | Org (O-11) |
