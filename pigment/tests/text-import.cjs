const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');

(async () => {
  let allocations = 0, history = 0, decodeFailure = false, status;
  const blobs = [], revoked = [], draws = [], labels = [];
  const png = 'data:image/png;base64,aGVsbG8=';
  class Element {
    constructor(tag) { this.tag = tag; this.style = {}; this.children = []; this.attrs = {}; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    appendChild(child) { this.children.push(child); }
    addEventListener(event, fn) { this.click = fn; }
    remove() { this.removed = true; }
    getBBox() { labels.push(this); return { x: -6, y: -2, width: 112, height: 65 }; }
  }
  const current = { canvas: { w: 300, h: 200 }, items: [] };
  const base = { type: 'text', x: 10, y: 20, w: 100, h: 60, fontSize: 24, fontWeight: 700,
    fontFamily: 'Arial', fill: '#123456', align: 'center', text: '<script>&"\'\n\nlast', rotation: 37, opacity: .35 };
  let nodes = [];
  const context = vm.createContext({ TextEncoder, CSS: { supports: (k, v) => /^#[0-9a-f]{6}$/i.test(v) },
    Blob: class { constructor(parts) { this.parts = parts; blobs.push(parts.join('')); } },
    URL: { createObjectURL: () => 'blob:synthetic', revokeObjectURL: url => revoked.push(url) },
    Image: class { set src(value) { queueMicrotask(() => decodeFailure ? this.onerror(new Error('decode failed')) : this.onload()); } },
    document: { body: new Element('body'), createElementNS: (ns, tag) => new Element(tag),
      createElement(tag) {
        if (tag !== 'canvas') return new Element(tag);
        allocations++;
        return { getContext: () => ({ drawImage: (...args) => draws.push(args), fillRect() { throw Error('White matte'); } }), toDataURL: () => png };
      } },
    api: async url => url === '/api/projects' ? [{ id: 'synthetic' }] : { document: { nodes } },
    getDoc: () => current, pushHistory: () => history++, reRenderAndSave() {}, closeModal() {},
    setStatus: value => { status = value; }, redirectIfSignedOut: () => false,
  });
  vm.runInContext(read('raster.js').replace(/export /g, '') + read('import-limit.js').replace(/export /g, '') +
    read('interop.js').replace(/^import\s[\s\S]*?;/gm, '').replace(/export /g, ''), context);
  const grid = new Element('grid');
  nodes = [{ type: 'rect', x: 0, y: 0, w: 5, h: 5 }, base, { ...base, visible: false },
    { type: 'rect', x: 0, y: 0, w: 7, h: 7 }];
  await context.listSigmaProjects(grid);
  await grid.children[0].click();
  assert.equal(history, 1);
  assert.deepEqual(current.items.map(n => n.kind), ['region', 'image', 'region']);
  const item = current.items[1];
  assert.equal(item.src, png); assert.equal(item.rotation, 37); assert.equal(item.opacity, .35);
  assert.equal(item.x + item.w / 2, base.x + base.w / 2);
  assert.equal(item.y + item.h / 2, base.y + base.h / 2);
  assert.match(status, /1 flattened text image\(s\), not editable/);
  assert.match(blobs[0], /&lt;script&gt;&amp;&quot;&apos;/);
  assert.ok(!blobs[0].includes('<script>'));
  assert.equal(labels[0].children[0].textContent, '<script>&"\'');
  assert.equal(labels[0].children[1].textContent, ' ');
  assert.equal(labels[0].children[2].attrs.y, '81.6');
  assert.equal(labels[0].attrs['font-weight'], '700');
  for (const [align, anchor, x] of [['left', 'start', '0'], ['center', 'middle', '50'], ['right', 'end', '100']]) {
    await context.sigmaTextToItem({ ...base, align }, { pixels: 0, bytes: 0 });
    assert.equal(labels.at(-1).children[0].attrs['text-anchor'], anchor);
    assert.equal(labels.at(-1).children[0].attrs.x, x);
  }
  const before = JSON.stringify(current), count = allocations;
  for (const bad of [{ w: 9000 }, { fontSize: Infinity }, { text: 'x'.repeat(65537) },
    { fill: 'url(https://example.invalid)' }, { opacity: 2 }, { rotation: NaN }]) {
    await assert.rejects(context.sigmaTextToItem({ ...base, ...bad }, { pixels: 0, bytes: 0 }));
  }
  assert.equal(allocations, count, 'bad text must reject before raster allocation');
  await assert.rejects(context.sigmaTextToItem({ ...base, w: 8000, h: 8000 }, { pixels: 0, bytes: 0 }), /pixel budget|dimensions/);
  assert.equal(allocations, count);
  decodeFailure = true;
  await grid.children[0].click();
  assert.equal(JSON.stringify(current), before, 'decode failure must reject all additions');
  assert.equal(history, 1); assert.equal(status, 'Import failed');
  assert.equal(revoked.length, blobs.length, 'all image URLs must be revoked');
  decodeFailure = false;
  await context.svgImageToCanvas('<svg xmlns="http://www.w3.org/2000/svg"/>', 2, 2);
  await assert.rejects(async () => context.svgImageToCanvas('<svg/>', 8000, 8000), /pixel limit/);
  assert.ok(draws.length > 0);
  console.log('PASS: Sigma text semantics, XML escaping, stacking, rotation center, opacity, budgets, atomic decode rejection, transparent raster export');
})().catch(err => { console.error(err); process.exitCode = 1; });
