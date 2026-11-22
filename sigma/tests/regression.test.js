import test from 'node:test';
import assert from 'node:assert/strict';
import { state, baseNode, moveLayer, undo, redo, deleteSelected, commitNodeText } from '../public/js/editor/state.js';
import { buildSVG, rasterize } from '../public/js/editor/export.js';
import { buildPigmentSVG, placeImageNode, importFromImageVendor } from '../public/js/editor/imageimport.js';
import { requireRaster, requireDimensions, imageToPNG } from '../public/js/editor/raster.js';
import { createSaver } from '../public/js/editor/persistence.js';

const png = 'data:image/png;base64,YQ==';
test('Pigment raster import preserves image rotation and per-item opacity', () => {
  const svg = buildPigmentSVG({ canvas: { w: 100, h: 100, bg: 'transparent' }, items: [
    { kind: 'image', src: png, x: 10, y: 20, w: 30, h: 40, rotation: 45, opacity: 0.25 },
  ] });
  assert.match(svg, /opacity="0.25"/);
  assert.match(svg, /rotate\(45 25 40\)/);
});
function reset(nodes = []) {
  state.doc = { version: 1, artboard: { w: 200, h: 100, bg: 'transparent' }, nodes };
  state.selection = []; state.dirty = false;
}
function saver(overrides = {}) {
  const local = { doc: { artboard: { w: 100 }, nodes: [] }, dirty: true };
  const statuses = [], writes = [], retries = [];
  const save = createSaver({ state: local, thumbnail: async () => null,
    write: async body => writes.push(body), status: (...args) => statuses.push(args),
    retry: fn => retries.push(fn), signedOut: () => false, ...overrides });
  return { local, statuses, writes, retries, save };
}

