// Regression tests for the browser-side save and layer-panel code of Pigment, ImageVendor
// and Sigma. The real source is sliced out of each app file and run in a vm sandbox with a
// small fake DOM, so no browser is needed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');
const strip = src => src.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s*\{[^}]*\};?/gm, '').replace(/\bexport (?=(?:async )?function|const|let)/g, '');
function section(source, start, end) {
  const a = source.indexOf(start);
  assert.ok(a >= 0, 'start marker: ' + start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(b > a, 'end marker: ' + end);
  return source.slice(a, b);
}
const httpError = (status, message) => Object.assign(new Error(message), { status });

// ---------------------------------------------------------------- Pigment / ImageVendor save errors
function pigmentSaver(apiImpl) {
  const timers = [], statuses = [];
  const ctx = vm.createContext({
    structuredClone, JSON, Promise, console,
    setTimeout(fn, ms) { timers.push([fn, ms]); return timers.length; }, clearTimeout() {},
    api: apiImpl, redirectIfSignedOut: () => false, setStatus: (t, c) => statuses.push([t, c]),
    generateThumbnail: async () => null, scheduleAutosave() {},
  });
  vm.runInContext('let paintingId="p1",documentReady=true,isSaving=false,saveQueued=false,editRevision=0,hasUnsavedEdits=false,autosaveTimer=null,paintingName="x",doc={canvas:{},items:[]};'
    + section(read('pigment/js/app.js'), 'let serverRevision = 0;', '// ─── TOOLS – POINTER HANDLING'), ctx);
  return { ctx, timers, statuses };
}
function imageVendorSaver(apiImpl, extra = '') {
  const timers = [], statuses = [], nodes = new Map();
  const node = () => ({ value: '', textContent: '', className: '', listeners: {}, addEventListener(n, f) { this.listeners[n] = f; } });
  const ctx = vm.createContext({
    JSON, Promise, console,
    setTimeout(fn, ms) { timers.push([fn, ms]); return timers.length; }, clearTimeout() {},
    api: apiImpl, redirectIfSignedOut: () => false,
    getCompositeCanvas: () => ({ width: 4, height: 4 }),
    document: { title: '', getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); }, createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,AA==' }) },
  });
  const state = strip(read('imagevendor/js/state.js'));
  const app = strip(section(read('imagevendor/js/app.js'), '// ─── AUTOSAVE', '// ─── BEFORE UNLOAD'));
  vm.runInContext(state + '\nlet restoringHistory=false; function setStatus(t,c){ statuses.push([t,c]); }\n' + app + '\n' + extra, ctx);
  ctx.statuses = statuses;
  return { ctx, timers, statuses, nodes };
}

for (const [name, make, setup] of [
  ['Pigment', pigmentSaver, ctx => {}],
  ['ImageVendor', apiImpl => imageVendorSaver(apiImpl), ctx => vm.runInContext('setImageId("i1");', ctx)],
]) {
  test(`${name}: a permanent save error shows the server message and is not retried`, async () => {
    const h = make(async () => { throw httpError(413, 'Storage quota exceeded. Delete unused projects.'); });
    setup(h.ctx);
    await h.ctx.doAutosave();
    const last = h.statuses.at(-1);
    assert.match(last[0], /Storage quota exceeded/, 'the server message reaches the user: ' + last[0]);
    assert.equal(last[1], 'error');
    assert.equal(h.timers.filter(([, ms]) => ms === 4000).length, 0, 'no pointless automatic retry');
  });
  test(`${name}: transient errors (network, 5xx, 429) still retry`, async () => {
    for (const err of [new TypeError('Failed to fetch'), httpError(503, 'Unavailable'), httpError(429, 'Slow down')]) {
      const h = make(async () => { throw err; });
      setup(h.ctx);
      await h.ctx.doAutosave();
      assert.match(h.statuses.at(-1)[0], /Save failed/);
      assert.equal(h.timers.filter(([, ms]) => ms === 4000).length, 1, String(err.status || err.message));
    }
  });
}

