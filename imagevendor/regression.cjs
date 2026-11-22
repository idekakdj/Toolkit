const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, 'js');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const clean = source => source.replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export\s*\{[^}]*\};?/gm, '').replace(/\bexport (?=(?:async )?function|const|let)/g, '');
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
function harness(extra = '') {
  const nodes = new Map();
  const calls = [];
  const timers = [];
  const ctx = {
    clearRect() {}, fillRect(...args) { calls.push(['fill',this.fillStyle,...args]); }, drawImage(...args) { calls.push(['draw',...args]); }, save() {}, restore() {}, beginPath() {}, rect() {}, ellipse() {}, clip() {},
    getImageData(x,y,w,h) { return new ImageData(new Uint8ClampedArray(w*h*4),w,h); },
    putImageData() {}, fillText(...args) { calls.push(['text', ...args]); }
  };
  function node(id = '') {
    return { id, value: id === 'brush-size' ? '12' : id === 'brush-opacity' ? '100' : '0', style: {}, dataset: {}, listeners: {}, classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
      setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; }, appendChild() {}, removeChild() {}, replaceWith() {}, focus() {}, select() {}, remove() { this.listeners.blur?.forEach(fn => fn()); },
      getContext() { return ctx; }, toDataURL() { return 'data:image/png;base64,Zml4dHVyZQ=='; },
      toBlob(callback, type) { calls.push(['encode',type]); callback(sandbox.failEncoding ? null : new Blob(['fixture'],{type})); }, click() { calls.push(['click']); },
      getBoundingClientRect() { return { left:0, top:0, width:10, height:10 }; }, clientWidth:100, clientHeight:100,
    };
  }
  class ImageData { constructor(data,w,h) { this.data=data; this.width=w; this.height=h; } }
  class Image { constructor() { this.naturalWidth=2; this.naturalHeight=2; } set src(value) { queueMicrotask(() => value === 'data:image/png;base64,YnJva2Vu' ? this.onerror?.() : this.onload?.()); } }
  const sandbox = { console, ImageData, Image, HTMLImageElement:Image, HTMLCanvasElement: class {}, Uint8ClampedArray, Uint8Array, URLSearchParams, Blob, URL, queueMicrotask,
    setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {}, requestAnimationFrame() { return 1; }, cancelAnimationFrame() {},
    document: { activeElement: null, body: node('body'), title:'', addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
      getElementById(id) { if (!nodes.has(id)) nodes.set(id,node(id)); return nodes.get(id); }, createElement(tag) { const n=node(tag); if(tag==='canvas') Object.setPrototypeOf(n,sandbox.HTMLCanvasElement.prototype); if(tag==='input') sandbox.lastInput=n; return n; } },
    window: { location: { search:'', href:'' }, addEventListener() {} },
    fetch: async () => { throw Error('Network forbidden in regression checks'); },
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(clean(read('state.js')) + '\n' + extra,context);
  return { context, nodes, calls, timers, run: code => vm.runInContext(code,context) };
}
function appHarness() {
  const stub = `function initTools() {} function onPointerDown() {} function onPointerMove() {} function onPointerUp() {} function onDblClick() {} function handleToolKey() {} function clearOverlay() {} function stopMarqueeAnimation() {} function startMarqueeAnimation() {} function clientToImage() {} function cloneImageData() {} function filterGrayscale() {} function filterInvert() {} function filterSepia() {} function filterBlur() {} function filterSharpen() {} function applyAdjustments() {} function ensureAdjustBase() { setAdjustBase({}); } function liveAdjust() {} function restoreAdjustBase() { clearAdjustBase(); }`;
  return harness(stub + '\n' + clean(read('resize.js')) + '\n' + clean(read('raster.js')) + '\n' + clean(read('history-budget.js')) + '\n' + clean(read('app.js')).replace(/\ninit\(\)\.catch[\s\S]*$/, ''));
}

