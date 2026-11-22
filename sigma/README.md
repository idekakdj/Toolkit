# Sigma

A Figma-inspired, browser-based vector design studio. Create an account,
spin up projects, and design with the core tools you'd expect — shapes, pen,
text, layers, groups, alignment, a built-in clipart library — then export
your work as PNG, JPEG or SVG.

## Run it

Sigma now lives inside the **Toolkit** shell, which provides the server,
the shared sign-in and all security middleware:

```
cd toolkit
npm install
npm start
```

Then open http://localhost:4310/sigma — one Toolkit account covers Sigma,
Placeholder and every future app in the shell.

## What's inside

| Area | Details |
|------|---------|
| Landing page | Rustic palette — terracotta orange, turquoise, beige |
| Accounts | Register / sign in / sign out, per-user projects |
| Dashboard | Create, rename, delete, open projects (with live thumbnails) |
| Editor | Move/select, hand, rectangle, ellipse, line, polygon, star, pen, text, clipart |
| Layers | Reorder (drag), rename, hide, lock, group/ungroup |
| Styling | Fill, stroke, opacity, corner radius, rotation, fonts, alignment, equal horizontal/vertical gaps |
| Export | PNG / JPEG / SVG at 1×, 2×, 4× — artboard or selection |
| Clipart | 19 original hand-drawn pieces, several recolorable |

## Security

- Passwords hashed with bcrypt (11 rounds); login failures never reveal
  whether an account exists (constant-time style compare on a dummy hash).
- Sessions: 256-bit random tokens stored **hashed** server-side,
  `HttpOnly` + `SameSite=Strict` cookies (+ `Secure` in production).
- Account lockout after 5 failed logins (15 minutes).
- Rate limiting: 300 req/min per IP on the API, 25/15 min on auth routes.
- CSRF defence: SameSite cookies + Origin check + required custom header.
- Helmet security headers with a strict Content-Security-Policy
  (no inline/external scripts, `frame-ancestors 'none'`, etc.).
- Saved names use `textContent`; SVG library markup is trusted static content.
  Imported raster nodes use embedded PNG/JPEG/WebP data, with local files
  normalized to PNG before insertion.
- Server-side validation everywhere: sizes, types, ownership checks on
  every project route, JSON body limits, no stack traces leaked.

## Storage

The shared Toolkit server owns persistence in `%APPDATA%/Toolkit/data/db.json`
on Windows, shared with the desktop app.
Sigma's browser code uses `/api/projects`; there is no separate Sigma server.

## Regression checks

From `sigma`, run `npm test` (or `node --test tests/regression.test.js`).
Tests use synthetic documents, fake canvas/image objects and mocked requests.
They neither start Toolkit nor read or write its database.

See [AUDIT.md](AUDIT.md) for review findings and verification limits.