// ---------------------------------------------------------------- ImageVendor rename-only saves
test('ImageVendor: renaming sends only the name, without re-encoding layers; content edits still send everything', async () => {
  const bodies = [];
  const h = imageVendorSaver(async (url, opts) => { bodies.push(opts.body); return { image: { revision: 10 + bodies.length } }; });
  const c = h.ctx;
  let encodes = 0;
  vm.runInContext('setImageId("i1"); serverRevision = 5; doc.canvas = { w: 4, h: 4, bg: "#fff" }; doc.layers = [{ id: "l1", name: "Layer 1", visible: true, opacity: 1, data: "" }];', c);
  c.fakeOffscreen = { toDataURL() { encodes++; return 'data:image/png;base64,AA=='; } };
  vm.runInContext('layerCanvases.length = 0; layerCanvases.push({ id: "l1", offscreen: fakeOffscreen });', c);
  const input = h.nodes.get('image-name');
  const rename = value => { input.value = value; input.listeners.input(); };

  rename('Sunset');
  await c.doAutosave();
  assert.equal(bodies.length, 1);
  assert.deepEqual(Object.keys(bodies[0]).sort(), ['baseRevision', 'name']);
  assert.equal(bodies[0].name, 'Sunset'); assert.equal(bodies[0].baseRevision, 5);
  assert.equal(encodes, 0, 'no layer was re-encoded for a rename');
  assert.equal(vm.runInContext('serverRevision', c), 11, 'the new revision is tracked');

  vm.runInContext('scheduleAutosave();', c);                   // a real content edit
  await c.doAutosave();
  assert.ok(bodies[1].document && bodies[1].document.layers.length === 1, 'content edits send the document');
  assert.equal(bodies[1].name, 'Sunset'); assert.equal(encodes, 1);

  rename('Sunrise');                                           // rename after the content was saved
  await c.doAutosave();
  assert.deepEqual(Object.keys(bodies[2]).sort(), ['baseRevision', 'name']);

  vm.runInContext('scheduleAutosave();', c);                   // content edit, then rename before saving
  rename('Dawn');
  await c.doAutosave();
  assert.ok(bodies[3].document, 'a pending content edit is never dropped by a later rename');
});

// ---------------------------------------------------------------- ImageVendor layer panel
class El {
  constructor(tag, doc) { this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.parentNode = null; this.dataset = {}; this.attrs = {}; this.listeners = {}; this._classes = new Set(); this.style = {}; this.textContent = ''; this.value = ''; this.tabIndex = -1; this.title = ''; }
  get classList() { const s = this._classes; return { add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)), contains: c => s.has(c), toggle: (c, f) => (f ? s.add(c) : s.delete(c)) }; }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._classes].join(' '); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(n, f) { (this.listeners[n] ||= []).push(f); }
  dispatch(n, ev = {}) { const e = { target: this, preventDefault() {}, stopPropagation() {}, ...ev }; for (const f of this.listeners[n] || []) f(e); return e; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  set innerHTML(_) { this.children.forEach(c => this.doc.detach(c)); this.children = []; }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  closest(sel) { const m = /^\[data-([a-z-]+)\]$/.exec(sel); for (let x = this; x; x = x.parentNode) if (m && x.dataset && x.dataset[m[1].replace(/-(\w)/g, (_, c) => c.toUpperCase())] !== undefined) return x; return null; }
  querySelector(sel) { const cls = sel.slice(1); const walk = n => { for (const c of n.children) { if (c._classes.has(cls)) return c; const r = walk(c); if (r) return r; } return null; }; return walk(this); }
  replaceWith(n) { const p = this.parentNode; if (!p) return; const i = p.children.indexOf(this); this.doc.detach(this); p.children[i] = n; n.parentNode = p; }
  focus() { this.doc.activeElement = this; }
  select() {}
}
function panelHarness() {
  const doc = { activeElement: null, nodes: new Map(),
    detach(el) { if (el.contains(doc.activeElement) || el === doc.activeElement) doc.activeElement = doc.body; el.parentNode = null; },
    createElement(tag) { return new El(tag, doc); },
    getElementById(id) { if (!doc.nodes.has(id)) doc.nodes.set(id, new El('div', doc)); return doc.nodes.get(id); },
    querySelector: () => null, querySelectorAll: () => [] };
  doc.body = new El('body', doc); doc.activeElement = doc.body;
  const ctx = vm.createContext({ JSON, console, document: doc, Math });
  const app = read('imagevendor/js/app.js');
  vm.runInContext(strip(read('imagevendor/js/state.js')) + '\nfunction finishAdjustments(){} function pushHistory(){} function composite(){} function scheduleAutosave(){ edits++; } let edits=0;\n'
    + strip(section(app, 'function selectLayer', '// ─── LAYERS PANEL') + section(app, 'function refreshLayersPanel', "document.getElementById('add-layer-btn')")), ctx);
  vm.runInContext(`doc.canvas = { w: 4, h: 4, bg: '#fff' }; doc.layers = [{id:'l1',name:'First',visible:true,opacity:1,data:''},{id:'l2',name:'Second',visible:true,opacity:1,data:''}]; setActiveLayerId('l1'); refreshLayersPanel();`, ctx);
  const list = doc.getElementById('layers-list');
  const rowFor = id => list.children.find(r => r.dataset.layerId === id);
  return { ctx, doc, list, rowFor };
}

