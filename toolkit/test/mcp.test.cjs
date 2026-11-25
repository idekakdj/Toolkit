// End-to-end test of the Toolkit MCP server (toolkit/mcp/server.cjs): a real MCP client from
// the official SDK starts it over stdio against an isolated Toolkit server, creates a Sigma
// design and a coloured Pigment page with an access token, and checks they appear for the
// signed-in browser (the dashboard's own APIs). Never touches real data or port 4310.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

const MCP_DIR = path.join(__dirname, '..', 'mcp');
const installed = fs.existsSync(path.join(MCP_DIR, 'node_modules', '@modelcontextprotocol', 'sdk'));
const skip = installed ? false : 'MCP dependencies not installed: run "npm install" in toolkit/mcp';
// CI installs them (.github/workflows/ci.yml), so a missing install there is a failure, not a skip.
if (!installed && process.env.CI) throw new Error('CI must install toolkit/mcp dependencies before running mcp.test.cjs');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-mcp-'));
process.env.TOOLKIT_DATA_DIR = temp;
process.env.TOOLKIT_EMAIL_DNS_CHECK = 'off';
process.env.TOOLKIT_EMAIL_VERIFICATION = 'off';
const app = require('../server/index');
const { db } = require('../server/store');
const sec = require('../server/security');

const PASSWORD = 'Violet-Harbor-Lamp-42';
let server, base, cookie, token, readToken;
const clients = [];

async function call(url, { method = 'GET', body } = {}) {
  const headers = { 'X-Requested-With': 'test', Cookie: cookie };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers, redirect: 'manual', body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
}
async function newToken(scopes) {
  for (const u of db.users) sec.sensitiveLimiter.resetKey('u:' + u.id);
  const r = await call('/api/account/tokens', { method: 'POST', body: { name: 'MCP test', scopes, currentPassword: PASSWORD } });
  assert.equal(r.status, 201);
  return r.data.token;
}

async function connect(env) {
  const req = createRequire(path.join(MCP_DIR, 'package.json'));
  const { Client } = req('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport, getDefaultEnvironment } = req('@modelcontextprotocol/sdk/client/stdio.js');
  const childEnv = { ...getDefaultEnvironment(), ...env };
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(MCP_DIR, 'server.cjs')], env: childEnv, cwd: MCP_DIR, stderr: 'pipe' });
  const client = new Client({ name: 'toolkit-test', version: '1.0.0' });
  await client.connect(transport);
  clients.push(client);
  return client;
}
async function tool(client, name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content.map(c => c.text).join('\n');
  let data = null; try { data = JSON.parse(text); } catch { /* plain message */ }
  return { error: !!r.isError, text, data };
}

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const reg = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'X-Requested-With': 'test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'MCP user', email: 'mcp@example.com', password: PASSWORD, acceptTerms: true }) });
  assert.equal(reg.status, 201);
  cookie = reg.headers.get('set-cookie').split(';')[0];
  token = await newToken(['read', 'write']);
  readToken = await newToken(['read']);
});
after(async () => {
  for (const c of clients) await c.close().catch(() => {});
  await new Promise(r => server.close(r));
  fs.rmSync(temp, { recursive: true, force: true });
});

test('the MCP server lists its tools with descriptions and input schemas', { skip }, async () => {
  const client = await connect({ TOOLKIT_URL: base, TOOLKIT_TOKEN: token });
  const { tools } = await client.listTools();
  const names = tools.map(t => t.name).sort();
  assert.deepEqual(names, ['add_coloring_page', 'add_sigma_shapes', 'create_pigment_painting', 'create_sigma_design', 'fill_regions', 'get_coloring_page', 'get_project', 'list_coloring_pages', 'list_projects']);
  for (const t of tools) {
    assert.ok(t.description && t.description.length > 80, t.name + ' has a usable description');
    assert.equal(t.inputSchema.type, 'object');
  }
  assert.equal(tools.find(t => t.name === 'list_projects').annotations.readOnlyHint, true);
  assert.equal(tools.find(t => t.name === 'fill_regions').annotations.readOnlyHint, false);
});

