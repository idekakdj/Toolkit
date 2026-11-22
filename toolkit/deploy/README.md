# Cross-device Toolkit

All devices use one HTTPS Toolkit server and one durable database. Browser and desktop sessions log in independently to the same accounts. Saved Sigma, Pigment and ImageVendor designs and app-to-app imports use that server. Placeholder conversions still run on the device; exported files and unsaved canvases are not synchronized. Reopen or refresh a saved project on another device to see updates. Revision guards reject conflicting saves; this is not live collaboration or offline synchronization.

## Host the shared server

Use a single Linux server with Node 24, NGINX and a domain with a valid TLS certificate. Copy the workspace's app asset folders and toolkit sources to `/opt/toolkit` (do not upload node_modules, dist, local databases or credentials). In `/opt/toolkit/toolkit` run `npm ci --omit=dev --ignore-scripts`. Create a dedicated `toolkit` OS user and `/var/lib/toolkit`, writable only by that user. Replace the example hostname in both configuration templates, install the systemd service and NGINX config, and enable the service. Only HTTPS/HTTP ports need public access; Node binds exclusively to loopback. The provided trusted proxy overwrites forwarding headers for reliable per-client rate limits.

For manual startup set `TOOLKIT_PUBLIC_URL=https://your-domain`, `TOOLKIT_DATA_DIR` to the durable private data folder, and run `npm run start:hosted`. The HTTPS reverse proxy must run on the same host, retain the configured public Host header, and overwrite X-Forwarded-For. Do not run multiple replicas; the JSON store is a single-process store. Its runtime lock rejects concurrent writers. Back up the database regularly while the service is stopped, with restricted permissions; it contains private artwork and password hashes. Do not place it in a web-served folder.

## Move existing local accounts once

Stop Toolkit and its local web server before taking a backup of `%APPDATA%/Toolkit/data/db.json`. Transfer the backup privately to the server. With the hosted service stopped, use `TOOLKIT_DATA_DIR=/var/lib/toolkit node /opt/toolkit/toolkit/scripts/migrate-local.cjs /private/path/db.json`. The migration preserves accounts, passwords, artwork and ownership and refuses to overwrite a different populated database. Clear migrated sessions before starting the service: `TOOLKIT_DATA_DIR=/var/lib/toolkit node -e "const s=require('./server/store');s.db.sessions={};s.save();s.flush()"` from `/opt/toolkit/toolkit`. This requires devices to log in again instead of transferring active login tokens. Retain the local backup. Do not copy databases back and forth after devices start saving to the server.

## Connect every device

Browsers: open your HTTPS server address and sign in with the migrated account.

Desktop 1.0.2+: edit `connection.example.json` with the same HTTPS address. Choose **Toolkit → Connect to shared server…**, select this file, verify the address and restart. The connection is saved in your local profile across launches. Alternatively set `TOOLKIT_SERVER_URL` before starting the desktop app. No passwords or tokens belong in the connection file. Local data remains untouched. **Toolkit → Use local Toolkit** returns to local mode after restarting; remove an environment override first if you set one.

The desktop renderer remains sandboxed with no Node integration or IPC/filesystem bridge. Navigation stays within the selected origin; TLS certificate validation is never bypassed. A server connection does not automatically upload local accounts: complete the one-time server migration first. Without a deployed HTTPS server, cross-device access is not active.

Configuration references: [NGINX proxy headers](https://nginx.org/en/docs/http/ngx_http_proxy_module.html), [Electron remote-content security](https://github.com/electron/electron/blob/main/docs/tutorial/security.md).

## Security configuration for a hosted server

Copy `toolkit.env.example` to `/etc/toolkit/toolkit.env` (root-owned, mode 600) and set at least
`TOOLKIT_DATA_KEY` (encryption at rest), `TOOLKIT_SMTP_URL` / `TOOLKIT_MAIL_FROM` (email verification and
password reset) and `TOOLKIT_PRIVACY_CONTACT`. `npm run start:hosted` prints a `[security]` warning for each
safeguard that is missing. The NGINX and systemd templates add request-rate shields, slow-client timeouts,
route-specific body limits and OS-level sandboxing; keep the `client_max_body_size` values in step with the
application's limits (27 MB for ImageVendor documents).

Deploying this version signs existing hosted users out once (the session cookie is now `__Host-toolkit_session`).
Sessions end after 12 hours of inactivity or 7 days in total. Run `node scripts/verify-audit.cjs` daily and ship
the `audit/` folder off the host. For account requests that users cannot complete themselves (lockout without mail,
data export or erasure on request) use `node scripts/admin.cjs` with the service stopped.

The full operating guide, backup and key-rotation procedures, incident response and the compliance mapping are in
[`docs/compliance/`](../docs/compliance/README.md).
