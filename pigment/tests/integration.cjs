const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');
const app = read('app.js'), interop = read('interop.js');
function section(source,start,end){const a=source.indexOf(start);assert.ok(a>=0);const b=source.indexOf(end,a);assert.ok(b>a);return source.slice(a,b);}
const c = vm.createContext({TextEncoder});
vm.runInContext(read('raster.js').replace(/export /g,'') + read('import-limit.js').replace(/export /g,'') + section(interop,'export function convertNode','// ─── SIGMA CLIPART').replace('export ',''), c);
const image={type:'image',src:'data:image/png;base64,aGVsbG8=',x:10,y:20,w:30,h:40,opacity:0.25,rotation:45};
const converted=c.convertNode(image);
assert.deepEqual(JSON.parse(JSON.stringify(converted)),{kind:'image',src:image.src,x:10,y:20,w:30,h:40,opacity:0.25,rotation:45});
for(const bad of [{src:'https://example.invalid/a.png'},{src:'data:image/svg+xml;base64,PHN2Zy8+'},{w:0},{h:2.5},{rotation:Infinity},{opacity:2}])assert.throws(()=>c.convertNode({...image,...bad}));
let history=0;
const current={canvas:{w:100,h:100,bg:'#fff'},items:Array.from({length:4999},()=>({kind:'stroke'}))};
c.appendImportedItems(current,[converted],()=>history++);assert.equal(current.items.length,5000);assert.equal(history,1);
const before=JSON.stringify(current);
assert.throws(()=>c.appendImportedItems(current,[converted],()=>history++),/5000/);assert.equal(JSON.stringify(current),before);assert.equal(history,1);
const small={canvas:{w:100,h:100},items:[]};
assert.throws(()=>c.appendImportedItems(small,[{label:'é'.repeat(4*1024*1024)}],()=>history++),/8 MB/);assert.equal(small.items.length,0);assert.equal(history,1,'UTF-8 byte rejection must precede history');
// Execute the real unload handler with a fetch spy, including repeated/canceled attempts.
let handler,writes=0,prompts=0;
const unload=vm.createContext({window:{addEventListener:(event,fn)=>handler=fn},fetch:()=>writes++});
vm.runInContext('let hasUnsavedEdits=true, paintingId="fixture";'+section(app,"window.addEventListener('beforeunload'",'// ─── GALLERY'),unload);
for(let i=0;i<2;i++){const event={preventDefault(){prompts++;}};handler(event);assert.equal(event.returnValue,'');}
assert.equal(writes,0);assert.equal(prompts,2);
vm.runInContext('hasUnsavedEdits=false',unload);handler({preventDefault(){throw Error('Unexpected prompt');}});
// Actual renderer and SVG serializer share the same centered rotation transform.
class Element{constructor(tag){this.tag=tag;this.attrs={};this.children=[];}setAttribute(k,v){this.attrs[k]=String(v);}setAttributeNS(ns,k,v){this.setAttribute(k,v);}appendChild(child){this.children.push(child);}querySelector(){return null;}}
const render=vm.createContext({document:{createElementNS:(ns,tag)=>new Element(tag)},XMLSerializer:class{serializeToString(root){return JSON.stringify(root);}}});
vm.runInContext('let doc,liveDefs=null;'+section(app,'function renderItem','function reRender()')+section(app,'function buildSheetSVG','// Export for interop.js'),render);
const el=render.renderItem(converted,0);assert.equal(el.attrs.transform,'rotate(45 25 40)');
render.fixture=converted;vm.runInContext('doc={canvas:{w:100,h:100,bg:"#fff"},items:[fixture]};',render);
const exported=JSON.parse(render.buildSheetSVG()).children.find(el=>el.tag==='image');assert.equal(exported.attrs.transform,el.attrs.transform);assert.equal(exported.attrs.opacity,'0.25');
// Real Sigma export must retain image placement and rotation.
let saved;
const exportContext=vm.createContext({structuredClone,assertRasterSource:c.assertRasterSource,assertRasterDimensions:c.assertRasterDimensions,getDoc:()=>({canvas:small.canvas,items:[converted]}),getName:()=> 'Fixture',
 document:{createElementNS:()=>({setAttribute(){},style:{},remove(){}}),body:{appendChild(){},removeChild(){}}},
 api:async(url,opts)=>{if(opts.method==='POST')return {id:'synthetic'};saved=opts.body;},setStatus(){},redirectIfSignedOut:()=>false});
vm.runInContext('function uid(){return "fixture";}'+section(interop,'export async function exportToSigma','// ─── OPEN IMPORT').replace('export ',''),exportContext);
(async()=>{await exportContext.exportToSigma();assert.equal(saved.document.nodes[0].rotation,45);assert.equal(saved.document.nodes[0].opacity,0.25);
let restored=0;const modal={classList:{remove(){}},_opener:{focus(){restored++;}}};
const dialog=vm.createContext({document:{getElementById:()=>modal}});vm.runInContext(section(app,'export function closeModal','// Close buttons').replace('export ',''),dialog);dialog.closeModal('import-modal');assert.equal(restored,1);
assert.equal(interop.split("closeModal('import-modal')").length - 1, 2);
console.log('PASS: safe Sigma image handoff/roundtrip, renderer/SVG rotation, atomic item/UTF-8 limits, unload confirmation without writes, dialog focus restoration');
})().catch(err=>{console.error(err);process.exitCode=1;});