test('layer reorder undo restores every layer and redo preserves stack', () => {
  reset(['a', 'b', 'c'].map(id => baseNode('rect', { id })));
  moveLayer('a', 'c', true);
  assert.deepEqual(state.doc.nodes.map(n => n.id), ['b', 'c', 'a']);
  undo(); assert.deepEqual(state.doc.nodes.map(n => n.id), ['a', 'b', 'c']);
  redo(); assert.deepEqual(state.doc.nodes.map(n => n.id), ['b', 'c', 'a']);
});
test('clearing existing text is undoable', () => {
  reset([baseNode('text', { id: 'text', text: 'Keep me' })]);
  state.selection = ['text'];
  commitNodeText('text', '');
  assert.equal(state.doc.nodes.length, 0);
  undo(); assert.equal(state.doc.nodes[0].text, 'Keep me');
});
test('delete preserves locked nodes even when selected through layers/groups', () => {
  reset([baseNode('rect', { id: 'locked', locked: true }), baseNode('rect', { id: 'free' })]);
  state.selection = ['locked', 'free']; deleteSelected();
  assert.deepEqual(state.doc.nodes.map(n => n.id), ['locked']);
  assert.deepEqual(state.selection, ['locked']);
});
test('selection SVG preserves z order independent of selection order and escapes text', () => {
  reset([baseNode('rect', { id: 'back', fill: '#ff0000' }), baseNode('text', { id: 'front', text: '<&"', fill: '#0000ff' })]);
  state.selection = ['front', 'back'];
  const svg = buildSVG('selection');
  assert.ok(svg.indexOf('#ff0000') < svg.indexOf('#0000ff'));
  assert.match(svg, /&lt;&amp;&quot;/);
});
test('artboard export retains strokes crossing the boundary', () => {
  reset([baseNode('line', { x: -2, y: 10, w: 0.01, h: 40, points: [[0, 0], [0, 40]], stroke: '#123456', strokeWidth: 10 })]);
  assert.match(buildSVG('artboard'), /#123456/);
});
test('oversized raster export rejects before any browser allocation', async () => {
  reset(); state.doc.artboard = { w: 8000, h: 8000, bg: '#ffffff' };
  await assert.rejects(rasterize('artboard', 4, 'image/png'), /too large/);
});
test('Pigment conversion preserves linear/radial gradients and zero-width outlines', () => {
  const gradient = grad => ({ grad, angle: 90, stops: [{ at: 0, color: '#ff0000' }, { at: 1, color: '#0000ff' }] });
  const svg = buildPigmentSVG({ canvas: { w: 200, h: 100 }, items: [
    { kind: 'region', points: [[0, 0], [50, 0], [0, 50]], fill: gradient('linear'), strokeWidth: 0 },
    { kind: 'stroke', points: [[10, 10], [90, 90]], color: gradient('radial'), size: 4 },
  ] });
  assert.match(svg, /<linearGradient/); assert.match(svg, /<radialGradient/);
  assert.match(svg, /stroke-width="0"/); assert.match(svg, /fill="url\(#sigma-import-grad-0\)"/);
  assert.match(svg, /stop-color="#0000ff"/);
});
test('missing art library and unsafe raster sources fail instead of silently dropping content', () => {
  assert.throws(() => buildPigmentSVG({ canvas: { w: 100, h: 100 }, items: [{ kind: 'art' }] }), /library/);
  for (const src of ['https://example.test/a.png', 'data:image/svg+xml;base64,YQ==', 'javascript:alert(1)']) {
    assert.throws(() => requireRaster(src), /embedded/);
    assert.throws(() => buildPigmentSVG({ canvas: { w: 100, h: 100 }, items: [{ kind: 'image', src }] }), /embedded/);
  }
  assert.equal(requireRaster(png), png);
});
test('dimension bounds reject invalid values before canvas allocation', () => {
  requireDimensions(1, 8000);
  for (const w of [0, -1, 8001, 1.5, NaN, Infinity]) assert.throws(() => requireDimensions(w, 100), /dimensions/);
});
test('local decoded SVG/image is normalized to PNG; invalid files do not place nodes', () => {
  const old = globalThis.document;
  let mime, drawn;
  globalThis.document = { createElement: () => ({ getContext: () => ({ drawImage: image => { drawn = image; } }),
    toDataURL: type => { mime = type; return png; } }) };
  try {
    const image = { naturalWidth: 123, naturalHeight: 99 };
    assert.equal(imageToPNG(image), png); assert.equal(mime, 'image/png'); assert.equal(drawn, image);
    assert.throws(() => imageToPNG({ naturalWidth: 9000, naturalHeight: 2 }), /dimensions/);
    reset(); assert.throws(() => placeImageNode('https://example.test/a.png', 100, 100, 'bad'), /embedded/);
    assert.equal(state.doc.nodes.length, 0);
    placeImageNode(png, 800, 400, 'safe');
    assert.equal(state.doc.nodes[0].src, png); assert.equal(state.doc.nodes[0].w, 200);
    undo(); assert.equal(state.doc.nodes.length, 0);
  } finally { globalThis.document = old; }
});
test('save keeps document dirty until a successful request and freezes sent content', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  let sent;
  const ctx = saver({ write: async body => { sent = body; await gate; } });
  const pending = ctx.save(); await Promise.resolve();
  assert.equal(ctx.local.dirty, true);
  ctx.local.doc.nodes.push({ id: 'later' });
  release(); await pending;
  assert.deepEqual(sent.document.nodes, []); assert.equal(ctx.local.dirty, true);
  assert.equal(ctx.statuses.at(-1)[0], 'Edited');
  await ctx.save(); assert.equal(ctx.local.dirty, false);
});
test('optional thumbnail failure still persists document', async () => {
  const ctx = saver({ thumbnail: async () => { throw new Error('decode'); } });
  await ctx.save(); assert.equal(ctx.writes.length, 1); assert.equal(ctx.local.dirty, false);
});
test('validation failures remain dirty without an endless retry loop; network errors retry', async () => {
  const ctx = saver({ write: async () => { throw Object.assign(new Error('invalid'), { status: 400 }); } });
  await ctx.save(); assert.equal(ctx.local.dirty, true); assert.equal(ctx.retries.length, 0);
  assert.match(ctx.statuses.at(-1)[0], /invalid/);
  const offline = saver({ write: async () => { throw new Error('offline'); } });
  await offline.save(); assert.equal(offline.local.dirty, true); assert.equal(offline.retries.length, 1);
});
test('queued saves serialize writes and persist newest edits', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const sent = []; let concurrent = 0, max = 0;
  const ctx = saver({ write: async body => {
    concurrent++; max = Math.max(max, concurrent); sent.push(body.document);
    if (sent.length === 1) await gate;
    concurrent--;
  } });
  const first = ctx.save(); await Promise.resolve();
  ctx.local.doc.nodes.push({ id: 'new' }); await ctx.save();
  release(); await first; await new Promise(resolve => setImmediate(resolve));
  assert.equal(max, 1); assert.equal(sent.length, 2); assert.equal(sent[1].nodes[0].id, 'new');
  assert.equal(ctx.local.dirty, false);
});

