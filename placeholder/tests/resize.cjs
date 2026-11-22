const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), assert = require('node:assert/strict');
const canvases = [], actions = [], revoked = [];
const context = vm.createContext({ window: {}, Blob, File, TextDecoder, Uint8Array, ArrayBuffer, DataView, btoa,
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL: url => revoked.push(url) },
  Image: class { constructor() { this.naturalWidth = 400; this.naturalHeight = 200; } async decode() {} },
  document: { createElement() {
    const canvas = { width: 1, height: 1, getContext: () => ({ fillRect: (...args) => actions.push(['fill', ...args]), drawImage: (...args) => actions.push(['draw', ...args]) }),
      toDataURL: type => 'data:' + type + ';base64,YQ==', toBlob: (callback, type) => callback(new Blob(['test'], { type })) };
    canvases.push(canvas); return canvas;
  } },
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/converters.js'), 'utf8'), context);
const engine = context.window.PlaceholderEngine;
const det = { id: 'png', category: 'image', label: 'PNG image' };
async function convert(opts = {}, type = 'png') {
  const conv = engine.getConversions(det).find(c => c.id === type);
  assert.ok(conv.resize); await conv.run(new File(['fixture'], 'fixture.png'), det, { quality: .9, ...opts });
  return canvases.at(-1);
}
(async () => {
  let c = await convert({ width: 100 }); assert.equal(c.width, 100); assert.equal(c.height, 50);
  c = await convert({ height: 25 }); assert.equal(c.width, 50); assert.equal(c.height, 25);
  c = await convert({ width: 100, height: 100 }); assert.equal(c.width, 100); assert.equal(c.height, 50);
  c = await convert({ width: 100, height: 100, keepAspect: false }); assert.equal(c.width, 100); assert.equal(c.height, 100);
  c = await convert(); assert.equal(c.width, 400); assert.equal(c.height, 200);
  assert.equal(actions.filter(a => a[0] === 'fill').length, 0, 'PNG keeps alpha');
  await convert({ width: 20 }, 'jpeg'); assert.ok(actions.some(a => a[0] === 'fill' && a[3] === 20));
  for (const opts of [{ width: 0 }, { height: 1.5 }, { width: NaN }, { width: '100' }, { width: 8001 }, { width: 8000, height: 8000, keepAspect: false }]) {
    actions.length = 0;
    await assert.rejects(convert(opts), /dimensions|size limit/);
    assert.equal(actions.length, 0, 'Invalid geometry rejected before drawing');
  }
  assert.equal(revoked.length, 12);
  console.log('PASS image conversion resizing: aspect fit, exact dimensions, original size, alpha/JPEG matte, size validation and URL cleanup');
})().catch(err => { console.error(err); process.exitCode = 1; });