test('a scripted MCP session creates a Sigma design and a coloured Pigment page that show on the dashboard', { skip }, async () => {
  const client = await connect({ TOOLKIT_URL: base, TOOLKIT_TOKEN: token });

  // ----- Sigma -----
  const made = await tool(client, 'create_sigma_design', {
    name: 'Poster from Claude',
    artboard: { w: 800, h: 600, bg: '#fdf6e3' },
    nodes: [
      { type: 'rect', x: 0, y: 0, w: 800, h: 120, fill: '#264653', name: 'Header' },
      { type: 'ellipse', x: 300, y: 200, w: 200, h: 200, fill: '#e9c46a', stroke: '#264653', strokeWidth: 4 },
      { type: 'star', x: 40, y: 220, w: 120, h: 120, fill: '#f4a261', sides: 6 },
      { type: 'line', x1: 50, y1: 500, x2: 750, y2: 500, stroke: '#2a9d8f', strokeWidth: 6 },
      { type: 'path', points: [[600, 250], [700, 350], [600, 450]], closed: true, fill: '#e76f51' },
      { type: 'text', x: 40, y: 40, text: 'Hello from MCP', fontSize: 40, fill: '#ffffff', fontWeight: 700 },
    ],
  });
  assert.equal(made.error, false, made.text);
  const designId = made.data.id;
  assert.equal(made.data.revision, 1);
  assert.equal(made.data.shapesAdded, 6);
  assert.equal(made.data.openUrl, base + '/sigma/editor/' + designId);

  const stored = (await call('/api/projects/' + designId)).data.project;
  assert.deepEqual(stored.document.artboard, { name: 'Artboard', w: 800, h: 600, bg: '#fdf6e3' });
  const nodes = stored.document.nodes;
  assert.deepEqual(nodes.map(n => n.type), ['rect', 'ellipse', 'star', 'line', 'path', 'text']);
  assert.equal(nodes[0].name, 'Header');
  assert.equal(new Set(nodes.map(n => n.id)).size, 6);
  for (const n of nodes) {
    assert.equal(n.visible, true); assert.equal(n.locked, false);
    assert.ok(n.w > 0 && n.h > 0, n.type + ' has a box');
  }
  assert.deepEqual(nodes[3].points, [[0, 0], [700, 0]]);
  assert.equal(nodes[3].fill, 'none');
  assert.deepEqual({ x: nodes[4].x, y: nodes[4].y, points: nodes[4].points }, { x: 600, y: 250, points: [[0, 0], [100, 100], [0, 200]] });
  assert.equal(nodes[5].text, 'Hello from MCP');

  // A stale baseRevision is refused; nothing is saved.
  const stale = await tool(client, 'add_sigma_shapes', { id: designId, baseRevision: 0, nodes: [{ type: 'rect', x: 1, y: 1, w: 5, h: 5 }] });
  assert.equal(stale.error, true);
  assert.match(stale.text, /Conflict.*changed elsewhere.*revision 1.*get_project/s);
  assert.equal((await call('/api/projects/' + designId)).data.project.document.nodes.length, 6);
  const more = await tool(client, 'add_sigma_shapes', { id: designId, baseRevision: 1, nodes: [{ type: 'polygon', x: 500, y: 20, w: 80, h: 80, fill: '#ffffff', sides: 3 }] });
  assert.equal(more.error, false, more.text);
  assert.equal(more.data.revision, 2);
  assert.equal(more.data.totalShapes, 7);

  // An editor tab that loaded revision 1 cannot overwrite the assistant's change.
  const tabSave = await call('/api/projects/' + designId, { method: 'PUT', body: { baseRevision: 1, document: stored.document } });
  assert.equal(tabSave.status, 409);
  assert.match(tabSave.data.error, /changed elsewhere/);
  assert.equal((await call('/api/projects/' + designId + '/revision')).data.revision, 2, 'open tabs can see the new revision cheaply');

  const read = await tool(client, 'get_project', { app: 'sigma', id: designId });
  assert.equal(read.data.revision, 2);
  assert.equal(read.data.document.nodes.length, 7);

  // ----- Pigment -----
  const painting = await tool(client, 'create_pigment_painting', { name: 'Coloured butterfly' });
  assert.equal(painting.error, false, painting.text);
  const paintingId = painting.data.id;
  const pages = await tool(client, 'list_coloring_pages', { category: 'animals' });
  assert.ok(pages.data.some(p => p.artId === 'butterfly' && p.regions === 9));
  assert.ok(pages.data.every(p => p.category === 'animals'));
  const described = await tool(client, 'get_coloring_page', { artId: 'butterfly' });
  assert.equal(described.data.regions.length, 9);
  assert.equal(described.data.regions.find(r => r.id === 'r5').inside, 'r1');

  const added = await tool(client, 'add_coloring_page', { id: paintingId, artId: 'butterfly', baseRevision: 0 });
  assert.equal(added.error, false, added.text);
  assert.equal(added.data.itemIndex, 0);
  assert.equal(added.data.regions.length, 9);
  const fills = { r1: '#ff9f1c', r2: '#ff9f1c', r3: '#2ec4b6', r4: '#2ec4b6', r9: '#3d2b1f', r5: { grad: 'radial', stops: [{ at: 0, color: '#ffffff' }, { at: 1, color: '#e71d36' }] } };
  const filled = await tool(client, 'fill_regions', { id: paintingId, itemIndex: 0, fills, baseRevision: added.data.revision });
  assert.equal(filled.error, false, filled.text);
  assert.deepEqual(filled.data.stillWhite, ['r6', 'r7', 'r8']);
  const art = (await call('/api/paintings/' + paintingId)).data.painting.document.items[0];
  assert.deepEqual({ kind: art.kind, artId: art.artId, x: art.x, y: art.y, w: art.w, h: art.h }, { kind: 'art', artId: 'butterfly', x: 400, y: 100, w: 800, h: 800 });
  assert.deepEqual(art.fills, fills);

  // Clear errors for bad input; nothing is saved.
  const before = (await call('/api/paintings/' + paintingId)).data.painting.revision;
  const badRegion = await tool(client, 'fill_regions', { id: paintingId, itemIndex: 0, fills: { r42: '#000000' } });
  assert.equal(badRegion.error, true); assert.match(badRegion.text, /no region r42.*r1, r2/);
  const badItem = await tool(client, 'fill_regions', { id: paintingId, itemIndex: 3, fills: { r1: '#000000' } });
  assert.equal(badItem.error, true); assert.match(badItem.text, /not a coloring page.*index 0/);
  const badColour = await tool(client, 'fill_regions', { id: paintingId, itemIndex: 0, fills: { r1: 'red; stroke:url(x)' } });
  assert.equal(badColour.error, true);
  const badArt = await tool(client, 'add_coloring_page', { id: paintingId, artId: 'no-such-art' });
  assert.equal(badArt.error, true); assert.match(badArt.text, /list_coloring_pages/);
  const badShape = await tool(client, 'add_sigma_shapes', { id: designId, nodes: [{ type: 'rect', x: 0, y: 0, w: -4, h: 5 }] });
  assert.equal(badShape.error, true);
  const badName = await tool(client, 'create_sigma_design', { name: 'bad' + String.fromCharCode(0x202e) + 'name' });
  assert.equal(badName.error, true);
  assert.equal((await call('/api/paintings/' + paintingId)).data.painting.revision, before);

  // ----- the dashboard lists both for the signed-in browser -----
  const dashboardProjects = (await call('/api/projects')).data.projects;
  const dashboardPaintings = (await call('/api/paintings')).data.paintings;
  assert.ok(dashboardProjects.some(p => p.id === designId && p.name === 'Poster from Claude'));
  assert.ok(dashboardPaintings.some(p => p.id === paintingId && p.name === 'Coloured butterfly'));
  const home = await fetch(base + '/', { headers: { Cookie: cookie } });
  assert.equal(home.status, 200);
  const listed = await tool(client, 'list_projects', {});
  assert.deepEqual(listed.data.map(p => p.app).sort(), ['pigment', 'sigma']);
  const pv = await tool(client, 'get_project', { app: 'pigment', id: paintingId });
  assert.equal(pv.data.document.items[0].name, 'Butterfly');
});