test('empty new text is removed; text changes survive undo and redo', () => {
  reset([baseNode('text', { id: 'empty', text: '' })]);
  commitNodeText('empty', '', true); assert.equal(state.doc.nodes.length, 0);
  reset([baseNode('text', { id: 't', text: 'old' })]);
  commitNodeText('t', 'new'); undo(); assert.equal(state.doc.nodes[0].text, 'old');
  redo(); assert.equal(state.doc.nodes[0].text, 'new');
});
test('oversized imports reject atomically without changing the document or selection', () => {
  reset(); state.selection = ['unchanged'];
  assert.throws(() => placeImageNode('data:image/png;base64,' + 'A'.repeat(8 * 1024 * 1024), 100, 100, 'large'), /size limit/);
  assert.equal(state.doc.nodes.length, 0); assert.deepEqual(state.selection, ['unchanged']); assert.equal(state.dirty, false);
});
test('ImageVendor composite preserves visible layer order/opacity; decode failures create no partial node', async () => {
  const originals = { document: globalThis.document, Image: globalThis.Image, fetch: globalThis.fetch };
  const draws = []; let decodeFails = false;
  const ctx = { globalAlpha: 1, fillRect() {}, drawImage(img) { draws.push([img.src, this.globalAlpha]); } };
  globalThis.document = { createElement: () => ({ getContext: () => ctx, toDataURL: () => png }) };
  globalThis.Image = class {
    set src(value) { this.value = value; queueMicrotask(() => decodeFails ? this.onerror() : this.onload()); }
    get src() { return this.value; }
  };
  const upper = 'data:image/webp;base64,Yg==';
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ image: { document: {
    canvas: { w: 100, h: 100, bg: 'transparent' }, layers: [
      { id: 'a', data: png, visible: true, opacity: 0.25 },
      { id: 'hidden', data: png, visible: false, opacity: 1 },
      { id: 'b', data: upper, visible: true, opacity: 0.75 },
    ],
  } } }) });
  try {
    reset(); await importFromImageVendor({ id: 'synthetic', name: 'mock' });
    assert.deepEqual(draws, [[png, 0.25], [upper, 0.75]]);
    assert.equal(state.doc.nodes[0].src, png);
    reset(); decodeFails = true;
    await assert.rejects(importFromImageVendor({ id: 'synthetic' }), /decoded/);
    assert.equal(state.doc.nodes.length, 0); assert.equal(state.dirty, false);
  } finally { Object.assign(globalThis, originals); }
});

test('conflict preserves local edits and blocks queued, manual and retry saves', async () => {
  let reject, count = 0;
  const ctx = saver({ write: () => { count++; return new Promise((resolve, fail) => { reject = fail; }); } });
  const pending = ctx.save(); await Promise.resolve();
  ctx.local.doc.nodes.push({ id: 'unsaved' }); await ctx.save();
  reject(Object.assign(new Error('stale'), { status: 409 })); await pending;
  await ctx.save(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(count, 1); assert.equal(ctx.local.dirty, true);
  assert.equal(ctx.local.doc.nodes[0].id, 'unsaved'); assert.equal(ctx.retries.length, 0);
  assert.match(ctx.statuses.at(-1)[0], /conflict.*Export.*reload/i);
});

test('Sigma rename and document saves serialize revision updates and block after conflict', async () => {
  const fs = await import('node:fs'); const vm = await import('node:vm');
  const source = fs.readFileSync(new URL('../public/js/editor/main.js', import.meta.url), 'utf8');
  const part = source.slice(source.indexOf('let writeQueue'), source.indexOf('const saveNow'));
  let finish; const calls = []; const local = { serverRevision: 2, dirty: true };
  const ctx = vm.createContext({ state: local, projectId: 'fixture', saveTimer: null, clearTimeout() {}, setSaveStatus() {},
    api: async (url, options) => { calls.push(options.body); if (calls.length === 1) await new Promise(resolve => { finish = resolve; }); return {project:{revision: calls.length + 2}}; } });
  vm.runInContext(part, ctx);
  const saving = vm.runInContext('writeProject({document:{nodes:[]}})', ctx);
  const rename = vm.runInContext('writeProject({name:"Renamed"})', ctx);
  await Promise.resolve(); assert.equal(calls.length, 1); finish(); await saving; await rename;
  assert.equal(calls[0].baseRevision, 2); assert.equal(calls[1].baseRevision, 3); assert.equal(local.serverRevision, 4);
  ctx.api = async () => { throw Object.assign(new Error('stale'), { status: 409 }); };
  await assert.rejects(vm.runInContext('writeProject({name:"Local name"})',ctx), {status:409});
  ctx.api = async () => { throw Error('must not write'); };
  await assert.rejects(vm.runInContext('writeProject({document:{nodes:[]}})',ctx), {status:409});
  assert.equal(local.saveConflict,true); assert.equal(local.dirty,true); assert.equal(local.serverRevision,4);
});
