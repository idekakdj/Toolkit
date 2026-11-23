# GitHub settings the owner must apply

The CI pipeline (roadmap T-03) is committed as files, but several protections are repository
settings that only the owner can change on github.com. Do these once, after the first push of
`.github/` to `main`. Repository: `idekakdj/Toolkit`. All paths below start at the repository
page, then **Settings**.

## 1. Code security features

Settings, then **Code security** (or **Advanced Security**):

1. **Dependabot alerts**: Enable.
2. **Dependabot security updates**: Enable. (Version updates are already configured by `.github/dependabot.yml`.)
3. **Secret scanning**: Enable.
4. **Push protection**: Enable, so a commit containing a recognised secret is blocked at push time.
5. **Private vulnerability reporting**: Enable. `SECURITY.md` points reporters to it.
6. **Code scanning, CodeQL analysis**: leave **default setup OFF** (do not click Set up). The
   advanced workflow `.github/workflows/codeql.yml` is used instead; turning default setup on
   conflicts with it and uploads duplicate results. Results appear under Security, Code scanning.

## 2. Actions settings

Settings, **Actions**, **General**:

1. **Actions permissions**: choose "Allow idekakdj, and select non-idekakdj, actions and reusable
   workflows". Tick "Allow actions created by GitHub" and "Allow Marketplace actions by verified
   creators", and add these to the allow list (all are pinned by SHA in the workflows):
   `gitleaks/gitleaks-action@*`. (`actions/*` and `github/codeql-action/*` are covered by "created
   by GitHub".)
2. **Workflow permissions**: select "Read repository contents and packages permissions". Leave
   "Allow GitHub Actions to create and approve pull requests" unticked.
3. **Fork pull request workflows**: require approval for first-time contributors (or all outside collaborators).

## 3. Protect `main`

Settings, **Rules**, **Rulesets**, **New ruleset**, **New branch ruleset**:

1. Name: `protect-main`. Enforcement status: **Active**.
2. Target branches: **Add target**, **Include default branch**.
3. Tick **Restrict deletions**.
4. Tick **Block force pushes**.
5. Tick **Require a pull request before merging**. Required approvals: 1 (set to 0 if you are the
   only maintainer and cannot approve your own PRs; the checks below still apply). Tick
   "Dismiss stale pull request approvals when new commits are pushed".
6. Tick **Require status checks to pass**, and tick "Require branches to be up to date before merging".
   Add these checks (type the name in "Add checks"; they appear only after each workflow has run once):
   - `test (ubuntu-latest)`
   - `test (windows-latest)`
   - `secrets`
   - `analyze (javascript-typescript)`
7. Optional: tick **Require linear history**.
8. Optional: tick **Require signed commits** once commit signing is set up.
9. **Create**.

(The older "Branch protection rules" page under Settings, **Branches** works too with the same options.)

Also turn on two-factor authentication for the owner account (Settings, Password and authentication)
and review the repository Collaborators list (see roadmap O-05, O-08).

## 4. Known gaps to be aware of

- **Old history (risk R-15):** the June 2026 history contains an early `db.json`. The CI secret
  scan (`gitleaks`) on push and pull request checks only the new commits, not that old history.
  To scan the whole history once, run `gitleaks git .` locally (or trigger the `CI` workflow
  manually with `workflow_dispatch`, which scans the full fetched history). Rotate anything real
  found there and decide on a history rewrite (risk register R-15, roadmap O-04, O-07).
- `.gitleaks.toml` allowlists only known fake test values and `placeholder/vendor/`. If a real
  finding appears, rotate the credential; do not widen the allowlist to silence it.
- Required check names must match the job names in the workflows exactly. If you rename a job,
  update the ruleset.
