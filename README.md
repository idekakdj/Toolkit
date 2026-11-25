# Toolkit workspace

One channel for every app. This folder holds the **Toolkit** shell and the
apps it hosts.

```
toolkit/      the shell: server, shared sign-in, landing page, user data
sigma/        Sigma - a Figma-inspired design studio (frontend, served at /sigma)
placeholder/  Placeholder - a client-side file converter (served at /placeholder)
pigment/      Pigment - paint, gradients and colorable clipart (served at /pigment)
imagevendor/  ImageVendor - layered raster editing (served at /imagevendor)
```

## Run everything

```
cd toolkit
npm install
npm start
```

Then open http://localhost:4310

## Windows desktop app

Toolkit can also run as an installed desktop app with all four tools and shared
local sign-in. From `toolkit/`, run `npm run desktop` for development or
`npm run build:desktop` to create the Windows x64 installer in `dist/`.
Normal users install the setup executable and need no Node.js installation.
See [desktop setup and data guide](toolkit/desktop/README.md) for packaging,
local data, migration, testing and signing details.

| URL | What |
|---|---|
| `/` | Toolkit landing (worn black/grey/white, rainbow drag trail) |
| `/auth` | Shared sign in / sign up — one account for every app |
| `/sigma` | Sigma landing → dashboard → editor (sign-in required past the landing) |
| `/placeholder/` | Placeholder landing → converter (sign-in required for the converter) |
| `/pigment` | Pigment landing → paint studio |
| `/imagevendor` | ImageVendor landing → layered image editor |

Sign in once and the session covers every app: Toolkit issues a single
`HttpOnly` + `SameSite=Strict` session cookie that all four apps
ride on. All security middleware (bcrypt password hashing, hashed session
tokens, login lockout, rate limiting, CSRF checks, helmet security headers
with per-app Content-Security-Policies) lives in `toolkit/server/` and fronts
every route.

## Use Toolkit from an AI assistant (MCP)

Claude Desktop, Claude Code and other MCP clients can list and read your projects,
draw Sigma designs and colour Pigment coloring pages. They do this through a local MCP
server in `toolkit/mcp/`, which talks to the Toolkit running on your computer.

1. **Install it** (once): run `npm install` in `toolkit/mcp`. You need Node.js 20 or newer.
2. **Create a token**: open Toolkit **Account > Access tokens**. Give the token a name,
   pick *Read and change* or *Read only* and an expiry, then confirm your password.
   Copy the `tkp_...` token: it is shown only once, and Toolkit keeps only its hash. A
   token can reach projects, paintings and images, nothing else. Every use is audited.
3. **Add it to Claude Desktop**: open Settings > Developer > Edit Config, which opens
   `claude_desktop_config.json` (on Windows, `%APPDATA%\Claude\claude_desktop_config.json`).
   Add the entry below, then restart Claude Desktop:

   ```json
   {
     "mcpServers": {
       "toolkit": {
         "command": "node",
         "args": ["C:\\path\\to\\Toolkit\\toolkit\\mcp\\server.cjs"],
         "env": { "TOOLKIT_TOKEN": "tkp_..." }
       }
     }
   }
   ```

   **Or add it to Claude Code** (keep the token out of the repository's `.mcp.json`
   by using the user scope):

   ```
   claude mcp add toolkit --scope user --env TOOLKIT_TOKEN=tkp_... -- node C:\path\to\Toolkit\toolkit\mcp\server.cjs
   ```

4. **Revoke a token** from the same Account page whenever you like. Tools using it stop
   at once.

The server finds Toolkit's port in `runtime.json` in the data folder, or falls back to
`http://127.0.0.1:4310`. Set `TOOLKIT_URL` to override this. Every change it makes uses
the same revision check as the editors. An open tab that is changed by the assistant
shows *"Changed elsewhere … Reload"* instead of overwriting the change.

Phase 2, not built yet: a remote MCP server reachable over the internet, OAuth sign-in,
ChatGPT support, ImageVendor pixel editing and Placeholder conversions. See the
[MCP server guide](toolkit/mcp/README.md) for the tool list, settings, troubleshooting
and the phase 2 list.

## Verification and data

Run `npm test` from `toolkit/` for all sixteen regression suites. Tests use a
temporary database, leaving the shared app-data database untouched. App-specific
regression checks live alongside the corresponding app. `npm run test:browser`
exercises real editing gestures in headless Edge using Playwright. Install
Playwright in your development environment, or set `TOOLKIT_PLAYWRIGHT_PATH`
to an existing Playwright package directory. The browser test also uses a
temporary account and database.

Browser and desktop use `%APPDATA%/Toolkit/data/db.json` on Windows. Open
`http://127.0.0.1:4310` while the desktop app or `npm start` is running. Both
clients share accounts and saved artwork across sessions through one server;
they retain separate login cookies. Legacy data can be migrated using
`node toolkit/scripts/migrate-local.cjs` with Toolkit closed. See the desktop
guide for backups and limits. This is local sharing, not cross-device cloud sync.

The server supports `TOOLKIT_DATA_DIR` for isolated test or deployment data.
Back up the data directory before migrating or deploying. A malformed database
stops startup instead of silently replacing saved accounts and artwork.

Cross-app transfers flatten raster artwork into image layers or image nodes;
they do not preserve every source app's editable layer structure. Placeholder
conversions run locally in the browser and some formats depend on CDN libraries.

All three editors reject saves based on an older document revision. If a conflict
appears, export your local edits before reloading; autosave stays stopped to
protect the newer saved document. ImageVendor handoffs use original-resolution
transparent PNGs within the destination's 8 MB document limit. Imported Sigma
text in Pigment is rasterized and cannot be edited as text.

Recent feature additions: Sigma equal spacing, Pigment rectangle/ellipse tools,
ImageVendor layer-preserving image resize, and Placeholder image resize during
conversion (including same-format output). See [FEATURE_SCOPE.md](FEATURE_SCOPE.md)
for controls, bounds, verification and remaining feature scope.
