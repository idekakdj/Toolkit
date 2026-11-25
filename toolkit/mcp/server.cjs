#!/usr/bin/env node
// Toolkit MCP server (phase 1: local, stdio). Lets an AI assistant such as Claude Desktop or
// Claude Code list and read your Toolkit projects, draw Sigma designs and colour Pigment
// coloring pages, by calling the Toolkit you already run on this computer.
//
//   TOOLKIT_TOKEN  personal access token from Toolkit > Account > Access tokens (required)
//   TOOLKIT_URL    optional, e.g. http://127.0.0.1:4310 (default: the port in runtime.json)
//   TOOLKIT_DATA_DIR optional, the Toolkit data folder holding runtime.json
//
// Every write reads the item, changes it and saves it with the revision it read
// (baseRevision), so a change made meanwhile in a Toolkit tab or elsewhere is never
// overwritten: the server refuses with 409 and the tool reports a conflict.
// stdout carries the MCP protocol only; diagnostics go to stderr.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { createClient, ToolkitError } = require('./lib/client.cjs');
const { loadLibrary } = require('./lib/coloring.cjs');
const S = require('./lib/schemas.cjs');
const { z } = S;

const VERSION = require('./package.json').version;

const APPS = {
  sigma: { collection: 'projects', key: 'project', label: 'Sigma design', open: id => '/sigma/editor/' + id },
  pigment: { collection: 'paintings', key: 'painting', label: 'Pigment painting', open: id => '/pigment/app?id=' + encodeURIComponent(id) },
  imagevendor: { collection: 'images', key: 'image', label: 'ImageVendor image', open: id => '/imagevendor/app?id=' + encodeURIComponent(id) },
};

const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

const json = value => JSON.stringify(value, null, 2);
const ok = value => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : json(value) }] });
const fail = text => ({ isError: true, content: [{ type: 'text', text }] });

// Turns Toolkit errors into messages an assistant can act on.
function explain(err, what) {
  if (!(err instanceof ToolkitError)) return fail(`Unexpected error${what ? ' while ' + what : ''}: ${err && err.message}`);
  if (err.status === 409) {
    const now = err.data && Number.isInteger(err.data.revision) ? ` It is now at revision ${err.data.revision}.` : '';
    return fail(`Conflict: this item was changed elsewhere (in a Toolkit tab, on another device or by another tool) after you read it, so nothing was saved.${now} Call get_project to read the latest version, then make your change again.`);
  }
  if (err.status === 401) return fail(`Toolkit refused the access token: ${err.message} Create a new token on the Toolkit account page and update TOOLKIT_TOKEN.`);
  if (err.status === 403 && err.code === 'token_scope') return fail(`${err.message} Create a token with "Read and change" access on the Toolkit account page.`);
  if (err.status === 404) return fail(`Not found: ${err.message}. Check the id with list_projects.`);
  if (err.status === 413) return fail(`Too large: ${err.message}`);
  if (err.status === 429) return fail(`Toolkit is rate limiting requests: ${err.message} Wait a minute, then try again.`);
  return fail(err.message + (what ? ` (while ${what})` : ''));
}

function guard(what, fn) {
  return async args => {
    try { return await fn(args); } catch (err) { return explain(err, what); }
  };
}

function summary(app, rec, base) {
  return { app, id: rec.id, name: rec.name, revision: rec.revision, updatedAt: rec.updatedAt ? new Date(rec.updatedAt).toISOString() : null, openUrl: base + APPS[app].open(rec.id) };
}