test('resize independently scales all layers and one undo restores dimensions and metadata', async () => {
  const h=appHarness();
  h.run(`initDefaultDoc(4,2); const second=document.createElement('canvas'); second.width=4; second.height=2; doc.layers.push({id:'hidden',name:'Hidden',visible:false,opacity:0.25,data:''}); layerCanvases.push({id:'hidden',offscreen:second}); doc.canvas.bg='transparent'; setSelection({type:'rect',x:0,y:0,w:1,h:1}); setAdjustBase({}); const originals=layerCanvases.map(l=>l.offscreen); const metadata=JSON.stringify(doc.layers); resizeImage('8','6');`);
  assert.equal(h.run('undoStack.length'),1);
  assert.equal(h.run('JSON.stringify(doc.layers)===metadata'),true);
  assert.equal(h.run("doc.canvas.bg==='transparent' && selection===null && adjustBase===null"),true);
  assert.equal(h.run('layerCanvases.every((l,i)=>l.offscreen!==originals[i] && l.offscreen.width===8 && l.offscreen.height===6)'),true);
  for(const source of h.run('originals')) assert.ok(h.calls.some(c=>c[0]==='draw' && c[1]===source && c[4]===8 && c[5]===6));
  await h.run('undo()');
  assert.equal(h.run('doc.canvas.w'),4); assert.equal(h.run('doc.canvas.h'),2);
  assert.equal(h.run("doc.layers[1].id==='hidden' && !doc.layers[1].visible && doc.layers[1].opacity===0.25 && doc.canvas.bg==='transparent'"),true);
  await h.run('redo()');
  assert.equal(h.run('doc.canvas.w'),8); assert.equal(h.run('doc.canvas.h'),6);
});

test('resize rejects invalid dimensions, budget, allocation and concurrent history without edits', () => {
  const h=appHarness(); h.run('initDefaultDoc(4,2); const original=layerCanvases[0].offscreen; setAdjustBase({});');
  for(const value of ['0','8001','1.5','','1e2','-2',NaN,Infinity]) assert.throws(()=>h.run(`resizeImage(${JSON.stringify(value)},2)`));
  assert.throws(()=>h.run('resizeImage(8000,8000)'),/budget/);
  h.run(`const originalCreate=document.createElement; document.createElement=()=>({getContext(){return null;}});`);
  assert.throws(()=>h.run('resizeImage(8,6)'),/allocate/);
  h.run('document.createElement=originalCreate; restoringHistory=true;');
  assert.throws(()=>h.run('resizeImage(8,6)'),/undo\/redo/);
  assert.equal(h.run('doc.canvas.w===4 && doc.canvas.h===2 && layerCanvases[0].offscreen===original && undoStack.length===0 && adjustBase!==null'),true);
  h.run(`restoringHistory=false; resizeWidth.value='0'; document.getElementById('apply-resize').listeners.click[0]();`);
  assert.match(h.nodes.get('resize-error').textContent,/whole pixels/);
});

test('resize aspect ratio follows either dimension and unchanged size adds no history', () => {
  const h=appHarness(); h.run(`initDefaultDoc(4,2); document.getElementById('resize-aspect').checked=true; resizeWidth.value='10'; resizeWidth.listeners.input[0]();`);
  assert.equal(h.nodes.get('resize-height').value,5);
  h.run(`resizeHeight.value='3'; resizeHeight.listeners.input[0]();`);
  assert.equal(h.nodes.get('resize-width').value,6);
  assert.equal(h.run('resizeImage(4,2)'),false); assert.equal(h.run('undoStack.length'),0);
});

