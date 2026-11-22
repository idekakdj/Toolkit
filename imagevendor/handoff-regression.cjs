// Lossless handoff checks use synthetic canvases and API calls only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'js/interop.js'), 'utf8')
  .replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '')
  .replace(/\bexport (?=(?:async )?function)/g, '');
async function check(mode, oversized = false) {
  const calls = [], status = [];
  const nodes = { 'export-mode': { value: mode }, 'export-go': { disabled: false } };
  const canvas = { width: 1701, height: 2, toDataURL(type) {
    assert.equal(type, 'image/png');
    return 'data:image/png;base64,' + (oversized ? 'A'.repeat(8 * 1024 * 1024) : 'YQ==');
  } };
  const context = vm.createContext({
    document: { getElementById: id => nodes[id], createElement() { throw Error('Handoff must not resize or matte the source'); } },
    getCompositeCanvas: () => canvas, getCanvasSize: () => ({ w: canvas.width, h: canvas.height }),
    getName: () => 'Alpha fixture', closeModal() {}, redirectIfSignedOut: () => false,
    setStatus: message => status.push(message),
    api: async (url, options) => { calls.push({ url, options }); return { project: { id: 'fixture' }, painting: { id: 'fixture' } }; },
  });
  vm.runInContext(source, context);
  await vm.runInContext('runExport()', context);
  assert.equal(nodes['export-go'].disabled, false);
  if (oversized) {
    assert.equal(calls.length, 0, 'Oversized transfer must not create an empty project');
    assert.match(status.at(-1), /8 MB transfer limit/);
    return;
  }
  assert.equal(calls.length, 2);
  const doc = calls[1].options.body.document;
  const size = doc.artboard || doc.canvas;
  const raster = (doc.nodes || doc.items)[0];
  assert.equal(size.bg, 'transparent');
  assert.equal(size.w, 1701); assert.equal(size.h, 2);
  assert.equal(raster.w, 1701); assert.equal(raster.h, 2);
  assert.match(raster.src, /^data:image\/png;base64,/);
}
(async () => {
  for (const mode of ['sigma', 'pigment']) { await check(mode); await check(mode, true); }
  console.log('PASS full-resolution transparent PNG handoffs and oversized transfer rejection before creation');
})().catch(err => { console.error(err); process.exitCode = 1; });