// ---------- document views for the assistant (no image bytes, no stroke point dumps) ----------
function sigmaView(doc) {
  return {
    artboard: doc.artboard,
    nodes: (doc.nodes || []).map(n => {
      const v = { ...n };
      if (typeof v.src === 'string') v.src = `[embedded image, ${v.src.length} characters omitted]`;
      if (Array.isArray(v.points) && v.points.length > 50) v.points = `[${v.points.length} points omitted]`;
      return v;
    }),
  };
}
function pigmentView(doc, library) {
  return {
    canvas: doc.canvas,
    items: (doc.items || []).map((it, index) => {
      if (it && it.kind === 'art') {
        const piece = library.pieces.get(it.artId);
        return { index, kind: 'art', artId: it.artId, name: piece ? piece.name : '(unknown piece)', x: it.x, y: it.y, w: it.w, h: it.h, fills: it.fills || {}, regionCount: piece ? piece.regions.length : 0 };
      }
      const v = { index, ...it };
      if (Array.isArray(v.points)) v.points = `[${v.points.length} points]`;
      if (typeof v.src === 'string') v.src = '[embedded image omitted]';
      return v;
    }),
  };
}
function imageView(doc) {
  return {
    canvas: doc.canvas,
    layers: (doc.layers || []).map(l => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, hasPixels: !!l.data })),
    note: 'Pixel editing of ImageVendor images is not available through this server yet.',
  };
}