test('later layer allocation failure discards all prepared replacements', () => {
  const h=appHarness();
  h.run(`initDefaultDoc(4,2); const second=document.createElement('canvas'); second.width=4; second.height=2; layerCanvases.push({id:'second',offscreen:second}); const originals=layerCanvases.map(l=>l.offscreen); let allocations=0; const originalCreate=document.createElement; document.createElement=tag=>{if(++allocations===2) throw Error('Allocation failed'); return originalCreate(tag);};`);
  assert.throws(()=>h.run('resizeImage(8,6)'),/Allocation failed/);
  assert.equal(h.run('layerCanvases.every((l,i)=>l.offscreen===originals[i]) && doc.canvas.w===4 && doc.canvas.h===2 && undoStack.length===0'),true);
});
test('blur preserves color at transparent edges', () => {
  const h=harness(clean(read('adjust.js')));
  const result=h.run(`const pixels = new ImageData(new Uint8ClampedArray([255,0,0,255,0,0,0,0]),2,1); filterBlur(pixels); Array.from(pixels.data)`);
  assert.deepEqual(Array.from(result),[255,0,0,128,255,0,0,128]);
});
test('sharpen does not brighten constant image borders', () => {
  const h=harness(clean(read('adjust.js')));
  assert.deepEqual(Array.from(h.run(`const pixels = new ImageData(new Uint8ClampedArray([70,80,90,255]),1,1); filterSharpen(pixels); Array.from(pixels.data)`)),[70,80,90,255]);
});
test('text commits once, records undo, and Escape cancels', () => {
  const h=harness(clean(read('adjust.js')) + '\n' + clean(read('tools.js')));
  h.run(`let historyCount=0, saveCount=0; const canvas=document.createElement('canvas'); doc.canvas.w=10; doc.canvas.h=10; layerCanvases.push({id:'a',offscreen:canvas}); setActiveLayerId('a'); initTools(()=>{},()=>historyCount++,()=>saveCount++,()=>{},canvas,canvas); showTextInput(1,1); lastInput.value='Hello'; lastInput.listeners.keydown[0]({key:'Enter',preventDefault(){},stopPropagation(){}});`);
  assert.equal(h.run('historyCount'),1); assert.equal(h.run('saveCount'),1); assert.equal(h.calls.filter(c=>c[0]==='text').length,1);
  h.run(`showTextInput(1,1); lastInput.value='Cancel'; lastInput.listeners.keydown[0]({key:'Escape',stopPropagation(){}});`);
  assert.equal(h.calls.filter(c=>c[0]==='text').length,1);
});
test('save completing after a newer edit keeps dirty state and queues another save', async () => {
  const h=appHarness();
  h.run(`initDefaultDoc(2,2); setImageId('fixture'); let finish; api=()=>new Promise(resolve=>finish=resolve); generateThumbnail=async()=>null; scheduleAutosave();`);
  const saving=h.run('doAutosave()');
  await Promise.resolve(); await Promise.resolve();
  h.run('scheduleAutosave(); finish({});');
  await saving;
  assert.equal(h.run('hasUnsavedEdits'),true);
  assert.notEqual(h.nodes.get('save-status').textContent,'Saved');
  h.run('api=async()=>({});'); await h.run('doAutosave()');
  assert.equal(h.run('hasUnsavedEdits'),false);
});
test('undo restores active layer atomically and overlapping undo is ignored', async () => {
  const h=appHarness();
  h.run(`initDefaultDoc(2,2); const originalId=activeLayerId; pushHistory(); const newId='new'; doc.layers.push({id:newId,name:'New',visible:true,opacity:1}); layerCanvases.push({id:newId,offscreen:document.createElement('canvas')}); setActiveLayerId(newId);`);
  await Promise.all([h.run('undo()'),h.run('undo()')]);
  assert.equal(h.run('activeLayerId===originalId'),true);
  assert.equal(h.run('doc.layers.length'),1);
  assert.equal(h.run('redoStack.length'),1);
  assert.equal(h.run('document.body.inert'),false);
});
test('failed saved-layer decode cannot overwrite the original image', async () => {
  const h=appHarness();
  h.context.console={...console,error(){}};
  h.run(`window.location.search='?id=protected-fixture'; api=async()=>({image:{name:'Fixture',document:{canvas:{w:2,h:2,bg:'transparent'},layers:[{id:'a',data:'data:image/png;base64,YnJva2Vu'}]}}});`);
  await h.run('init()');
  assert.equal(h.run('imageId'),null);
  assert.match(h.nodes.get('save-status').textContent,/Load failed/);
  h.run(`api=()=>{throw Error('must not save')};`); await h.run('doAutosave()');
});
test('adjustment history is captured before preview and Apply adds no duplicate snapshot', () => {
  const h=appHarness(); h.run('initDefaultDoc(2,2);');
  h.nodes.get('adjust-brightness').listeners.input[0]();
  assert.equal(h.run('undoStack.length'),1);
  h.nodes.get('apply-adjust').listeners.click[0]();
  assert.equal(h.run('undoStack.length'),1); assert.equal(h.run('adjustBase'),null);
});
test('export success re-enables button, bounds destination name, and writes matching document', async () => {
  const stub=`async function api(path,options){ requests.push({path,options}); return {project:{id:'fixture'}}; } function redirectIfSignedOut(){return false;} function getName(){return 'N'.repeat(80);} function getCanvasSize(){return {w:2,h:2};} function getCompositeCanvas(){return document.createElement('canvas');} function addImageLayer(){} function setStatus(){} function closeModal(){} const requests=[];`;
  const h=harness(stub+'\n'+clean(read('interop.js')));
  h.context.document.getElementById('export-mode').value='sigma';
  await h.run('runExport()');
  assert.equal(h.nodes.get('export-go').disabled,false);
  assert.ok(h.run('requests[0].options.body.name.length')<=80);
  assert.equal(h.run('requests[1].options.body.document.nodes[0].type'),'image');
});
test('document validation rejects fractional dimensions, duplicate IDs, remote and SVG raster sources', () => {
  const h=harness(clean(read('raster.js')));
  h.run(`const fixture={canvas:{w:2,h:2},layers:[{id:'a',name:'Layer',data:'data:image/png;base64,Zml4dHVyZQ==',opacity:1}]};`);
  assert.equal(h.run('validateImageDocument(fixture)===fixture'),true);
  for (const change of ["bad.canvas.w=1.5", "bad.layers.push({...bad.layers[0]})", "bad.layers[0].data='https://example.com/image.png'", "bad.layers[0].data='data:image/svg+xml;base64,PHN2Zz4='", "bad.canvas.h=8001"]) {
    assert.throws(()=>h.run(`{const bad=JSON.parse(JSON.stringify(fixture)); ${change}; validateImageDocument(bad);}`));
  }
});
test('file-style import normalizes an image element to embedded PNG and tainted import makes no mutation', () => {
  const h=appHarness(); h.run('initDefaultDoc(2,2); addImageLayer(new Image(), "Imported");');
  assert.equal(h.run('doc.layers.length'),2);
  assert.match(h.run('JSON.parse(makeSnapshot()).layers.at(-1).data'),/^data:image\/png;base64,/);
  const originalCreate=h.context.document.createElement;
  h.context.document.createElement=tag=>{const n=originalCreate(tag); if(tag==='canvas') n.toDataURL=()=>{throw Error('tainted');}; return n;};
  assert.throws(()=>h.run('addImageLayer(new Image(), "Unsafe")'),/tainted/);
  assert.equal(h.run('doc.layers.length'),2);
});
test('JPEG download flattens white before encoding and null encoding retains the dialog', async () => {
  const stub=`function getName(){return 'Fixture';} function getCompositeCanvas(){const c=document.createElement('canvas');c.width=2;c.height=2;return c;} let closed=0; function closeModal(){closed++;} function setStatus(text){document.getElementById('save-status').textContent=text;}`;
  const h=harness(stub+'\n'+clean(read('interop.js')));
  h.context.document.getElementById('export-mode').value='jpeg';
  await h.run('runExport()');
  const fill=h.calls.findIndex(c=>c[0]==='fill' && c[1]==='#ffffff');
  const encode=h.calls.findIndex(c=>c[0]==='encode' && c[1]==='image/jpeg');
  assert.ok(fill>=0 && encode>fill); assert.equal(h.run('closed'),1);
  h.context.failEncoding=true;
  await h.run('runExport()');
  assert.equal(h.run('closed'),1); assert.equal(h.nodes.get('export-go').disabled,false);
  assert.match(h.nodes.get('save-status').textContent,/encoding failed/);
});
test('layer opacity gesture captures one pre-edit undo snapshot', async () => {
  const h=appHarness(); h.run('initDefaultDoc(2,2);');
  const slider=h.nodes.get('layer-opacity');
  const event={target:{value:'50',closest(){return null;}}};
  slider.listeners.input[0](event); event.target.value='25'; slider.listeners.input[0](event); slider.listeners.change[0]();
  assert.equal(h.run('undoStack.length'),1); await h.run('undo()');
  assert.equal(h.run('doc.layers[0].opacity'),1);
});
test('Pigment raster serializer preserves rotation, opacity and zero-width outlines', async () => {
  const h=harness(clean(read('interop.js')));
  const svg=await h.run("pigmentToSVG({canvas:{w:100,h:100,bg:'transparent'},items:[{kind:'image',src:'data:image/png;base64,YQ==',x:10,y:20,w:30,h:40,rotation:45,opacity:0.25},{kind:'region',points:[[0,0],[1,1]],fill:'#ffffff',stroke:'#000000',strokeWidth:0,opacity:0.5}]})");
  assert.match(svg,/opacity="0.25"/); assert.match(svg,/rotate\(45 25 40\)/); assert.match(svg,/stroke-width="0"/);
});
test('missing clipart fails visibly instead of dropping imported artwork', () => {
  const h=harness(clean(read('interop.js')));
  assert.throws(()=>h.run("sigmaNodeSVG({type:'clipart',clipartId:'missing'},null)"),/clipart library/);
  assert.throws(()=>h.run("sigmaNodeSVG({type:'clipart',clipartId:'missing'},{getClipart(){return null;}})"),/Unknown Sigma clipart/);
});