test('ImageVendor layer panel: selecting or toggling a layer keeps keyboard focus on the same control', () => {
  const h = panelHarness();
  const row = h.rowFor('l2');
  row.focus();
  row.dispatch('keydown', { key: 'Enter' });
  assert.ok(h.list.contains(h.doc.activeElement), 'focus stays inside the layer list');
  assert.equal(h.doc.activeElement.dataset.layerId, 'l2');
  assert.notEqual(h.doc.activeElement, row, 'the list was rebuilt');
  assert.equal(h.doc.activeElement.tabIndex, 0);

  const vis = h.rowFor('l2').querySelector('.layer-vis');
  vis.focus();
  vis.dispatch('click');
  const after = h.doc.activeElement;
  assert.ok(after.classList.contains('layer-vis'), 'focus returns to the visibility toggle');
  assert.equal(after.parentNode.dataset.layerId, 'l2');
});

test('ImageVendor layer panel: rename works from the keyboard (F2) and returns focus to the row', () => {
  const h = panelHarness();
  const row = h.rowFor('l2');
  row.focus();
  row.dispatch('keydown', { key: 'F2' });
  const input = h.rowFor('l2').querySelector('.layer-name-edit');
  assert.ok(input, 'F2 opens the inline name editor without a double-click');
  input.value = 'Shadows';
  input.dispatch('keydown', { key: 'Enter' });
  assert.equal(vm.runInContext("doc.layers.find(l => l.id === 'l2').name", h.ctx), 'Shadows');
  assert.equal(h.doc.activeElement.dataset.layerId, 'l2');
  assert.ok(h.list.contains(h.doc.activeElement) && h.doc.activeElement.tabIndex === 0, 'focus is on the (rebuilt) row');
});

// ---------------------------------------------------------------- Sigma saver
test('Sigma saver: serializes the document no more than needed, with unchanged behaviour', async () => {
  let stringifyCalls = 0;
  const counting = { parse: JSON.parse, stringify(...a) { stringifyCalls++; return JSON.stringify(...a); } };
  const ctx = vm.createContext({ JSON: counting, Promise, console });
  vm.runInContext(read('sigma/public/js/editor/persistence.js').replace(/\bexport /g, ''), ctx);
  const state = { doc: { nodes: [{ id: 1, name: 'a' }], z: undefined }, dirty: true, saveConflict: false };
  const writes = [], statuses = [];
  const save = ctx.createSaver({ state, thumbnail: async () => 'thumb', write: async body => { writes.push(body); }, status: (t, c) => statuses.push([t, c]), retry() {}, signedOut: () => false });
  await save();
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0].document)), { nodes: [{ id: 1, name: 'a' }] }, 'undefined fields are dropped exactly as before');
  assert.equal(writes[0].thumbnail, 'thumb');
  assert.equal(state.dirty, false);
  assert.equal(statuses.at(-1)[0], 'Saved');
  assert.ok(stringifyCalls <= 2, 'whole-document stringify calls per save: ' + stringifyCalls);

  // An edit made while the write is in flight stays dirty and a queued save runs afterwards.
  let release; const gate = new Promise(r => { release = r; });
  const sent = [];
  const save2 = ctx.createSaver({ state, thumbnail: async () => null, write: async body => { sent.push(body); if (sent.length === 1) await gate; }, status() {}, retry() {}, signedOut: () => false });
  state.dirty = true;
  const first = save2();
  await new Promise(r => setImmediate(r));
  state.doc.nodes.push({ id: 2 });
  const queued = save2();
  release();
  await first; await queued; await new Promise(r => setImmediate(r));
  assert.equal(sent.length, 2, 'the queued save ran');
  assert.equal(sent[1].document.nodes.length, 2);
  assert.equal(state.dirty, false);
});
