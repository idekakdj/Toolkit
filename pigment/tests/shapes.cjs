const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync('pigment/js/app.js', 'utf8');
const section = (a,b) => app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
let saves=0, previews=[], captures=new Set();
const handlers={};
const svg={addEventListener:(name,fn)=>handlers[name]=fn,getBoundingClientRect:()=>({left:10,top:20,width:500,height:250}),setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture(id){captures.delete(id);handlers.lostpointercapture({type:'lostpointercapture',pointerId:id});},appendChild:el=>previews.push(el)};
const c=vm.createContext({structuredClone,svg,screenToCanvas:e=>[(e.clientX-10)*2,(e.clientY-20)*2],renderItem:()=>({setAttribute(){},removeAttribute(){},remove(){previews=[];}}),reRender(){previews=[];},scheduleAutosave(){saves++;},updateHistoryButtons(){},initSvg(){previews=[];}});
vm.runInContext(`let doc={canvas:{w:1000,h:500,bg:'#ffffff'},items:[]},documentReady=true,currentTool='rectangle',currentSize=8,paint='#123456';const undoStack=[],redoStack=[];function currentPaint(){return structuredClone(paint);}function pushHistory(){undoStack.push(JSON.stringify(doc));redoStack.length=0;}`+section('let activePointerId','function eraseAt')+section('function undo()','document.getElementById(\'undo-btn\')'),c);
const event=(type,x,y,extra={})=>({type,clientX:x,clientY:y,pointerId:7,button:0,preventDefault(){},...extra});
const send=(type,x,y,extra)=>handlers[type](event(type,x,y,extra));
const value=s=>vm.runInContext(s,c);
const json=s=>JSON.parse(JSON.stringify(value(s)));
send('pointerdown',110,100);send('pointermove',40,40);
assert.equal(value('doc.items.length'),0);assert.equal(value('undoStack.length'),0);assert.equal(saves,0);assert.equal(previews.length,1);
send('pointermove',50,50,{pointerId:8});assert.equal(previews.length,1);
send('pointerup',40,40);assert.deepEqual(json('doc.items[0].points'),[[60,40],[200,40],[200,160],[60,160]]);assert.equal(value('undoStack.length'),1);assert.equal(saves,1);assert.equal(previews.length,0);
value('undo()');assert.equal(value('doc.items.length'),0);value('redo()');assert.equal(value('doc.items.length'),1);
value("currentTool='ellipse';paint={grad:'linear',angle:90,stops:[{at:0,color:'#123456'},{at:1,color:'#abcdef'}]}");
send('pointerdown',40,40);send('pointermove',90,65,{shiftKey:true});
assert.equal(value('doc.items.length'),1);send('pointerup',90,65,{shiftKey:true});
assert.equal(value('doc.items[1].points.length'),48);assert.equal(value('doc.items[1].fill.grad'),'linear');assert.equal(value('doc.items[1].strokeWidth'),2);
const pts=json('doc.items[1].points');assert.equal(Math.max(...pts.map(p=>p[0]))-Math.min(...pts.map(p=>p[0])),100);assert.equal(Math.max(...pts.map(p=>p[1]))-Math.min(...pts.map(p=>p[1])),100);
value("paint.stops[0].color='#ffffff'");assert.equal(value('doc.items[1].fill.stops[0].color'),'#123456');
const before=json('doc'),history=value('undoStack.length'),saved=saves;
for(const cancel of ['pointercancel','lostpointercapture','programmatic']){
 send('pointerdown',40,40);send('pointermove',90,80);
 if(cancel==='programmatic')value('onPointerUp()');else send(cancel,90,80);
 send('pointerup',90,80);assert.deepEqual(json('doc'),before);assert.equal(previews.length,0);
}
for(const [x,y] of [[40,40],[41,41],[90,40],[40,90]]){send('pointerdown',40,40);send('pointerup',x,y);}
assert.deepEqual(json('doc'),before);assert.equal(value('undoStack.length'),history);assert.equal(saves,saved);
// Release coordinates, including Shift, determine the committed shape without a move.
value("currentTool='rectangle'");send('pointerdown',40,40);send('pointerup',60,80,{shiftKey:true});assert.deepEqual(json('doc.items.at(-1).points'),[[60,40],[140,40],[140,120],[60,120]]);
assert.equal(value('undoStack.length'),history+1);assert.equal(saves,saved+1);
assert.match(app,/evt.key === 'Escape' && shapeGesture/);
assert.match(section('function setTool','// ─── COLOR'),/onPointerUp\(\)/);
console.log('PASS: rectangle/48-point ellipse gestures, preview isolation, reverse drag, Shift, gradient snapshot, single commit/history/save, undo/redo, pointer ownership, cancel/capture loss, tiny gestures');
