const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const source = fs.readFileSync(require('node:path').join(__dirname, '../js/raster.js'), 'utf8');
  const { assertRasterSource, assertRasterDimensions, compositeRasterDocument } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const png = 'data:image/png;base64,aGVsbG8=';
  for (const mime of ['png', 'jpeg', 'webp']) assert.equal(assertRasterSource(png.replace('png', mime)), png.replace('png', mime));
  for (const bad of ['https://example.invalid/a.png', '/image.png', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,', 'data:image/png;base64,!!!', null]) assert.throws(() => assertRasterSource(bad));
  assertRasterDimensions(1, 8000);
  for (const [w,h] of [[0,1],[1,8001],[1.5,2],['2',2],[NaN,2]]) assert.throws(() => assertRasterDimensions(w,h));
  let allocations = 0, decodes = 0;
  const draws = [];
  const ctx = {globalAlpha:1, fillRect(){}, drawImage(im){ draws.push([im.src,this.globalAlpha]); }};
  global.document = {createElement(){ allocations++; return {getContext:()=>ctx,toDataURL:()=>png}; }};
  global.Image = class { set src(value){ this._src=value; decodes++; queueMicrotask(()=>this.onload()); } get src(){return this._src;} };
  const layer = {id:'a',data:png,opacity:0.4};
  for (const doc of [
    {canvas:{w:0,h:2},layers:[layer]},
    {canvas:{w:2,h:2},layers:[layer,{...layer}]},
    {canvas:{w:2,h:2},layers:[{...layer,data:'https://example.invalid/a.png'}]},
    {canvas:{w:2,h:2},layers:[{...layer,opacity:2}]}
  ]) await assert.rejects(compositeRasterDocument(doc));
  assert.equal(allocations,0); assert.equal(decodes,0,'invalid documents must not decode/network-load sources');
  const out = await compositeRasterDocument({canvas:{w:2,h:2},layers:[layer,{id:'hidden',visible:false,data:png},{id:'top',data:png,opacity:0}]});
  assert.equal(out,png); assert.deepEqual(draws,[[png,0.4],[png,0]]); assert.equal(ctx.globalAlpha,1);
  global.Image = class {set src(value){queueMicrotask(()=>this.onerror());}};
  await assert.rejects(compositeRasterDocument({canvas:{w:2,h:2},layers:[layer]}), /could not be loaded/);
  console.log('PASS: raster whitelist, integer bounds, unique IDs, pre-decode rejection, compositing order/opacity, PNG output, decode failure');
})().catch(err=>{console.error(err);process.exitCode=1;});
