# Toolkit for Windows

The desktop app bundles the local server, Electron runtime and all four apps.
Users do not need Node.js or a terminal. The Windows x64 installer provides a
setup wizard, installation folder choice, shortcuts and an uninstaller.

## Build

From `toolkit/`, with Node.js installed:

```powershell
npm ci
npm run desktop
npm run build:desktop
```

The installer is `dist/Toolkit-Setup-1.0.1-x64.exe` in the workspace root.
`dist/win-unpacked/Toolkit.exe` is the complete unpacked app; keep all files
in that directory together. Distribute the installer for normal installation.
Building downloads Electron/NSIS tooling when it is not cached.

## Accounts and data

Accounts, sessions and artwork are shared by the local browser and desktop app. Shared sign-in
still covers Sigma, Pigment, ImageVendor and Placeholder. Normal data lives in
`%APPDATA%/Toolkit/data/db.json`, outside the installation directory. Updating
or uninstalling the app preserves this data. The Toolkit menu can open the data
folder. A runtime lock makes both clients use one server and in-memory database;
starting a second server joins the existing one instead of loading a stale copy.

Open `http://127.0.0.1:4310` in a browser while Toolkit is running. Alternatively,
`npm start` keeps the shared server running independently; the desktop app joins
it and leaves it running on exit. When the desktop owns the server, closing the
desktop stops that server; the shared database remains available next launch.
Browser and desktop keep separate login cookies, but use the same accounts,
password hashes, saved artwork and account security state. This is local sharing
on one PC, not cloud sync or live simultaneous canvas editing.

For legacy web data, close Toolkit and run `node scripts/migrate-local.cjs` from
`toolkit/`. It backs up the original, preserves password hashes/sessions/ownership,
and atomically copies to the common database. It refuses to replace a nonempty
different database or migrate while the shared server is running. Backups live
beside `data/` in `migration-backups/`. Set `TOOLKIT_DATA_DIR` only when deliberately
using an isolated database; two clients with different overrides are not shared.

Most editing and native conversions work offline. Placeholder's optional CDN
libraries and fonts still require internet, as in the web app. This package does
does not add cloud sync, automatic updates or a cloud backend. Subsequent versions
can be installed using a newly built installer with an updated package version.

## Desktop security and tests

The shared server binds port 4310 on `127.0.0.1`, accepts only local host headers,
and serves browser requests with the same auth protections as the desktop. Its
runtime discovery endpoint requires a secret stored in the local lock file.
Renderer Node integration is disabled; isolation, sandbox and web security
are enabled. Permissions and outside navigations/new windows are denied. Shared
auth/CSRF/ownership/rate-limit/CSP checks remain in place. Hosted production
cookies remain Secure; only the shared loopback runtime uses HTTP cookies.
No IPC bridge, filesystem API or shell API is exposed to app pages.

```powershell
$env:TOOLKIT_PLAYWRIGHT_PATH = 'path/to/playwright'
npm run test:desktop
# Also test the built executable:
$env:TOOLKIT_DESKTOP_EXE = 'absolute/path/to/dist/win-unpacked/Toolkit.exe'
npm run test:desktop
```

Tests use a disposable profile via `TOOLKIT_DESKTOP_TEST_DIR` and hidden windows.
They verify the sandbox, authenticated browser/desktop sharing, auth, all app
pages, editing/export and session/artwork persistence across restart. Existing app tests remain available
through `npm test`. The `global-agent` build dependency is pinned to 4.1.3 to avoid
the vulnerable logging chain in version 3; the complete npm audit passes.

This build has no code-signing certificate. Windows may identify its publisher
as unknown. Signing for public distribution requires a certificate supplied by
the publisher; no signing credentials are stored in this project.