function createServer({ client = createClient(), library = loadLibrary() } = {}) {
  const server = new McpServer({ name: 'toolkit', version: VERSION }, {
    instructions: 'Tools for the user\'s own Toolkit apps running on this computer: Sigma (vector designs), Pigment (painting and coloring pages) and ImageVendor (raster images, read-only here). '
      + 'Read before you write: list_projects finds items, get_project shows one with its revision. Every change is saved with optimistic concurrency; if a tool reports a conflict, '
      + 'the user or another tool changed the item meanwhile: call get_project again and redo the change on the latest version. Never retry a conflict blindly. '
      + 'Items you create or change appear on the Toolkit dashboard; give the user the openUrl from the result.',
  });

  async function load(app, id) {
    const data = await client.get(`/api/${APPS[app].collection}/${encodeURIComponent(id)}`);
    return data[APPS[app].key];
  }
  async function save(app, id, baseRevision, body) {
    const data = await client.put(`/api/${APPS[app].collection}/${encodeURIComponent(id)}`, { ...body, baseRevision });
    return data[APPS[app].key];
  }
  // Read, check the caller's expected revision, change, and save with the revision read.
  async function modify(app, id, expected, change) {
    const rec = await load(app, id);
    if (expected !== undefined && rec.revision !== expected) {
      throw new ToolkitError('stale', { status: 409, data: { revision: rec.revision } });
    }
    const doc = structuredClone(rec.document);
    const extra = change(doc, rec) || {};
    const bytes = S.documentBytes(doc);
    if (bytes > S.LIMITS.MAX_DOCUMENT_BYTES) return { tooLarge: bytes };
    // The stored preview would no longer match; the app draws a fresh one on its next save.
    const saved = await save(app, id, rec.revision, { document: doc, thumbnail: null });
    return { rec, saved, doc, ...extra };
  }

  // ----- reading -----
  server.registerTool('list_projects', {
    title: 'List Toolkit projects',
    description: 'Lists the user\'s Toolkit items, newest first: Sigma designs, Pigment paintings and ImageVendor images. Each entry has app, id, name, revision, updatedAt and openUrl (a link the user can open in Toolkit). Use the id and app with the other tools.',
    inputSchema: { app: S.appName.optional().describe('Only list this app\'s items. Leave out to list all three apps.') },
    annotations: READ,
  }, guard('listing projects', async ({ app }) => {
    const base = client.baseUrl();
    const apps = app ? [app] : Object.keys(APPS);
    const out = [];
    for (const a of apps) {
      const data = await client.get(`/api/${APPS[a].collection}`);
      for (const rec of data[APPS[a].collection] || []) out.push(summary(a, rec, base));
    }
    out.sort((x, y) => String(y.updatedAt).localeCompare(String(x.updatedAt)));
    return ok(out.length ? out : 'No items yet. Create one with create_sigma_design or create_pigment_painting.');
  }));

  server.registerTool('get_project', {
    title: 'Read a Toolkit project',
    description: 'Returns one item with its current revision and contents. Sigma: the artboard and every node (shape) in drawing order, back to front; coordinates are artboard pixels from the top-left. '
      + 'Pigment: the canvas and every item with its index; coloring pages (kind "art") show their artId, position, size and current fills. ImageVendor: canvas and layer names only. '
      + 'Pass the returned revision as baseRevision to a later change to be sure you are changing what you read.',
    inputSchema: { app: S.appName, id: S.id.describe('Item id from list_projects.') },
    annotations: READ,
  }, guard('reading the project', async ({ app, id }) => {
    const rec = await load(app, id);
    const doc = rec.document || {};
    const view = app === 'sigma' ? sigmaView(doc) : app === 'pigment' ? pigmentView(doc, library) : imageView(doc);
    return ok({ ...summary(app, rec, client.baseUrl()), document: view });
  }));

  // ----- Sigma -----
  server.registerTool('create_sigma_design', {
    title: 'Create a Sigma design',
    description: 'Creates a new Sigma vector design, optionally with shapes, and returns its id, revision and openUrl. The artboard defaults to 1280 x 800 white; x grows to the right and y grows downward from the artboard\'s top-left corner. '
      + 'Shapes: rect, ellipse, polygon and star use a bounding box (x, y, w, h); line uses x1, y1, x2, y2; path uses a list of [x, y] points (closed: true to fill it); text uses x, y and text. '
      + 'Colours are hex strings such as "#2a6fdb". Shapes are drawn in list order, so put backgrounds first. An account holds at most 100 designs.',
    inputSchema: {
      name: S.name,
      nodes: S.shapeList.optional(),
      artboard: S.artboard.optional().describe('Artboard size and background. Leave out for 1280 x 800 white.'),
    },
    annotations: WRITE,
  }, guard('creating the design', async ({ name, nodes, artboard }) => {
    const created = (await client.post('/api/projects', { name })).project;
    let rec = created;
    if ((nodes && nodes.length) || artboard) {
      const full = await load('sigma', created.id);
      const doc = full.document;
      if (artboard) doc.artboard = { ...doc.artboard, ...artboard };
      doc.nodes = S.toSigmaNodes(nodes || [], doc.nodes);
      rec = await save('sigma', created.id, full.revision, { document: doc });
    }
    return ok({ ...summary('sigma', rec, client.baseUrl()), shapesAdded: nodes ? nodes.length : 0 });
  }));

  server.registerTool('add_sigma_shapes', {
    title: 'Add shapes to a Sigma design',
    description: 'Adds shapes on top of an existing Sigma design (same shape format as create_sigma_design) and returns the new revision and the ids of the added nodes. Read the design with get_project first to see the artboard size and what is already there. '
      + `A design holds at most ${S.LIMITS.MAX_NODES} shapes. If the design was changed after the revision you pass as baseRevision, nothing is saved and a conflict is reported.`,
    inputSchema: { id: S.id.describe('Sigma design id.'), nodes: S.shapeList, baseRevision: S.baseRevision },
    annotations: WRITE,
  }, guard('adding shapes', async ({ id, nodes, baseRevision }) => {
    let added = [];
    const result = await modify('sigma', id, baseRevision, doc => {
      if (!Array.isArray(doc.nodes)) doc.nodes = [];
      if (doc.nodes.length + nodes.length > S.LIMITS.MAX_NODES) {
        throw new ToolkitError(`This design has ${doc.nodes.length} shapes; adding ${nodes.length} would pass the limit of ${S.LIMITS.MAX_NODES}.`);
      }
      added = S.toSigmaNodes(nodes, doc.nodes);
      doc.nodes.push(...added);
    });
    if (result.tooLarge) return fail(`The design would be ${Math.round(result.tooLarge / 1048576)} MB, over the 8 MB limit. Add fewer or simpler shapes.`);
    return ok({ ...summary('sigma', result.saved, client.baseUrl()), addedNodeIds: added.map(n => n.id), totalShapes: result.doc.nodes.length });
  }));

  // ----- Pigment -----
  server.registerTool('create_pigment_painting', {
    title: 'Create a Pigment painting',
    description: 'Creates a new, empty Pigment painting and returns its id, revision and openUrl. The canvas defaults to 1600 x 1000 white. To make a coloring page, follow with add_coloring_page and then fill_regions. An account holds at most 100 paintings.',
    inputSchema: { name: S.name, canvas: S.canvas.optional().describe('Canvas size and background. Leave out for 1600 x 1000 white.') },
    annotations: WRITE,
  }, guard('creating the painting', async ({ name, canvas }) => {
    let rec = (await client.post('/api/paintings', { name })).painting;
    if (canvas) {
      const full = await load('pigment', rec.id);
      rec = await save('pigment', rec.id, full.revision, { document: { ...full.document, canvas: { ...full.document.canvas, ...canvas } } });
    }
    return ok(summary('pigment', rec, client.baseUrl()));
  }));

  server.registerTool('list_coloring_pages', {
    title: 'List Pigment coloring pages',
    description: 'Lists the line-art pieces in Pigment\'s coloring library (id, name, category, number of fillable regions). Use an id as artId in add_coloring_page. Categories: '
      + library.categories.map(c => `${c.key} (${c.label})`).join(', ') + '.',
    inputSchema: { category: z.enum(library.categories.map(c => c.key)).optional().describe('Only list this category.') },
    annotations: READ,
  }, guard('listing coloring pages', async ({ category }) => {
    const out = [];
    for (const p of library.pieces.values()) if (!category || p.category === category) out.push({ artId: p.id, name: p.name, category: p.category, regions: p.regions.length });
    return ok(out);
  }));

  server.registerTool('get_coloring_page', {
    title: 'Describe a coloring page',
    description: 'Describes the fillable regions of one coloring-library piece so you can choose colours: each region has an id (r1, r2, ...), its shape, bounding box and centre in the piece\'s own 200 x 200 grid '
      + '(0,0 = top-left), a rough position in words, its area, and "inside" (the region it sits within, e.g. an eye inside a head). Regions are listed in drawing order; later ones are drawn on top. The SVG markup is included for closer reading.',
    inputSchema: { artId: z.string().min(1).max(64).describe('Piece id from list_coloring_pages.') },
    annotations: READ,
  }, guard('reading the coloring page', async ({ artId }) => {
    const p = library.pieces.get(artId);
    if (!p) return fail(`There is no coloring page "${artId}". Use list_coloring_pages to see the ids.`);
    return ok({ artId: p.id, name: p.name, category: p.category, grid: '200 x 200', regions: p.regions, markup: p.markup.trim() });
  }));

  server.registerTool('add_coloring_page', {
    title: 'Add a coloring page to a painting',
    description: 'Places a coloring-library piece (all regions white) on a Pigment painting and returns its itemIndex, which fill_regions needs, plus a description of its regions. '
      + 'By default the piece is centred and 80% of the canvas\'s shorter side; it is always square. If the painting was changed after baseRevision, nothing is saved and a conflict is reported.',
    inputSchema: {
      id: S.id.describe('Pigment painting id.'),
      artId: z.string().min(1).max(64).describe('Piece id from list_coloring_pages, e.g. "butterfly".'),
      x: S.coord.optional().describe('Left edge on the canvas, in pixels.'),
      y: S.coord.optional().describe('Top edge on the canvas, in pixels.'),
      size: S.size.optional().describe('Width and height in canvas pixels.'),
      baseRevision: S.baseRevision,
    },
    annotations: WRITE,
  }, guard('adding the coloring page', async ({ id, artId, x, y, size, baseRevision }) => {
    const piece = library.pieces.get(artId);
    if (!piece) return fail(`There is no coloring page "${artId}". Use list_coloring_pages to see the ids.`);
    let itemIndex = -1;
    const result = await modify('pigment', id, baseRevision, doc => {
      if (!Array.isArray(doc.items)) doc.items = [];
      if (doc.items.length >= S.LIMITS.MAX_ITEMS) throw new ToolkitError(`This painting already has the maximum of ${S.LIMITS.MAX_ITEMS} items.`);
      const s = size ?? Math.round(Math.min(doc.canvas.w, doc.canvas.h) * 0.8);
      doc.items.push({ kind: 'art', artId, x: x ?? Math.round((doc.canvas.w - s) / 2), y: y ?? Math.round((doc.canvas.h - s) / 2), w: s, h: s, fills: {} });
      itemIndex = doc.items.length - 1;
    });
    if (result.tooLarge) return fail('The painting is over the 8 MB limit.');
    return ok({ ...summary('pigment', result.saved, client.baseUrl()), itemIndex, artId, name: piece.name, regions: piece.regions });
  }));

  server.registerTool('fill_regions', {
    title: 'Colour regions of a coloring page',
    description: 'Fills regions of a coloring page already on a Pigment painting. "fills" maps region ids (from add_coloring_page or get_coloring_page, e.g. "r1") to a hex colour such as "#f4a261", '
      + 'or to a gradient {"grad": "linear", "angle": 90, "stops": [{"at": 0, "color": "#ffd166"}, {"at": 1, "color": "#ef476f"}]}. Use "#ffffff" to make a region white again. Regions you leave out keep their colour. '
      + 'If the painting was changed after baseRevision, nothing is saved and a conflict is reported.',
    inputSchema: {
      id: S.id.describe('Pigment painting id.'),
      itemIndex: z.number().int().min(0).max(S.LIMITS.MAX_ITEMS - 1).describe('Index of the coloring page in the painting (from add_coloring_page or get_project).'),
      fills: z.record(z.string().regex(/^r\d{1,3}$/, 'Region ids look like "r1".'), S.pigmentPaint).describe('Region id -> colour.'),
      baseRevision: S.baseRevision,
    },
    annotations: WRITE,
  }, guard('filling regions', async ({ id, itemIndex, fills, baseRevision }) => {
    const keys = Object.keys(fills);
    if (!keys.length) return fail('Give at least one region in "fills".');
    let piece = null;
    const result = await modify('pigment', id, baseRevision, doc => {
      const item = (doc.items || [])[itemIndex];
      if (!item || item.kind !== 'art') {
        const arts = (doc.items || []).map((it, i) => (it && it.kind === 'art' ? i : -1)).filter(i => i >= 0);
        throw new ToolkitError(`Item ${itemIndex} is not a coloring page. Coloring pages in this painting are at index ${arts.length ? arts.join(', ') : '(none; add one with add_coloring_page)'}.`);
      }
      piece = library.pieces.get(item.artId);
      if (!piece) throw new ToolkitError(`This painting uses a coloring page ("${item.artId}") that this server does not know.`);
      const known = new Set(piece.regions.map(r => r.id));
      const unknown = keys.filter(k => !known.has(k));
      if (unknown.length) throw new ToolkitError(`"${piece.name}" has no region ${unknown.join(', ')}. Its regions are ${[...known].join(', ')}.`);
      item.fills = { ...(item.fills || {}), ...fills };
    });
    if (result.tooLarge) return fail('The painting is over the 8 MB limit.');
    const item = result.doc.items[itemIndex];
    const blank = piece.regions.map(r => r.id).filter(r => !item.fills[r] || item.fills[r] === '#ffffff');
    return ok({ ...summary('pigment', result.saved, client.baseUrl()), itemIndex, filled: keys.length, stillWhite: blank });
  }));

  return server;
}

async function main() {
  const client = createClient();
  const problem = client.tokenProblem();
  if (problem) console.error('[toolkit-mcp] ' + problem + ' Tools will report this until it is fixed.');
  const server = createServer({ client });
  await server.connect(new StdioServerTransport());
  console.error(`[toolkit-mcp] ${VERSION} ready; Toolkit at ${(() => { try { return client.baseUrl(); } catch (e) { return e.message; } })()}`);
}

if (require.main === module) {
  main().catch(err => { console.error('[toolkit-mcp] failed to start:', err && err.message); process.exit(1); });
}

module.exports = { createServer, APPS };
