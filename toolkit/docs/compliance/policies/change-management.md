# Change Management and Secure Development Policy

> **DRAFT. Not approved.** Owner: `[OWNER NAME / ROLE]`  Approval date: `[DATE]`  Next review: `[DATE + 12 months]`

## 1. Purpose and scope

Make changes to code, configuration and infrastructure traceable, reviewed, tested and reversible
(SOC 2 CC8.1, ISO 27001 A.8.25, A.8.28, A.8.29, A.8.32). Covers the repository, hosted deployment,
desktop installer and their configuration.

## 2. Current state and target

| Element | Today | Target |
|---|---|---|
| Source control | Git, GitHub `idekakdj/Toolkit`, `main` branch | Branch protection (roadmap O-08) |
| Tests | `npm test` runs every suite (`test/run-all.cjs`); browser and desktop smoke tests run on demand | Built: run in CI on every push and pull request (Linux and Windows); activates on first push (T-03) |
| Dependency and secret scanning | Manual `npm audit`; secrets-never-committed test | Built (activates on push): `npm audit`, gitleaks, CodeQL, Dependabot, licence report in `.github/` (T-03) |
| Review | Owner reviews; AI-assisted changes are reviewed and verified by a person | PR approval recorded |
| Releases | Each change gets a new installer version; every installer is kept; databases are never copied into a release | Signed installers (T-05) |

## 3. Rules

1. **Everything through a pull request** (or, for the sole maintainer, a commit referencing the change reason) with a description of what, why, risk and rollback.
2. **CI gate.** `.github/workflows/ci.yml` runs `npm ci`, `npm ls`, `npm test`, `npm audit`, a secret scan and a licence report; `codeql.yml` runs SAST. The checks must pass before merge once branch protection is applied (`toolkit/docs/compliance/GITHUB-SETTINGS.md`).
3. **Tests first.** New behaviour and every security fix ships with a test that fails without it. `npm test` must pass; run `test:browser` and `test:desktop` when UI or the desktop shell changes.
4. **Security and privacy checklist** in each change: new personal data? new external call or dependency? new input path? new secret? logging free of secrets? retention entry added?
5. **No secrets or personal data in git.** `.env` files and `db.json*` are ignored; the secrets test must pass. A leaked secret is rotated, not just deleted.
6. **Dependencies:** lockfile committed; `npm audit` high/critical fixed within 7 days (high 14, others 30 per vulnerability policy); verify installed versions after audit fixes (see `SECURITY-ASSESSMENT.md` F-05 note).
7. **Human review of AI-assisted code:** all generated changes are read and tested by a person before merge; hidden-character scan (security.test) must pass.
8. **Separation of environments:** tests use temporary directories and synthetic data only; production data is never used in development.
9. **Deployment:** from a tagged commit; record version, date, approver; keep the previous release for rollback; post-deploy check of the start-up `[security]` warnings.
10. **Emergency changes:** allowed for active security incidents; the fix is reviewed after the event within 2 working days and logged.
11. **Releases of the installer:** build only from a clean tagged checkout, hash recorded, signed when T-05 is done; the build report in `desktop/BUILD-REPORT.md` is updated.

## 4. Evidence

Pull requests or change records with approvals, CI results, release log (version, date, commit, hash),
test output for security-relevant changes, post-incident reviews.
