const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('pigment/js/app.js', 'utf8');
const interop = fs.readFileSync('pigment/js/interop.js', 'utf8');
function section(source, start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
const conversion = section(interop, 'function rotatePoint', '// ─── SVG RENDERING HELPERS') + section(interop, 'export function convertNode', '// ─── SIGMA CLIPART').replace('export ', '');
const context = vm.createContext({}); vm.runInContext(conversion, context);
const node = {type:'rect', x:10,y:20,w:30,h:40,fill:'none',stroke:'#123456',strokeWidth:0,opacity:0.3};
const region = context.convertNode(node);
assert.equal(region.fill, 'none'); assert.equal(region.stroke, '#123456'); assert.equal(region.strokeWidth, 0); assert.equal(region.opacity, 0.3);
const line = context.convertNode({type:'line',x:5,y:7,w:100,h:0,points:[[0,0],[100,0]],stroke:'#abcdef',strokeWidth:0});
assert.equal(line.size, 0); assert.deepEqual(JSON.parse(JSON.stringify(line.points)), [[5,7],[105,7]]);
const rotated = context.convertNode({...node,rotation:90});
assert.ok(Math.abs(rotated.points[0][0]-45)<1e-8); assert.ok(Math.abs(rotated.points[0][1]-25)<1e-8);
let thumbnailResolve, requestResolve, payload;
const statuses = [];
const saveContext = vm.createContext({ structuredClone, clearTimeout(){}, setTimeout(){return 1;},
  generateThumbnail:()=>new Promise(resolve=>{thumbnailResolve=resolve;}),
  api:async(path,options)=>{payload=options.body; await new Promise(resolve=>{requestResolve=resolve;});},
  setStatus:(text)=>statuses.push(text), redirectIfSignedOut:()=>false,
});
vm.runInContext(`let paintingId='synthetic', documentReady=true, isSaving=false, saveQueued=false, hasUnsavedEdits=true, editRevision=1, paintingName='Fixture', doc={canvas:{w:100,h:100},items:[]}; let autosaveTimer; function scheduleAutosave(){hasUnsavedEdits=true;editRevision++;} ` + section(app, 'let serverRevision', '// ─── TOOLS'), saveContext);
(async()=>{
  const saving = vm.runInContext('doAutosave()',saveContext);
  vm.runInContext("doc.items.push({kind:'stroke'}); editRevision++;", saveContext);
  thumbnailResolve(null); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(payload.document.items.length,0,'save uses an immutable snapshot');
  requestResolve(); await saving;
  assert.equal(vm.runInContext('hasUnsavedEdits',saveContext),true,'edits made during save stay dirty');
  assert.ok(!statuses.includes('Saved'),'stale save cannot report Saved');

  vm.runInContext("serverRevision=4; api=async(path,options)=>{payload=options.body;return {painting:{revision:5}};}; generateThumbnail=async()=>null;",saveContext);
  await vm.runInContext('doAutosave()',saveContext);
  assert.equal(vm.runInContext('payload.baseRevision',saveContext),4); assert.equal(vm.runInContext('serverRevision',saveContext),5);
  vm.runInContext("let rejectSave, writes=0; api=()=>{writes++; return new Promise((resolve,reject)=>rejectSave=reject);}; hasUnsavedEdits=true;",saveContext);
  const conflicting=vm.runInContext('doAutosave()',saveContext); await Promise.resolve();
  vm.runInContext("doc.items.push({kind:'local'}); editRevision++;",saveContext);
  await vm.runInContext('doAutosave()',saveContext);
  vm.runInContext("rejectSave(Object.assign(new Error('stale'),{status:409}));",saveContext); await conflicting;
  await vm.runInContext('doAutosave(true)',saveContext);
  assert.equal(vm.runInContext('writes',saveContext),1);
  assert.equal(vm.runInContext('hasUnsavedEdits && saveConflict && !saveQueued',saveContext),true);
  assert.equal(vm.runInContext('doc.items.at(-1).kind',saveContext),'local');
  assert.match(statuses.at(-1),/conflict.*Export.*reload/i);

  let scheduled=0;
  saveContext.setTimeout=()=>{scheduled++;return 1;};
  vm.runInContext(section(app,'function scheduleAutosave()', 'async function generateThumbnail()'),saveContext);
  vm.runInContext('scheduleAutosave()',saveContext);
  assert.equal(scheduled,0,'edits after conflict cannot queue blind saves');
  assert.match(statuses.at(-1),/conflict.*reload/i);
  const validation=app.split('\n').find(line=>line.includes("throw new Error('Invalid painting document')"));
  const loadContext=vm.createContext({loaded:{canvas:{w:1,h:2},items:[]}});
  vm.runInContext(validation,loadContext);
  for(const w of [0,1.5,8001]) { loadContext.loaded.canvas.w=w; assert.throws(()=>vm.runInContext(validation,loadContext),/Invalid painting/); }
  let removed=false;
  const eraseContext=vm.createContext({doc:{items:[{kind:'stroke',size:2,points:[[0,0],[100,0]]}]},eraserHistoryPushed:false,pushHistory(){},reRender(){removed=true;}});
  vm.runInContext(section(app,'function eraseAt','function doFill'),eraseContext);
  eraseContext.eraseAt([50,0],{});
  assert.equal(eraseContext.doc.items.length,0,'eraser hits segment between sparse samples');assert.ok(removed);
  // Eraser and shapes/pictures: drags erase rectangles and ellipses (inside or on the outline)
  // but never the coloring page or image underneath; a click removes the topmost picture.
  const square=[[0,0],[100,0],[100,100],[0,100]];
  const art={kind:'art',x:0,y:0,w:400,h:400};
  const img={kind:'image',x:500,y:0,w:300,h:100,rotation:90};
  const ectx=vm.createContext({doc:{items:[art,img,{kind:'region',fill:'#f00',points:square},{kind:'region',fill:'none',strokeWidth:2,points:[[200,200],[300,200],[300,300],[200,300]]},{kind:'stroke',size:4,points:[[10,300],[150,300]]}]},eraserHistoryPushed:false,pushHistory(){},reRender(){}});
  vm.runInContext(section(app,'function eraseAt','function doFill'),ectx);
  const kinds=()=>ectx.doc.items.map(i=>i.kind+(i.fill==='none'?':outline':''));
  ectx.eraseAt([50,50],{});
  assert.deepEqual(kinds(),['art','image','region:outline','stroke'],'filled shape erased from inside; art underneath kept');
  ectx.eraseAt([250,250],{});
  assert.deepEqual(kinds(),['art','image','region:outline','stroke'],'unfilled outline is not erased from its empty middle');
  ectx.eraseAt([300,250],{});
  assert.deepEqual(kinds(),['art','image','stroke'],'outline erased on its edge');
  ectx.eraseAt([80,300],{});
  assert.deepEqual(kinds(),['art','image'],'stroke over the coloring page erased, page kept');
  ectx.eraseObjectAt([20,20]);
  assert.deepEqual(kinds(),['image'],'a click removes the coloring page');
  ectx.eraseObjectAt([520,50]);
  assert.deepEqual(kinds(),['image'],'outside the rotated image (inside only its unrotated box): kept');
  ectx.eraseObjectAt([650,180]);
  assert.deepEqual(kinds(),[],'inside the rotated image: removed');
  console.log('PASS: paint/outline/opacity conversion, rotation, sparse segment erasing, shape/picture erasing, immutable saves, concurrent edit dirty status');
})().catch(err=>{console.error(err);process.exitCode=1;});
