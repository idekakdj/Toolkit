# Windows desktop build verification

**Current release: 1.4.0** (2026-11-22). Built `dist/Toolkit-Setup-1.4.0-x64.exe` (Electron 44.10.0,
electron-builder 26.15.3; SHA-256 in `dist/SHA256SUMS.txt`; npm audit 0 vulnerabilities). Installed on
the user's PC 2026-11-22 (silent in-place update after the user closed the running app; data folder
untouched, live database hash unchanged).

What changed in 1.4.0: optional two-step sign-in with an authenticator app (TOTP) and recovery codes;
a strict style policy (CSP `style-src 'self'`, no inline styles in any app); a new 404 page; draft Terms
of Service and a rewritten draft Privacy Policy; and, temporarily, email sign-ups no longer pause while
no mail server is configured (accounts open straight away without an emailed code, and any deliverable
domain is accepted; disposable inboxes and provider typos are still refused). Verified on the packaged
app and again on the installed app, each on a disposable profile with default settings: app window
opens, sign-ups open with no mail configured, a Gmail sign-up is created and signed in, a mailinator
address is refused, two-step setup returns a key and QR code, `/terms` and the 404 page are served, the
CSP has no `unsafe-inline`; no `.env`, database or mail settings are packaged.

**Previous release: 1.3.0** (2026-11-22). Built `dist/Toolkit-Setup-1.3.0-x64.exe` (same toolchain and
audit result as below; SHA-256 in `dist/SHA256SUMS.txt`). Installed on the user's PC 2026-11-22 (silent in-place update; data folder untouched, re-probed after install).

What changed in 1.3.0: sign-in with Google ("Continue with Google"; on the desktop app the Google step
runs in the system browser and the app window claims the session with a secret only it holds; local
Toolkit only), email/password sign-ups limited to established mail providers with disposable-inbox and
typo refusal, a live password strength meter (Strong = 10+ characters with a capital, number and
symbol, now the minimum), confirm-password fields, and sign-in fixes. Google keys for the desktop app are
read from `%APPDATA%\Toolkit\.env` (menu: Toolkit > Set up Google sign-in), never packaged. Verified on
the packaged app with a disposable profile: Google button shown from the profile's `.env`, click opens the
system browser with only the handoff id, waiting page, "Open the browser again", a cancelled Google
result reaching the app window, no session granted; `app.asar` contains no `.env`, database or tests; the
live database hash was unchanged.

**Previous release: 1.2.0** (2026-11-22). Built `dist/Toolkit-Setup-1.2.0-x64.exe` with Electron
44.10.0 and electron-builder 26.15.3 (unsigned Windows x64 NSIS installer; SHA-256 in
`dist/SHA256SUMS.txt`). The npm audit reports 0 vulnerabilities (`dependency-audit.json`). A
build-tool-only `minimatch` denial-of-service advisory (versions 7.0.0 to 11.0.0, pulled in by
electron-builder, even 26.18.0) is resolved by a scoped `overrides` entry in `package.json` that moves
only those copies to `minimatch` 11.0.9; the unaffected 3.x/5.x copies are untouched. A trial build with
the override produced a working installer (same probe checks), and `npm test` passes.

Installers are kept: every release stays in `dist/` and each change ships as a new version.

What changed in 1.2.0: sign-ups must confirm their email with a 6-digit code (sign-ups paused until mail
is configured with `node scripts/setup-mail.cjs`); the separate verify-link page is gone; Pigment eraser
erases shapes from inside or on their outline, drags never erase the coloring page, and a still click
removes the topmost picture; brush-size readout and a wider desktop tool rail. Verified on the packaged
app (disposable profile) before and after installing: server start, sign-ups refused with 503 when no
mail is configured, `/verify` removed, the eraser fix present, Placeholder vendor libraries served.

What changed in 1.1.0 (see `docs/compliance/SECURITY-ASSESSMENT.md`): strict email validation with
optional mailbox verification and password reset, password policy, session lifetimes and revocation,
account page (data export, deletion), privacy notice and sign-up consent, upload checks, a tamper-evident
audit log, optional encryption at rest, and Placeholder's libraries and fonts self-hosted (installer now
packages `placeholder/vendor/`). Existing local data is preserved by an in-place update.

Verified on the packaged app, run on a disposable profile before and after installation:
healthz and shared server start; account, privacy and Placeholder vendor assets served; weak passwords
and missing consent rejected; registration, session and account API work; internal files not served;
security headers present; database, secrets and tests absent from `app.asar`.

The sections below describe the original 1.0.1 build verification and remain accurate for the
sandbox/navigation/data-sharing behaviour, which did not change.

---

Built `dist/Toolkit-Setup-1.0.1-x64.exe` with Electron 44.7.0 and
electron-builder 26.15.3. This is an unsigned Windows x64 NSIS installer.
The setup wizard and uninstaller are generated by electron-builder; no real
user-profile installation/uninstallation was performed automatically.

Verified the actual packaged `dist/win-unpacked/Toolkit.exe` with hidden
windows and a disposable profile:

- Browser and desktop share one loopback server with authenticated APIs and
  local host validation; runtime discovery remains private.
- Sandbox, context isolation and web security enabled; Node integration absent.
- Shared registration/session and all four app pages load.
- Sigma drawing saves and produces an actual PNG download to the test folder.
- Account/session and saved artwork survive shutdown and restart on a new port.
- Desktop-created accounts work in browser sessions; browser changes to saved
  artwork are immediately visible through desktop API reads.
- Desktop joins an independently started web server and leaves it running on exit.
- Packaged main source matches the final workspace source.
- User databases and installer build dependencies are not present in app.asar.

All 16 regression suites and 68 JavaScript syntax checks pass. Migration tests
cover backups, byte preservation, repeat runs, conflicting data and active locks.
The authorized local migration copied 2 accounts and 14 saved designs to the
common data folder, preserving the source and a timestamped backup. A subsequent
hash comparison confirmed the original and migrated databases were identical.
The complete npm dependency audit reports zero vulnerabilities (recorded in
`dependency-audit.json`); optional browser CDN libraries are outside that audit.
An SHA-256 checksum is provided with the installer in `dist/SHA256SUMS.txt`.

See README.md in this directory for data storage, migration and build commands.
