# Toolkit

Cross-device access: desktop 1.0.2 can connect to a shared HTTPS Toolkit server. Run `npm run start:hosted` behind the configured HTTPS reverse proxy with durable storage. See [deployment and account migration instructions](deploy/README.md). Local mode remains available. Hosting is required to activate shared access; unsaved work and local exported files do not sync.

One channel for every app. Toolkit is a worn, well-loved shell that hosts
clones of popular apps behind a single shared sign-in:

- **Sigma** (`/sigma`) — a Figma-inspired design studio
- **Placeholder** (`/placeholder/`) — a client-side file converter

## Run it

```
cd toolkit
npm install
npm start
```

Open http://localhost:4310

## Sign-in

Two ways in, both on `/auth`:

- **Continue with Google.** Turned on by keys in `toolkit/.env`, which is git-ignored and never
  committed or packed into the desktop installer. To set it up:
  1. `copy .env.example .env` (already done if `toolkit/.env` exists).
  2. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials): create a project,
     configure the OAuth consent screen (External; scopes `openid`, `email`, `profile`), then
     **Create credentials > OAuth client ID > Web application** with these **Authorized redirect URIs**:
     `http://127.0.0.1:4310/api/auth/google/callback` and `http://localhost:4310/api/auth/google/callback`
     (hosted: `https://<your domain>/api/auth/google/callback`).
  3. Paste the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `toolkit/.env`,
     then restart `npm start`. While the consent screen is in "Testing", add your Google accounts as test users.
  The flow runs entirely on the server (authorization code + PKCE, state bound to a cookie, nonce, ID-token
  signature checked against Google's keys), so the CSP still allows no third-party scripts.
- **Email and password.** The address must be a real mailbox at an established provider (Gmail, Outlook,
  Yahoo, iCloud, Proton, ISPs, .edu/.gov, or a custom domain hosted by Google Workspace, Microsoft 365,
  Zoho and the like); disposable inboxes and typos such as `gmial.com` are refused. The password must reach
  **Strong** on the live meter (10+ characters with a capital letter, a number and a symbol) and be typed twice.
  New accounts confirm the address with an emailed 6-digit code, so these sign-ups need mail set up
  (`node scripts/setup-mail.cjs`); until then they are paused, and Google sign-in still works.

**Desktop app.** Google does not allow sign-in inside an app window, so "Continue with Google" opens your
normal web browser for the Google step while the app window waits, then signs the app in (the browser itself
is never signed in). The app reads its keys from `%APPDATA%\Toolkit\.env`, never from the installer: use
**Toolkit > Set up Google sign-in…**, paste the same client ID and secret, then quit and reopen Toolkit. The same
Google client works, because the desktop app uses `http://127.0.0.1:4310/api/auth/google/callback`. This works
with the local Toolkit only; when the app is connected to a shared server it asks you to use email and password
(a shared server could let someone who sends you a sign-in link take over the session).

## How the integration works

- `server/start.cjs` starts or joins the shared local runtime; `server/index.js`
  defines the app routes. It serves the Toolkit landing page
  and auth pages from `toolkit/public/`, mounts `sigma/public/` at `/sigma`,
  and mounts the `placeholder/` folder at `/placeholder`.
- One account, one session: `/api/auth/*` issues a single session
  cookie (`toolkit_session`, or `__Host-toolkit_session` when hosted; `HttpOnly`, `SameSite=Strict`, hashed at rest). Sigma's dashboard
  and editor, and Placeholder's converter page, are all gated by it. Signing
  in once unlocks everything.
- `/auth` accepts a `?next=<same-site path>` parameter (validated server- and
  client-side against open redirects) so each app returns users to where they
  were headed.
- App functionality is untouched: Sigma's editor and Placeholder's converter
  run exactly as before; only paths and the shared sign-in changed.

## Security (applies to the shell and every app)

Summary of the controls. The full list, the compliance mapping, the assessment
that produced it, and the operator checklist are in [`docs/compliance/`](docs/compliance/README.md).

- **Accounts:** strict email validation (syntax, reserved domains, DNS deliverability, established
  providers only, no disposable inboxes) and proof of mailbox ownership by emailed code; password policy
  (10+ characters with a capital letter, number and symbol; no common or name/email-derived passwords;
  bcrypt-safe 72-byte limit); bcrypt hashing with timing-equalised, non-enumerating login; account lockout;
  password reset; consent recorded per account; optional Google sign-in (OIDC + PKCE, verified email only,
  pending unconfirmed sign-ups lose their password when the real owner signs in with Google)
- **Sessions:** 256-bit tokens stored hashed; idle *and* absolute expiry (hosted: 12 h / 7 d);
  new id on every login; all other sessions revoked on password change; `__Host-` cookie when hosted
- **Abuse limits:** separate rate limits for sign-in failures, sign-ups, writes, sensitive account
  actions and pages; per-route body limits enforced *after* authentication; per-account storage quota
- **Request integrity:** SameSite=Strict, Origin and Sec-Fetch-Site checks plus a required header (CSRF);
  ownership check on every record; names reject control and bidi-override characters
- **Uploads:** server verifies the real file signature and dimensions of every embedded image;
  the browser guard checks type, size and pixel limits from the file's bytes before any decoder runs
- **Browser hardening:** strict CSP for every app (`script-src 'self'`, no third-party hosts — Placeholder's
  libraries and fonts are self-hosted in `placeholder/vendor/`), `Permissions-Policy`, `no-store` on signed-in
  pages, only web assets served (tests, reports and source notes are never public)
- **Privacy rights:** account page to view/correct data, change password, manage sessions, download
  everything (JSON) and delete the account (erases content and purges the backup copy)
- **Monitoring:** tamper-evident audit log (`scripts/verify-audit.cjs`), structured security events
- **Data protection:** optional AES-256-GCM encryption at rest (`TOOLKIT_DATA_KEY`), rolling backup,
  corrupt/undecryptable data is never overwritten
- **Supply chain:** `npm audit` clean; third-party scripts pinned and self-hosted with recorded hashes

## The landing page

Black, grey and white with a worn-workshop look: film grain, scuffed and
taped cards, stencil headings. Click and drag anywhere on the dark background
to wipe through the grime — a fading trail of dark rainbow gradients follows
the cursor.

## Storage

A shared JSON store at `%APPDATA%/Toolkit/data/db.json` on Windows holds accounts,
sessions, Sigma projects, Pigment paintings and ImageVendor images. Browser and
desktop join one loopback server, preventing multiple in-memory writers. Use
`TOOLKIT_DATA_DIR` for deliberately isolated test/deployment data. Legacy web
data can be migrated with `node scripts/migrate-local.cjs` while Toolkit is
closed; it creates a backup and refuses conflicting nonempty destination data.
