# Toolkit

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

- `server/index.js` is the only server. It serves the Toolkit landing page
  and auth pages from `toolkit/public/`, mounts `sigma/public/` at `/sigma`,
  and mounts the `placeholder/` folder at `/placeholder`.
- One account, one session: `/api/auth/*` issues a single `toolkit_session`
  cookie (`HttpOnly`, `SameSite=Strict`, hashed at rest). Sigma's dashboard
  and editor, and Placeholder's converter page, are all gated by it. Signing
  in once unlocks everything.
- `/auth` accepts a `?next=<same-site path>` parameter (validated server- and
  client-side against open redirects) so each app returns users to where they
  were headed.
- App functionality is untouched: Sigma's editor and Placeholder's converter
  run exactly as before; only paths and the shared sign-in changed.

## Security (applies to the shell and every app)

- bcrypt password hashing (11 rounds), timing-safe login responses
- Session tokens stored hashed server-side; 7-day sliding expiry
- Account lockout after 5 failed logins (15 minutes)
- Rate limiting: 300 req/min/IP on the API, 25/15 min on auth routes
- CSRF defence: SameSite cookies + Origin check + required custom header
- Helmet security headers with per-app Content-Security-Policies — strict
  for Toolkit and Sigma; Placeholder's CSP additionally whitelists only the
  CDNs its conversion libraries and fonts load from
- Ownership checks on every project route, body-size limits, no leaked stacks

## The landing page

Black, grey and white with a worn-workshop look: film grain, scuffed and
taped cards, stencil headings. Click and drag anywhere on the dark background
to wipe through the grime — a fading trail of dark rainbow gradients follows
the cursor.

## Storage

A JSON file store at `toolkit/data/db.json` (users, sessions, Sigma
projects). Swap `server/store.js` for a real database if you outgrow it.
