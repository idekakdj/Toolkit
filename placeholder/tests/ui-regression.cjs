const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
class Element {
  constructor() { this.classes = new Set(['hidden']); this.classList = { add: x => this.classes.add(x), remove: x => this.classes.delete(x), contains: x => this.classes.has(x) }; this.events = {}; this.value = '0'; this.children = []; }
  addEventListener(name, fn) { this.events[name] = fn; }
  appendChild(child) { this.children.push(child); }
  setAttribute(name, value) { this[name] = value; }
  focus() { this.focused = true; }
  contains(el) { return el === this || this.children.includes(el); }
}
const els = {}, pending = new Map(), timers = [];
let finishConversion, runs = 0, created = 0, lastOptions;
const det = { id: 'txt', label: 'Text', category: 'doc' };
const context = vm.createContext({ window: { PlaceholderEngine: {
  detectFile: file => new Promise((resolve, reject) => pending.set(file.name, { resolve, reject })),
  getConversions: det => [{ label: 'Output', ext: 'txt', resize: det.category === 'image', run: (file, det, opts) => { runs++; lastOptions = opts; return new Promise(resolve => finishConversion = resolve); } }],
  formatBytes: String, baseName: name => name,
} }, document: { getElementById: id => els[id] ||= new Element(), createElement: () => new Element(), addEventListener() {} },
URL: { createObjectURL() { created++; return 'blob:fixture'; }, revokeObjectURL() {} }, performance: { now: () => 0 }, setTimeout: fn => timers.push(fn), Blob });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/convert-page.js'), 'utf8'), context);
const api = context.window.PlaceholderConvert;
(async () => {
  const first = api.acceptFile({ name: 'old', size: 1 });
  const second = api.acceptFile({ name: 'new', size: 2 });
  pending.get('new').resolve(det); await second;
  pending.get('old').resolve(det); await first;
  assert.equal(els.fileName.textContent, 'new');
  const run = els.convertBtn.events.click(); timers.shift()(); await Promise.resolve();
  const duplicate = els.convertBtn.events.click(); await duplicate; assert.equal(runs, 1);
  api.resetAll(); finishConversion(new Blob(['stale'])); await run;
  assert.equal(created, 0); assert.ok(els.resultView.classes.has('hidden'));
  const reading = api.acceptFile({ name: 'cancelled', size: 1 }); api.resetAll(); pending.get('cancelled').resolve(det); await reading;
  assert.ok(els.workspace.classes.has('hidden'));
  const bad = api.acceptFile({ name: 'bad', size: 1 }); pending.get('bad').reject(new Error('fixture failure')); await bad;
  assert.match(els.errorBox.textContent, /fixture failure/); assert.ok(!els.errorBox.classes.has('hidden'));
  const file = api.acceptFile({ name: 'download', size: 1 }); pending.get('download').resolve(det); await file;
  const success = els.convertBtn.events.click(); timers.shift()(); await Promise.resolve(); finishConversion(new Blob(['output'])); await success;
  assert.equal(els.downloadBtn.download, 'download.txt'); assert.equal(created, 1); assert.ok(els.downloadBtn.focused);
  api.resetAll();
  const image = api.acceptFile({ name: 'image', size: 1 }); pending.get('image').resolve({ ...det, category: 'image' }); await image;
  assert.ok(!els.resizeControl.classes.has('hidden'));
  assert.equal(els.resizeWidth.value, ''); assert.equal(els.resizeAspect.checked, true);
  const previousRuns = runs;
  els.resizeWidth.value = '0'; await els.convertBtn.events.click();
  assert.equal(runs, previousRuns); assert.match(els.errorBox.textContent, /whole numbers/);
  els.resizeWidth.value = '100'; els.resizeHeight.value = '40'; els.resizeAspect.checked = false;
  const resized = els.convertBtn.events.click();
  assert.equal(els.resizeWidth.disabled, true); assert.equal(els.resizeAspect.disabled, true);
  timers.shift()(); await Promise.resolve();
  assert.equal(lastOptions.width, 100); assert.equal(lastOptions.height, 40); assert.equal(lastOptions.keepAspect, false);
  finishConversion(new Blob(['resized'])); await resized;
  assert.equal(els.resizeWidth.disabled, false);
  api.resetAll(); assert.equal(els.resizeWidth.value, ''); assert.equal(els.resizeAspect.checked, true);
  console.log('PASS UI: out-of-order detection, double conversion, reset during conversion/detection, read errors, successful download');
})().catch(err => { console.error(err); process.exitCode = 1; });