test('read-only tokens, bad tokens and a stopped Toolkit give clear errors', { skip }, async () => {
  const ro = await connect({ TOOLKIT_URL: base, TOOLKIT_TOKEN: readToken });
  assert.equal((await tool(ro, 'list_projects')).error, false);
  const denied = await tool(ro, 'create_pigment_painting', { name: 'Nope' });
  assert.equal(denied.error, true);
  assert.match(denied.text, /"write" scope.*Read and change/);

  const none = await connect({ TOOLKIT_URL: base, TOOLKIT_TOKEN: '' });
  assert.match((await tool(none, 'list_projects')).text, /No Toolkit access token/);
  const wrong = await connect({ TOOLKIT_URL: base, TOOLKIT_TOKEN: 'tkp_' + 'x'.repeat(43) });
  assert.match((await tool(wrong, 'list_projects')).text, /refused the access token/);
  const down = await connect({ TOOLKIT_URL: 'http://127.0.0.1:9', TOOLKIT_TOKEN: token });
  assert.match((await tool(down, 'list_projects')).text, /Could not reach Toolkit.*running/);
  const remote = await connect({ TOOLKIT_URL: 'http://toolkit.example.com', TOOLKIT_TOKEN: token });
  assert.match((await tool(remote, 'list_projects')).text, /must use https/);
});

test('without TOOLKIT_URL the server finds Toolkit through runtime.json in the data folder', { skip }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-mcp-runtime-'));
  try {
    fs.writeFileSync(path.join(dataDir, 'runtime.json'), JSON.stringify({ pid: process.pid, port: server.address().port, key: 'not-used' }));
    const client = await connect({ TOOLKIT_DATA_DIR: dataDir, TOOLKIT_TOKEN: token });
    const listed = await tool(client, 'list_projects', { app: 'sigma' });
    assert.equal(listed.error, false, listed.text);
    assert.ok(listed.data[0].openUrl.startsWith(base));
  } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
});