test('autosave sends acknowledged revisions and conflict blocks all subsequent saves', async () => {
  const h = appHarness();
  h.run(`initDefaultDoc(2,2); setImageId('fixture'); serverRevision=7; let bodies=[]; api=async(url,options)=>{bodies.push(options.body);return {image:{revision:8}};}; generateThumbnail=async()=>null; scheduleAutosave();`);
  await h.run('doAutosave()');
  assert.equal(h.run('bodies[0].baseRevision'),7); assert.equal(h.run('serverRevision'),8);
  h.run(`let rejectSave; api=(url,options)=>{bodies.push(options.body);return new Promise((resolve,reject)=>rejectSave=reject);}; scheduleAutosave();`);
  const pending=h.run('doAutosave()'); await Promise.resolve(); await Promise.resolve();
  h.run(`doc.layers[0].name='Local edit'; scheduleAutosave();`); await h.run('doAutosave()');
  h.run(`rejectSave(Object.assign(new Error('stale'),{status:409}));`); await pending;
  const timers=h.timers.length;
  h.run('scheduleAutosave()'); await h.run('doAutosave(true)');
  assert.equal(h.run('bodies.length'),2); assert.equal(h.run('bodies[1].baseRevision'),8);
  assert.equal(h.run('hasUnsavedEdits'),true); assert.equal(h.run('doc.layers[0].name'),'Local edit');
  assert.equal(h.timers.length,timers); assert.match(h.nodes.get('save-status').textContent,/conflict.*Export.*reload/i);
});

(async()=> { for(const [name,fn] of tests){ await fn(); console.log('PASS '+name); } console.log(`${tests.length} regression checks passed; all data and API calls are synthetic.`); })().catch(err=>{console.error(err);process.exitCode=1;});

