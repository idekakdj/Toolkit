# Toolkit MCP server

A local [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI
assistant, such as Claude Desktop or Claude Code, work with your Toolkit projects. It runs
on your computer over stdio. It talks only to the Toolkit you already run there, using a
personal access token you create and can revoke at any time.

Phase 1 covers the following. Phase 2 is listed [at the end](#phase-2-not-yet-built).

| Tool | What it does |
|---|---|
| `list_projects(app?)` | Lists your Sigma designs, Pigment paintings and ImageVendor images, newest first, each with an `openUrl`. |
| `get_project(app, id)` | Reads one item and its current `revision`. Image bytes and long point lists are summarised. |
| `create_sigma_design(name, nodes?, artboard?)` | Makes a Sigma design, optionally with shapes: rect, ellipse, polygon, star, line, path and text. |
| `add_sigma_shapes(id, nodes, baseRevision?)` | Adds shapes on top of an existing design. |
| `create_pigment_painting(name, canvas?)` | Makes an empty Pigment painting. |
| `list_coloring_pages(category?)` | Lists the 112 pieces in Pigment's coloring library. |
| `get_coloring_page(artId)` | Describes a piece's fillable regions, so the assistant knows which region is the wing, the eye, and so on. |
| `add_coloring_page(id, artId, x?, y?, size?, baseRevision?)` | Places a coloring page on a painting. |
| `fill_regions(id, itemIndex, fills, baseRevision?)` | Colours regions with hex colours or gradients. |

**Changes never overwrite each other.** Every write reads the item and saves it with the
revision it read (`baseRevision`). If the item changed in the meantime (in a Toolkit tab,
on another device or by another tool), Toolkit refuses the save with `409`. The tool then
reports a conflict and tells the assistant to read the item again. Editor tabs work the
same way. An open Sigma or Pigment tab checks for a newer revision when it regains focus,
and every 20 seconds while visible. When it finds one, it pauses autosave and shows
*"Changed elsewhere … Reload"*. Local edits stay on screen, so you can export them first.

Items the assistant creates or changes appear on the Toolkit dashboard right away. Their
preview images refresh the next time you edit them in the app. Until then, the dashboard
shows the item's initial.

## 1. Install

The server ships with the Toolkit source; it is not part of the desktop installer. It needs
[Node.js](https://nodejs.org) 20 or newer.

```
cd toolkit/mcp
npm install
```

## 2. Create an access token

1. Start Toolkit: open the desktop app, or run `npm start` in `toolkit/`.
2. Open **Account** (http://127.0.0.1:4310/account) and find **Access tokens**.
3. Fill in the form:
   - **Name**: what the token is for, such as *Claude Desktop on my laptop*.
   - **Access**: *Read and change* to let the assistant create and edit; *Read only* to let it only look.
   - **Expires after**: 7, 30, 90 (the default) or 365 days, or never.
   - **Current password**: if your account uses Google sign-in only, Toolkit asks you to
     continue with Google again instead.
4. Select **Create token** and copy the token, which starts with `tkp_`. **It is shown
   only once.** Toolkit stores only a hash of it.

A token can read and change your projects, paintings and images, and nothing else. It
cannot sign in to the Toolkit pages, change your password or account settings, export or
delete your account, or create more tokens. Every request made with a token is written
to Toolkit's security audit log. Token requests are rate limited like any other API use.

**To revoke a token**, select **Revoke** next to it under Account > Access tokens. Tools
that use it stop working at once. Deleting your account removes all its tokens. Changing
your password does *not* revoke tokens, so revoke any you no longer recognise.

Treat a token like a password. It sits in plain text in your assistant's configuration
file, so don't put that file in a shared folder or a git repository.

## 3. Add the server to your assistant

Replace the path below with the full path to `toolkit/mcp/server.cjs` in your copy of
Toolkit. Replace `tkp_...` with your token.

### Claude Desktop

Open **Settings > Developer > Edit Config**. This opens `claude_desktop_config.json`:
`%APPDATA%\Claude\claude_desktop_config.json` on Windows, or
`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS. Add a
`toolkit` entry under `mcpServers`:

```json
{
  "mcpServers": {
    "toolkit": {
      "command": "node",
      "args": ["C:\\Users\\you\\Documents\\GitHub\\Toolkit\\toolkit\\mcp\\server.cjs"],
      "env": { "TOOLKIT_TOKEN": "tkp_..." }
    }
  }
}
```

Quit Claude Desktop completely, then reopen it. If `node` is not found, give its full
path as `command`, for example `C:\\Program Files\\nodejs\\node.exe`.

### Claude Code

```
claude mcp add toolkit --scope user --env TOOLKIT_TOKEN=tkp_... -- node C:\Users\you\Documents\GitHub\Toolkit\toolkit\mcp\server.cjs
```

Run `claude mcp list` to check that it connects. Use `--scope user` (your own settings) or
the default `local` scope. **Do not use `--scope project`**: it writes the token into
`.mcp.json` in the repository, where it could be committed.

### Try it

Ask, for example: *"Using Toolkit, make a Sigma poster for a bake sale"* or *"Colour the
butterfly coloring page in sunset colours in a new Pigment painting."*

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `TOOLKIT_TOKEN` | (required) | The access token from step 2. |
| `TOOLKIT_URL` | read from `runtime.json`, else `http://127.0.0.1:4310` | Where Toolkit runs. Plain `http` is allowed only for `127.0.0.1` and `localhost`, so a token never crosses a network unencrypted. |
| `TOOLKIT_DATA_DIR` | `%APPDATA%\Toolkit\data` (Windows) or `~/.local/share/Toolkit/data` | The Toolkit data folder. Only the port is read from its `runtime.json`. |

The server checks where Toolkit runs on every request. If you restart Toolkit, the
assistant keeps working without a restart. If Toolkit is not running, the tools say so.

## Troubleshooting

- **"Could not reach Toolkit"**: start the desktop app, or run `npm start` in `toolkit/`.
- **"Toolkit refused the access token"**: the token was revoked, has expired or was
  mistyped. Create a new one.
- **"does not have the write scope"**: the token is read only. Create one with *Read and change* access.
- **"Conflict: this item was changed elsewhere"**: someone changed the item after the
  assistant read it. The assistant should call `get_project` and try again.
- Server messages go to stderr. In Claude Desktop, they appear under Settings > Developer.

## Testing

`node toolkit/test/run-all.cjs` includes:

- `toolkit/test/tokens.test.cjs`: token creation, scopes, refusal outside the
  document APIs, revocation, expiry, auditing and account deletion.
- `toolkit/test/mcp.test.cjs`: the official MCP SDK client starts this server over stdio
  against a temporary Toolkit. It creates a Sigma design and a coloured Pigment page, then
  checks conflicts, errors and discovery through `runtime.json`.

The MCP test is skipped if `npm install` has not been run here.

## Phase 2 (not yet built)

- A remote MCP server that can be reached over the internet, for the hosted Toolkit,
  signed in with OAuth instead of pasted tokens.
- ChatGPT and other assistants that need a remote server.
- ImageVendor pixel editing, such as painting, filters and layers.
- Placeholder file conversions.
- Server-side preview images for items changed by an assistant.
- Live updates in open tabs, instead of the current "Reload" prompt.
