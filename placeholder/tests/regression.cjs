const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const context = vm.createContext({ window: {}, Blob, File, TextDecoder, Uint8Array, ArrayBuffer, DataView, btoa, console });
vm.runInContext(read('js/converters.js'), context);
const engine = context.window.PlaceholderEngine;
const convert = async (text, source, target) => {
  const file = new File([text], 'fixture.' + source);
  const det = await engine.detectFile(file);
  return engine.getConversions(det).find(c => c.id === target).run(file, det, {}).then(b => b.text());
};
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log('PASS ' + name); }
(async () => {
  await check('Binary control bytes are not classified as text', async () => {
    assert.equal((await engine.detectFile(new File([new Uint8Array([0, 1, 2, 65])], 'fixture.bin'))).id, 'binary');
  });
  await check('CSV BOM, quoted newlines and escaped quotes survive', async () => {
    assert.deepEqual(JSON.parse(await convert('\uFEFFname,note\r\nAda,"line 1\nline ""2"""', 'csv', 'json')), [{ name: 'Ada', note: 'line 1\nline "2"' }]);
  });
  await check('CSV whitespace and quoted empty rows survive', async () => {
    assert.equal(await convert('h\n""\n   \n', 'csv', 'tsv'), 'h\r\n\r\n   ');
    assert.equal(await convert('""', 'csv', 'tsv'), '');
  });
  await check('CSV duplicate columns, excess fields and unclosed quotes reject instead of losing data', async () => {
    await assert.rejects(convert('a,a\n1,2', 'csv', 'json'), /unique/);
    await assert.rejects(convert('a\n1,2', 'csv', 'json'), /more fields/);
    await assert.rejects(convert('a\n"unfinished', 'csv', 'tsv'), /Unclosed/);
  });
  await check('CSV prototype-named columns preserve values', async () => {
    const out = JSON.parse(await convert('__proto__,constructor\nx,y', 'csv', 'json'));
    assert.equal(out[0].__proto__, 'x'); assert.equal(out[0].constructor, 'y');
  });
  await check('JSON BOM works and XML arrays have one root, including empty arrays', async () => {
    assert.equal(await convert('\uFEFF{"a":1}', 'json', 'json-min'), '{"a":1}');
    const xml = await convert('[1,2]', 'json', 'xml');
    assert.equal((xml.match(/<root>/g) || []).length, 1); assert.match(xml, /<item>1<\/item>/);
    assert.match(await convert('[]', 'json', 'xml'), /<root>[\s\S]*<\/root>/);
    await assert.rejects(convert('{"invalid key":1}', 'json', 'xml'), /XML element/);
  });
  await check('Mixed JSON object rows reject clearly', async () => {
    await assert.rejects(convert('[{"a":1},null]', 'json', 'csv'), /all be objects/);
  });
  await check('Raw Base64 preserves arbitrary bytes', async () => {
    assert.equal(await convert('\u0000abc', 'bin', 'base64'), 'AGFiYw==');
  });
  await check('Pigment embedded images and ImageVendor layer visibility/order/opacity survive', async () => {
    const c = vm.createContext({ window: {}, document: { readyState: 'loading', addEventListener() {} } });
    // Test the private serializers without introducing production test globals.
    vm.runInContext(read('js/design-import.js').replace('  /* ---------------- wire the dropzone buttons ---------------- */', '  window.test = { pigmentToSVG, imageVendorToSVG };\n  /* ---------------- wire the dropzone buttons ---------------- */'), c);
    const svg = await c.window.test.pigmentToSVG({ canvas: { w: 20, h: 10, bg: 'white' }, items: [{ kind: 'image', src: 'data:image/png;base64,AAAA', x: 2, y: 3, w: 4, h: 5, opacity: 0.25, rotation: 45 }] });
    assert.match(svg, /<image href="data:image\/png;base64,AAAA" x="2" y="3" width="4" height="5"/);
    assert.match(svg, /opacity="0.25"/); assert.match(svg, /rotate\(45 4 5.5\)/);
    const layers = c.window.test.imageVendorToSVG({ canvas: { w: 20, h: 10, bg: 'transparent' }, layers: [{ id: 'a', data: 'data:image/png;base64,Ym90dG9t', opacity: 0 }, { id: 'b', data: 'data:image/png;base64,aGlkZGVu', visible: false }, { id: 'c', data: 'data:image/webp;base64,dG9w', opacity: 0.5 }] });
    for (const src of ['https://example.invalid/a.png', 'data:image/svg+xml;base64,AAAA', 'data:image/gif;base64,AAAA']) {
      await assert.rejects(c.window.test.pigmentToSVG({ canvas: { w: 20, h: 10 }, items: [{ kind: 'image', src }] }), /embedded PNG/);
      assert.throws(() => c.window.test.imageVendorToSVG({ canvas: { w: 20, h: 10 }, layers: [{ id: 'a', data: src }] }), /embedded PNG/);
    }
    for (const w of [0, 8001, 1.5, '20']) assert.throws(() => c.window.test.imageVendorToSVG({ canvas: { w, h: 10 }, layers: [] }), /dimensions/);
    assert.throws(() => c.window.test.imageVendorToSVG({ canvas: { w: 20, h: 10 }, layers: [{ id: 'a' }, { id: 'a' }] }), /unique/);
    assert.ok(layers.indexOf('Ym90dG9t') < layers.indexOf('dG9w')); assert.ok(!layers.includes('aGlkZGVu')); assert.match(layers, /opacity="0"/); assert.match(layers, /opacity="0.5"/);
  });
  await check('Converter scripts defer behind CDN libraries and errors are outside hidden workspace', async () => {
    const html = read('convert.html');
    for (const name of ['converters', 'convert-page', 'design-import']) assert.ok(html.includes('<script defer src="js/' + name + '.js">'));
    assert.ok(html.indexOf('id="errorBox"') > html.indexOf('<!-- Step 3: result -->') - 150);
  });
  console.log(`${checks} regression groups passed`);
})().catch(err => { console.error(err); process.exitCode = 1; });
