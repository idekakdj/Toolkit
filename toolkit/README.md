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

- **Accounts:** strict email validation (syntax, reserved domains, DNS deliverability) and, when
  mail is configured, proof of mailbox ownership; password policy (12+ characters, no common or
  name/email-derived passwords, bcrypt-safe 72-byte limit); bcrypt hashing with timing-equalised,
  non-enumerating login; account lockout; password reset; consent recorded per account
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
