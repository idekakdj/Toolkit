import { validateImageDocument } from './raster.js';
import { trimHistory } from './history-budget.js';
import { prepareResize, resizeDimensions } from './resize.js';
// app.js — ImageVendor main engine entry point
// type="module" — loaded by app.html

import {
  doc, layerCanvases,
  activeLayerId, setActiveLayerId,
  currentTool, setCurrentTool,
  currentColor, setCurrentColor,
  brushSize, setBrushSize,
  brushOpacity, setBrushOpacity,
  zoom, setZoom,
  selection, setSelection,
  undoStack, redoStack,
  imageId, setImageId,
  imageName, setImageName,
  hasUnsavedEdits, setHasUnsavedEdits,
  isSaving, setIsSaving,
  saveQueued, setSaveQueued,
  nextLayerId,
  adjustBase, setAdjustBase, clearAdjustBase,
} from './state.js';

import {
  initTools,
  onPointerDown, onPointerMove, onPointerUp,
  onDblClick, handleToolKey,
  clearOverlay,
  startMarqueeAnimation, stopMarqueeAnimation,
  clientToImage,
} from './tools.js';

import {
  cloneImageData,
  filterGrayscale, filterInvert, filterSepia, filterBlur, filterSharpen,
  applyAdjustments,
  ensureAdjustBase, liveAdjust, restoreAdjustBase,
} from './adjust.js';

// ─── API HELPER ──────────────────────────────────────────────────────────────

export async function api(path, options = {}) {
  const opts = {
    method: options.method || 'GET',
    headers: { 'X-Requested-With': 'imagevendor' },
    credentials: 'same-origin',
  };
  if (options.body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function redirectIfSignedOut(err) {
  if (err && err.status === 401) {
    window.location.href = '/auth?next=' + encodeURIComponent('/imagevendor/app');
    return true;
  }
  return false;
}

// ─── EXPORTED ACCESSORS ──────────────────────────────────────────────────────

export function getDoc() {
  return { canvas: doc.canvas, layers: doc.layers };
}

export function getName() {
  return imageName;
}

export function getCanvasSize() {
  return { w: doc.canvas.w, h: doc.canvas.h };
}

export function getCompositeCanvas() {
  const tmp = document.createElement('canvas');
  tmp.width = doc.canvas.w;
  tmp.height = doc.canvas.h;
  const ctx = tmp.getContext('2d');
  // bg
  if (doc.canvas.bg !== 'transparent') {
    ctx.fillStyle = doc.canvas.bg;
    ctx.fillRect(0, 0, doc.canvas.w, doc.canvas.h);
  }
  for (let i = 0; i < doc.layers.length; i++) {
    const layer = doc.layers[i];
    if (!layer.visible) continue;
    const lc = layerCanvases.find(l => l.id === layer.id);
    if (!lc) continue;
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(lc.offscreen, 0, 0);
  }
  ctx.globalAlpha = 1;
  return tmp;
}

export function setStatus(text, cls) {
  const el = document.getElementById('save-status');
  if (!el) return;
  el.textContent = text;
  el.className = cls || '';
}

// ─── DOM REFERENCES ──────────────────────────────────────────────────────────

const ivCanvas  = document.getElementById('iv-canvas');
const ivOverlay = document.getElementById('iv-overlay');
const canvasWrap = document.getElementById('canvas-wrap');

// ─── COMPOSITE (composite all layers onto #iv-canvas) ────────────────────────

export function composite() {
  const { w, h } = doc.canvas;
  const ctx = ivCanvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (doc.canvas.bg !== 'transparent') {
    ctx.fillStyle = doc.canvas.bg;
    ctx.fillRect(0, 0, w, h);
  }
  for (let i = 0; i < doc.layers.length; i++) {
    const layer = doc.layers[i];
    if (!layer.visible) continue;
    const lc = layerCanvases.find(l => l.id === layer.id);
    if (!lc) continue;
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(lc.offscreen, 0, 0);
  }
  ctx.globalAlpha = 1;
}

// ─── ZOOM / FIT ───────────────────────────────────────────────────────────────

function applyZoom() {
  const { w, h } = doc.canvas;
  const cssW = Math.round(w * zoom);
  const cssH = Math.round(h * zoom);
  ivCanvas.style.width = cssW + 'px';
  ivCanvas.style.height = cssH + 'px';
  ivOverlay.style.width = cssW + 'px';
  ivOverlay.style.height = cssH + 'px';
  const zoomLabel = document.getElementById('zoom-label');
  if (zoomLabel) zoomLabel.textContent = Math.round(zoom * 100) + '%';
}

function fitToScreen() {
  const { w, h } = doc.canvas;
  const cw = canvasWrap.clientWidth - 40;
  const ch = canvasWrap.clientHeight - 40;
  const s = Math.min(cw / w, ch / h, 1);
  setZoom(s);
  applyZoom();
}

document.getElementById('zoom-in').addEventListener('click', () => {
  setZoom(zoom * 1.25);
  applyZoom();
});

document.getElementById('zoom-out').addEventListener('click', () => {
  setZoom(zoom / 1.25);
  applyZoom();
});

document.getElementById('zoom-label').addEventListener('click', () => {
  setZoom(1);
  applyZoom();
});

document.getElementById('zoom-fit').addEventListener('click', () => {
  fitToScreen();
});

window.addEventListener('resize', () => {
  applyZoom();
});

// Ctrl/Cmd + wheel zoom toward cursor; plain wheel pans (scrolling handled by overflow)
canvasWrap.addEventListener('wheel', (evt) => {
  if (evt.ctrlKey || evt.metaKey) {
    evt.preventDefault();
    const rect = ivCanvas.getBoundingClientRect();
    const factor = evt.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoom(zoom * factor);
    applyZoom();
  }
}, { passive: false });

// ─── SPACE-DRAG PAN ───────────────────────────────────────────────────────────

let _spacePanning = false;
let _panStartX = 0, _panStartY = 0;
let _panScrollX = 0, _panScrollY = 0;

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !_spacePanning && !document.querySelector('.modal-backdrop.show')) {
    const tag = document.activeElement && document.activeElement.tagName.toLowerCase();
    if (!document.activeElement?.isContentEditable && !['input', 'textarea', 'select', 'button', 'a'].includes(tag)) {
      _spacePanning = true;
      canvasWrap.style.cursor = 'grab';
    }
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    _spacePanning = false;
    canvasWrap.style.cursor = '';
  }
});

canvasWrap.addEventListener('mousedown', (e) => {
  if (_spacePanning) {
    e.preventDefault();
    _panStartX = e.clientX;
    _panStartY = e.clientY;
    _panScrollX = canvasWrap.scrollLeft;
    _panScrollY = canvasWrap.scrollTop;
    canvasWrap.style.cursor = 'grabbing';
  }
});

canvasWrap.addEventListener('mousemove', (e) => {
  if (_spacePanning && e.buttons === 1) {
    canvasWrap.scrollLeft = _panScrollX - (e.clientX - _panStartX);
    canvasWrap.scrollTop  = _panScrollY - (e.clientY - _panStartY);
  }
});

canvasWrap.addEventListener('mouseup', () => {
  if (_spacePanning) canvasWrap.style.cursor = 'grab';
});

// ─── CANVAS SIZE INIT ─────────────────────────────────────────────────────────

function setCanvasDimensions(w, h) {
  ivCanvas.width = w;
  ivCanvas.height = h;
  ivOverlay.width = w;
  ivOverlay.height = h;
  document.getElementById('resize-width').value = w;
  document.getElementById('resize-height').value = h;
}

// ─── UNDO / REDO ─────────────────────────────────────────────────────────────

export function pushHistory() {
  finishAdjustments();
  const snap = makeSnapshot();
  undoStack.push(snap);
  redoStack.length = 0;
  trimHistory(undoStack, redoStack);
  updateHistoryButtons();
}

function makeSnapshot() {
  return JSON.stringify({
    canvas: { ...doc.canvas },
    activeLayerId,
    layers: doc.layers.map(l => {
      const lc = layerCanvases.find(lc2 => lc2.id === l.id);
      return {
        id: l.id,
        name: l.name,
        visible: l.visible,
        opacity: l.opacity,
        data: lc ? lc.offscreen.toDataURL('image/png') : '',
      };
    }),
  });
}

async function restoreSnapshot(snapStr) {
  const snap = JSON.parse(snapStr);
  // Decode into temporary canvases; never expose a partially restored document to autosave.
  const rebuilt = await Promise.all(snap.layers.map(async sl => {
    const off = document.createElement('canvas');
    off.width = snap.canvas.w;
    off.height = snap.canvas.h;
    if (sl.data) await loadDataUrlIntoCanvas(sl.data, off);
    return { id: sl.id, offscreen: off };
  }));
  Object.assign(doc.canvas, snap.canvas);
  doc.layers.splice(0, doc.layers.length, ...snap.layers.map(sl => ({ ...sl, data: '' })));
  layerCanvases.splice(0, layerCanvases.length, ...rebuilt);
  setActiveLayerId(snap.layers.some(l => l.id === snap.activeLayerId) ? snap.activeLayerId : snap.layers.at(-1)?.id ?? null);
  setSelection(null);
  stopMarqueeAnimation();
  clearOverlay();
  clearAdjustBase();
  setCanvasDimensions(doc.canvas.w, doc.canvas.h);
  applyZoom();
  composite();
  refreshLayersPanel();
  updateHistoryButtons();
}

function updateHistoryButtons() {
  const ub = document.getElementById('undo-btn');
  const rb = document.getElementById('redo-btn');
  if (ub) ub.disabled = undoStack.length === 0;
  if (rb) rb.disabled = redoStack.length === 0;
}

let restoringHistory = false;
async function travelHistory(from, to) {
  if (restoringHistory || !from.length) return;
  finishAdjustments();
  restoringHistory = true;
  document.body.inert = true;
  clearTimeout(autosaveTimer);
  try {
    const current = makeSnapshot();
    await restoreSnapshot(from.at(-1));
    from.pop();
    to.push(current);
    trimHistory(undoStack, redoStack, to);
    scheduleAutosave();
  } catch (err) {
    setStatus('Undo/redo failed: ' + err.message, 'error');
  } finally {
    restoringHistory = false;
    document.body.inert = false;
    updateHistoryButtons();
    if (hasUnsavedEdits) scheduleAutosave();
  }
}
async function undo() { await travelHistory(undoStack, redoStack); }
async function redo() { await travelHistory(redoStack, undoStack); }

document.getElementById('undo-btn').addEventListener('click', undo);
document.getElementById('redo-btn').addEventListener('click', redo);

// ─── LAYER MODEL HELPERS ──────────────────────────────────────────────────────

function createLayerOffscreen() {
  const off = document.createElement('canvas');
  off.width = doc.canvas.w;
  off.height = doc.canvas.h;
  return off;
}

function activeLayerIndex() {
  return doc.layers.findIndex(l => l.id === activeLayerId);
}

function selectLayer(id) {
  finishAdjustments();
  setActiveLayerId(id);
  const idx = doc.layers.findIndex(l => l.id === id);
  if (idx !== -1) {
    const opSlider = document.getElementById('layer-opacity');
    if (opSlider) {
      opSlider.value = Math.round(doc.layers[idx].opacity * 100);
      const label = opSlider.closest('.panel-row')?.querySelector('.panel-row-label span:last-child');
      if (label) label.textContent = Math.round(doc.layers[idx].opacity * 100) + '%';
    }
  }
  refreshLayersPanel();
}

// ─── LAYERS PANEL ─────────────────────────────────────────────────────────────

function refreshLayersPanel() {
  const list = document.getElementById('layers-list');
  if (!list) return;
  // Rebuilding the list destroys the focused element; remember it and restore focus afterwards.
  let refocus = null;
  const focused = document.activeElement;
  if (focused && list.contains(focused)) {
    const owner = focused.closest('[data-layer-id]');
    if (owner) refocus = { id: owner.dataset.layerId, vis: focused !== owner && focused.classList.contains('layer-vis') };
  }
  list.innerHTML = '';

  // Render top-to-bottom (reverse of array order)
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const layer = doc.layers[i];
    const row = document.createElement('div');
    row.className = 'layer-row' + (layer.id === activeLayerId ? ' selected' : '');
    row.dataset.layerId = layer.id;
    row.setAttribute('draggable', 'true');
    row.setAttribute('role', 'listitem');
    row.tabIndex = 0;
    row.addEventListener('keydown', e => { if (e.target !== row) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectLayer(layer.id); }
      else if (e.key === 'F2') { e.preventDefault(); startRename(); }       // keyboard route to rename
    });

    const visBtn = document.createElement('button');
    visBtn.className = 'layer-vis';
    visBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
    visBtn.setAttribute('aria-label', visBtn.title + ': ' + layer.name);
    visBtn.setAttribute('aria-pressed', String(layer.visible));
    visBtn.textContent = layer.visible ? '👁' : '○';
    visBtn.classList.add('layer-vis-inline');
    visBtn.style.opacity = layer.visible ? '1' : '0.4';
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      pushHistory();
      layer.visible = !layer.visible;
      composite();
      refreshLayersPanel();
      scheduleAutosave();
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'layer-name';
    nameSpan.textContent = layer.name;
    nameSpan.classList.add('layer-name-inline');

    nameSpan.addEventListener('dblclick', (e) => { e.stopPropagation(); startRename(); });
    function startRename() {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = layer.name;
      inp.className = 'layer-name-edit';
      nameSpan.replaceWith(inp);
      inp.focus();
      inp.select();
      let finished = false;
      function done(refocus) {
        if (finished) return;
        finished = true;
        if (refocus) row.focus();          // the panel is rebuilt below; focus follows the row
        pushHistory();
        layer.name = inp.value.trim() || layer.name;
        const ns2 = document.createElement('span');
        ns2.className = 'layer-name layer-name-inline';
        ns2.textContent = layer.name;
        inp.replaceWith(ns2);
        scheduleAutosave();
        // re-attach dblclick won't survive DOM swap — just refresh
        refreshLayersPanel();
      }
      inp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') done(true);
        if (ev.key === 'Escape') { finished = true; row.focus(); inp.replaceWith(nameSpan); }
        ev.stopPropagation();
      });
      inp.addEventListener('blur', () => done(false));
    }

    row.appendChild(visBtn);
    row.appendChild(nameSpan);

    row.addEventListener('click', () => selectLayer(layer.id));

    // Drag-to-reorder
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', layer.id);
      row.style.opacity = '0.5';
    });
    row.addEventListener('dragend', () => { row.style.opacity = ''; });
    row.addEventListener('dragover', (e) => { e.preventDefault(); });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const srcId = e.dataTransfer.getData('text/plain');
      if (srcId === layer.id) return;
      const srcIdx = doc.layers.findIndex(l => l.id === srcId);
      const dstIdx = doc.layers.findIndex(l => l.id === layer.id);
      if (srcIdx === -1 || dstIdx === -1) return;
      pushHistory();
      // Also reorder layerCanvases
      const [ls] = doc.layers.splice(srcIdx, 1);
      const lcIdx = layerCanvases.findIndex(l => l.id === srcId);
      const [lcs] = layerCanvases.splice(lcIdx, 1);
      // find new dst after removal
      const newDst = doc.layers.findIndex(l => l.id === layer.id);
      doc.layers.splice(newDst, 0, ls);
      const lcDst = layerCanvases.findIndex(l => l.id === layer.id);
      layerCanvases.splice(lcDst, 0, lcs);
      composite();
      refreshLayersPanel();
      scheduleAutosave();
    });

    list.appendChild(row);
    if (refocus && refocus.id === layer.id) (refocus.vis ? visBtn : row).focus();
  }
}

document.getElementById('add-layer-btn').addEventListener('click', () => {
  if (doc.layers.length >= 64) { setStatus('Layer limit reached (64)', 'error'); return; }
  pushHistory();
  const id = nextLayerId();
  const idx = activeLayerIndex();
  const newLayer = { id, name: 'Layer ' + (doc.layers.length + 1), visible: true, opacity: 1, data: '' };
  const off = createLayerOffscreen();
  const insertAt = idx === -1 ? doc.layers.length : idx + 1;
  doc.layers.splice(insertAt, 0, newLayer);
  layerCanvases.splice(insertAt, 0, { id, offscreen: off });
  setActiveLayerId(id);
  composite();
  refreshLayersPanel();
  scheduleAutosave();
});

document.getElementById('duplicate-layer-btn').addEventListener('click', () => {
  if (doc.layers.length >= 64) { setStatus('Layer limit reached (64)', 'error'); return; }
  const idx = activeLayerIndex();
  if (idx === -1) return;
  pushHistory();
  const src = doc.layers[idx];
  const srcLc = layerCanvases[idx];
  const id = nextLayerId();
  const off = createLayerOffscreen();
  off.getContext('2d').drawImage(srcLc.offscreen, 0, 0);
  const newLayer = { id, name: src.name + ' copy', visible: src.visible, opacity: src.opacity, data: '' };
  doc.layers.splice(idx + 1, 0, newLayer);
  layerCanvases.splice(idx + 1, 0, { id, offscreen: off });
  setActiveLayerId(id);
  composite();
  refreshLayersPanel();
  scheduleAutosave();
});

document.getElementById('delete-layer-btn').addEventListener('click', () => {
  if (doc.layers.length <= 1) return;
  const idx = activeLayerIndex();
  if (idx === -1) return;
  pushHistory();
  doc.layers.splice(idx, 1);
  layerCanvases.splice(idx, 1);
  const newActive = doc.layers[Math.min(idx, doc.layers.length - 1)];
  setActiveLayerId(newActive ? newActive.id : null);
  composite();
  refreshLayersPanel();
  scheduleAutosave();
});

let opacityEditing = false;
document.getElementById('layer-opacity').addEventListener('input', (e) => {
  if (!opacityEditing) { pushHistory(); opacityEditing = true; }
  const idx = activeLayerIndex();
  if (idx === -1) return;
  const val = parseInt(e.target.value, 10);
  doc.layers[idx].opacity = val / 100;
  const label = e.target.closest('.panel-row')?.querySelector('.panel-row-label span:last-child');
  if (label) label.textContent = val + '%';
  composite();
});

document.getElementById('layer-opacity').addEventListener('change', () => {
  opacityEditing = false;
  scheduleAutosave();
});

// ─── TOOLS WIRING ─────────────────────────────────────────────────────────────

initTools(composite, pushHistory, scheduleAutosave, refreshLayersPanel, ivCanvas, ivOverlay);

ivOverlay.addEventListener('pointerdown', e => { if (_spacePanning) return; finishAdjustments(); onPointerDown(e); });
ivOverlay.addEventListener('pointermove', onPointerMove);
ivOverlay.addEventListener('pointerup', onPointerUp);
ivOverlay.addEventListener('pointercancel', onPointerUp);
ivOverlay.addEventListener('pointerleave', (e) => { if (e.buttons === 0) onPointerUp(e); });
ivOverlay.addEventListener('dblclick', onDblClick);

function setTool(name) {
  setCurrentTool(name);
  // Clear selection when switching away from selection tools
  if (name !== 'select-rect' && name !== 'select-ellipse') {
    // keep selection — it should persist across tool switches for brush/fill etc.
  }
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === name);
    btn.setAttribute('aria-pressed', String(btn.dataset.tool === name));
  });
}

document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
});

// ─── COLOR & BRUSH ────────────────────────────────────────────────────────────

const colorPicker = document.getElementById('color-picker');
const paletteEl = document.getElementById('palette');

colorPicker.addEventListener('input', () => {
  setCurrentColor(colorPicker.value);
  document.querySelectorAll('#palette .swatch').forEach(sw => {
    sw.classList.toggle('selected', sw.dataset.color.toLowerCase() === currentColor.toLowerCase());
  });
});

paletteEl.addEventListener('click', (e) => {
  const sw = e.target.closest('.swatch');
  if (!sw) return;
  setCurrentColor(sw.dataset.color);
  colorPicker.value = currentColor;
  document.querySelectorAll('#palette .swatch').forEach(s => s.classList.remove('selected'));
  sw.classList.add('selected');
});

document.getElementById('brush-size').addEventListener('input', (e) => {
  setBrushSize(parseInt(e.target.value, 10));
});

document.getElementById('brush-opacity').addEventListener('input', (e) => {
  setBrushOpacity(parseInt(e.target.value, 10));
});

// init from DOM
setBrushSize(parseInt(document.getElementById('brush-size').value, 10));
setBrushOpacity(parseInt(document.getElementById('brush-opacity').value, 10));
setCurrentColor(colorPicker.value);

// ─── ADJUSTMENTS ──────────────────────────────────────────────────────────────

const adjustSliders = ['adjust-brightness', 'adjust-contrast', 'adjust-saturation', 'adjust-hue'];

adjustSliders.forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    if (!adjustBase) pushHistory();
    ensureAdjustBase();
    const b = parseInt(document.getElementById('adjust-brightness').value, 10);
    const c = parseInt(document.getElementById('adjust-contrast').value, 10);
    const s = parseInt(document.getElementById('adjust-saturation').value, 10);
    const h = parseInt(document.getElementById('adjust-hue').value, 10);
    liveAdjust(b, c, s, h, composite);
    scheduleAutosave();
  });
});

function finishAdjustments() {
  if (!adjustBase) return;
  clearAdjustBase();
  adjustSliders.forEach(id => { document.getElementById(id).value = 0; });
}

document.getElementById('apply-adjust').addEventListener('click', () => {
  clearAdjustBase();
  adjustSliders.forEach(id => { document.getElementById(id).value = 0; });
  scheduleAutosave();
});

document.getElementById('reset-adjust').addEventListener('click', () => {
  restoreAdjustBase(composite);
  adjustSliders.forEach(id => { document.getElementById(id).value = 0; });
  scheduleAutosave();
});

// ─── FILTERS ─────────────────────────────────────────────────────────────────

function applyFilter(fn) {
  const lc = layerCanvases.find(l => l.id === activeLayerId);
  if (!lc) return;
  pushHistory();
  const ctx = lc.offscreen.getContext('2d');
  const id = ctx.getImageData(0, 0, doc.canvas.w, doc.canvas.h);
  fn(id);
  ctx.putImageData(id, 0, 0);
  composite();
  scheduleAutosave();
}

document.getElementById('filter-grayscale').addEventListener('click', () => applyFilter(filterGrayscale));
document.getElementById('filter-invert').addEventListener('click', () => applyFilter(filterInvert));
document.getElementById('filter-sepia').addEventListener('click', () => applyFilter(filterSepia));
document.getElementById('filter-blur').addEventListener('click', () => applyFilter(filterBlur));
document.getElementById('filter-sharpen').addEventListener('click', () => applyFilter(filterSharpen));

// ─── TRANSFORM ───────────────────────────────────────────────────────────────

const resizeWidth = document.getElementById('resize-width');
const resizeHeight = document.getElementById('resize-height');
const resizeError = document.getElementById('resize-error');
for (const [input, other, widthChanged] of [[resizeWidth, resizeHeight, true], [resizeHeight, resizeWidth, false]]) {
  input.addEventListener('input', () => {
    resizeError.textContent = '';
    if (!document.getElementById('resize-aspect').checked) return;
    try {
      const { w } = resizeDimensions(input.value, 1);
      other.value = Math.max(1, Math.round(w * (widthChanged ? doc.canvas.h / doc.canvas.w : doc.canvas.w / doc.canvas.h)));
    } catch { /* Keep invalid input visible for Apply validation. */ }
  });
}

export function resizeImage(width, height) {
  if (restoringHistory) throw new Error('Wait for undo/redo to finish before resizing.');
  const { w, h } = resizeDimensions(width, height);
  if (w === doc.canvas.w && h === doc.canvas.h) return false;
  const rebuilt = prepareResize(doc.canvas, layerCanvases, w, h, () => document.createElement('canvas'));
  // Snapshot serialization can fail too; complete it before modifying caches/history.
  const snapshot = makeSnapshot();
  finishAdjustments();
  undoStack.push(snapshot);
  redoStack.length = 0;
  trimHistory(undoStack, redoStack);
  layerCanvases.splice(0, layerCanvases.length, ...rebuilt);
  doc.canvas.w = w;
  doc.canvas.h = h;
  setSelection(null);
  stopMarqueeAnimation();
  clearOverlay();
  clearAdjustBase();
  setCanvasDimensions(w, h);
  fitToScreen();
  composite();
  refreshLayersPanel();
  updateHistoryButtons();
  scheduleAutosave();
  return true;
}

document.getElementById('apply-resize').addEventListener('click', () => {
  resizeError.textContent = '';
  try { resizeImage(resizeWidth.value, resizeHeight.value); }
  catch (err) { resizeError.textContent = err.message; }
});

document.getElementById('flip-h').addEventListener('click', () => {
  const lc = layerCanvases.find(l => l.id === activeLayerId);
  if (!lc) return;
  pushHistory();
  const { w, h } = doc.canvas;
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tc = tmp.getContext('2d');
  tc.translate(w, 0);
  tc.scale(-1, 1);
  tc.drawImage(lc.offscreen, 0, 0);
  lc.offscreen.getContext('2d').clearRect(0, 0, w, h);
  lc.offscreen.getContext('2d').drawImage(tmp, 0, 0);
  composite();
  scheduleAutosave();
});

document.getElementById('flip-v').addEventListener('click', () => {
  const lc = layerCanvases.find(l => l.id === activeLayerId);
  if (!lc) return;
  pushHistory();
  const { w, h } = doc.canvas;
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  const tc = tmp.getContext('2d');
  tc.translate(0, h);
  tc.scale(1, -1);
  tc.drawImage(lc.offscreen, 0, 0);
  lc.offscreen.getContext('2d').clearRect(0, 0, w, h);
  lc.offscreen.getContext('2d').drawImage(tmp, 0, 0);
  composite();
  scheduleAutosave();
});

function rotateLayers(cw) {
  pushHistory();
  const { w, h } = doc.canvas;
  const newW = h, newH = w;

  for (const lc of layerCanvases) {
    const tmp = document.createElement('canvas');
    tmp.width = newW;
    tmp.height = newH;
    const tc = tmp.getContext('2d');
    if (cw) {
      tc.translate(newW, 0);
      tc.rotate(Math.PI / 2);
    } else {
      tc.translate(0, newH);
      tc.rotate(-Math.PI / 2);
    }
    tc.drawImage(lc.offscreen, 0, 0);
    lc.offscreen = tmp;
  }

  setSelection(null);
  stopMarqueeAnimation();
  clearOverlay();
  doc.canvas.w = newW;
  doc.canvas.h = newH;
  setCanvasDimensions(newW, newH);
  composite();
  fitToScreen();
  scheduleAutosave();
  refreshLayersPanel();
}

document.getElementById('rotate-cw').addEventListener('click', () => rotateLayers(true));
document.getElementById('rotate-ccw').addEventListener('click', () => rotateLayers(false));

// ─── AUTOSAVE ────────────────────────────────────────────────────────────────

let editRevision = 0;
let autosaveTimer = null;
let serverRevision = 0;
let saveConflict = false;
const conflictMessage = "Save conflict: changed in another tab. Local edits kept; export them using Export, then reload to resume saving.";
let saveRetryTimer = null;

// True once anything other than the image name changed since the last successful save.
// A rename alone is sent as a small metadata update instead of re-encoding every layer.
let contentEdited = false;

export function scheduleAutosave() {
  contentEdited = true;
  scheduleSave();
}

function scheduleSave() {
  editRevision++;
  setHasUnsavedEdits(true);
  if (saveConflict) { setStatus(conflictMessage, 'error'); return; }
  setStatus('Edited', '');
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(doAutosave, 1500);
}

async function generateThumbnail() {
  try {
    const { w } = doc.canvas;
    const maxW = 280;
    const scale = Math.min(1, maxW / w);
    const src = getCompositeCanvas();
    const tw = Math.max(1, Math.round(src.width * scale));
    const th = Math.max(1, Math.round(src.height * scale));
    const tmp = document.createElement('canvas');
    tmp.width = tw; tmp.height = th;
    tmp.getContext('2d').drawImage(src, 0, 0, tw, th);
    const dataURL = tmp.toDataURL('image/jpeg', 0.7);
    if (dataURL.length > 200 * 1024 * 1.37) return null;
    return dataURL;
  } catch {
    return null;
  }
}

async function doAutosave(isRetry = false) {
  if (saveConflict || !imageId || restoringHistory) return;
  if (isSaving) {
    setSaveQueued(true);
    return;
  }
  setIsSaving(true);
  setSaveQueued(false);
  const revision = editRevision;
  const savingId = imageId;
  const nameOnly = !contentEdited;
  clearTimeout(saveRetryTimer);
  setStatus('Saving…', 'saving');

  try {
    if (nameOnly) {
      const result = await api(`/api/images/${savingId}`, { method: 'PUT', body: { baseRevision: serverRevision, name: imageName } });
      serverRevision = result?.image?.revision ?? serverRevision + 1;
      if (revision === editRevision) { setHasUnsavedEdits(false); setStatus('Saved', ''); }
      else setSaveQueued(true);
      return;
    }
    const thumbnail = await generateThumbnail();
    const layers = doc.layers.map(l => {
      const lc = layerCanvases.find(lc2 => lc2.id === l.id);
      return {
        id: l.id,
        name: l.name,
        visible: l.visible,
        opacity: l.opacity,
        data: lc ? lc.offscreen.toDataURL('image/png') : '',
      };
    });
    const result = await api(`/api/images/${savingId}`, {
      method: 'PUT',
      body: {
        baseRevision: serverRevision,
        name: imageName,
        document: { version: 1, canvas: doc.canvas, layers },
        thumbnail,
      },
    });
    serverRevision = result?.image?.revision ?? serverRevision + 1;
    if (revision === editRevision) {
      contentEdited = false;
      setHasUnsavedEdits(false);
      setStatus('Saved', '');
    } else {
      setSaveQueued(true);
    }
  } catch (err) {
    if (redirectIfSignedOut(err)) { setIsSaving(false); return; }
    if (err.status === 409) {
      saveConflict = true;
      setHasUnsavedEdits(true); setSaveQueued(false);
      clearTimeout(autosaveTimer); clearTimeout(saveRetryTimer);
      setStatus(conflictMessage, 'error');
      return;
    }
    setStatus('Save failed: ' + err.message, 'error');
    // Retrying cannot fix a permanent rejection (quota, validation); a later edit saves again.
    if (!isRetry && (!err.status || err.status >= 500 || err.status === 429)) {
      saveRetryTimer = setTimeout(() => doAutosave(true), 4000);
    }
  } finally {
    setIsSaving(false);
    if (saveQueued && !saveConflict) scheduleAutosave();
  }
}

// ─── IMAGE NAME ───────────────────────────────────────────────────────────────

const imageNameInput = document.getElementById('image-name');
imageNameInput.addEventListener('input', () => {
  setImageName(imageNameInput.value.trim() || 'Untitled image');
  document.title = imageName + ' — ImageVendor';
  scheduleSave();
});

// ─── BEFORE UNLOAD ────────────────────────────────────────────────────────────

window.addEventListener('beforeunload', (event) => {
  if (!hasUnsavedEdits) return;
  event.preventDefault();
  event.returnValue = '';
});

// ─── MODALS ───────────────────────────────────────────────────────────────────

const modalReturnFocus = new Map();
function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  modalReturnFocus.set(id, document.activeElement);
  const dialog = el.querySelector('.modal');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', dialog.querySelector('h2,h3')?.textContent || 'ImageVendor dialog');
  el.classList.add('show');
  dialog.querySelector('button,input,select')?.focus();
}
export function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('show');
  modalReturnFocus.get(id)?.focus();
  modalReturnFocus.delete(id);
}
document.addEventListener('keydown', event => {
  const modal = document.querySelector('.modal-backdrop.show');
  if (!modal) return;
  if (event.key === 'Escape') { event.preventDefault(); closeModal(modal.id); }
  if (event.key === 'Tab') {
    const controls = Array.from(modal.querySelectorAll('button,input,select,a[href],[tabindex="0"]')).filter(el => !el.disabled && !el.hidden && el.getClientRects().length);
    if (!controls.length) return;
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

document.querySelectorAll('.modal-close[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal(backdrop.id);
  });
});

document.getElementById('gallery-btn').addEventListener('click', async () => {
  await populateGalleryGrid();
  openModal('gallery-modal');
});

document.getElementById('import-btn').addEventListener('click', () => {
  openModal('import-modal');
});

document.getElementById('export-btn').addEventListener('click', () => {
  const qualityRow = document.getElementById('quality-row');
  const mode = document.getElementById('export-mode').value;
  if (qualityRow) qualityRow.style.display = mode === 'jpeg' ? '' : 'none';
  openModal('export-modal');
});

document.getElementById('export-mode').addEventListener('change', (e) => {
  const qualityRow = document.getElementById('quality-row');
  if (qualityRow) qualityRow.style.display = e.target.value === 'jpeg' ? '' : 'none';
});

// ─── GALLERY ─────────────────────────────────────────────────────────────────

async function loadGalleryList() {
  try {
    const list = await api('/api/images');
    return Array.isArray(list) ? list : (list.images || []);
  } catch (err) {
    redirectIfSignedOut(err);
    return [];
  }
}

async function populateGalleryGrid() {
  const grid = document.getElementById('gallery-grid');
  if (!grid) return;
  grid.innerHTML = '<p class="grid-msg">Loading…</p>';
  const list = await loadGalleryList();
  grid.innerHTML = '';
  if (list.length === 0) {
    grid.innerHTML = '<p class="grid-msg">No images yet.</p>';
    return;
  }
  for (const img of list) {
    const card = document.createElement('div');
    card.className = 'gallery-item';
    // Names and thumbnails are user data: build the card with DOM APIs, never HTML strings.
    card.innerHTML = '<div class="g-thumb"><img alt=""></div><div class="g-name"></div><button class="g-del">✕</button>';
    if (img.thumbnail) card.querySelector('img').src = img.thumbnail;
    card.querySelector('.g-name').textContent = img.name || 'Untitled';
    card.querySelector('.g-del').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete "${img.name}"?`)) return;
      try {
        await api(`/api/images/${img.id}`, { method: 'DELETE' });
        await populateGalleryGrid();
      } catch (err) {
        if (!redirectIfSignedOut(err)) alert('Could not delete image.');
      }
    });
    card.addEventListener('click', () => {
      window.location.href = '/imagevendor/app?id=' + img.id;
    });
    grid.appendChild(card);
  }
}

// ─── NEW IMAGE MODAL ──────────────────────────────────────────────────────────

document.getElementById('new-image-btn').addEventListener('click', () => {
  closeModal('gallery-modal');
  openModal('new-modal');
});

document.getElementById('create-image-go').addEventListener('click', async () => {
  let w = parseInt(document.getElementById('new-w').value, 10);
  let h = parseInt(document.getElementById('new-h').value, 10);
  w = Math.max(1, Math.min(8000, w || 1280));
  h = Math.max(1, Math.min(8000, h || 800));
  const bg = document.getElementById('new-bg').value || '#ffffff';

  try {
    const data = await api('/api/images', { method: 'POST', body: { name: 'Untitled image' } });
    const created = data.image || data;
    const id = created.id;

    // Build the initial doc and PUT it
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    if (bg !== 'transparent') {
      const c = off.getContext('2d');
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
    }
    const layerId = nextLayerId();
    const layers = [{
      id: layerId,
      name: 'Background',
      visible: true,
      opacity: 1,
      data: off.toDataURL('image/png'),
    }];
    await api(`/api/images/${id}`, {
      method: 'PUT',
      body: { name: 'Untitled image', document: { version: 1, canvas: { w, h, bg }, layers } },
    });
    window.location.href = '/imagevendor/app?id=' + id;
  } catch (err) {
    if (!redirectIfSignedOut(err)) alert('Could not create image.');
  }
});

// ─── IMPORT ───────────────────────────────────────────────────────────────────

// File import
const importFileInput = document.getElementById('import-file');
importFileInput.addEventListener('change', async () => {
  const file = importFileInput.files[0];
  importFileInput.value = '';
  if (!file) return;
  // Verify the real file type, size and pixel dimensions from its bytes before any decoder runs.
  const guard = window.ToolkitUploadGuard;
  const verdict = guard ? await guard.checkImage(file) : { ok: false, message: 'Upload checks are unavailable; reload the page.' };
  if (!verdict.ok) { setStatus('Import failed: ' + verdict.message, 'error'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onerror = () => setStatus('Import failed: unsupported or damaged image', 'error');
    img.onload = () => {
      try {
        addImageLayer(img, file.name.replace(/\.[^.]+$/, ''));
        closeModal('import-modal');
      } catch (err) { setStatus('Import failed: ' + err.message, 'error'); }
    };
    img.src = e.target.result;
  };
  reader.onerror = () => setStatus('Import failed: file could not be read', 'error');
  reader.readAsDataURL(file);
  importFileInput.value = '';
});

document.querySelectorAll('.import-src').forEach(btn => {
  btn.addEventListener('click', async () => {
    const src = btn.dataset.src;
    document.querySelectorAll('.import-src').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.import-src').forEach(b => b.setAttribute('aria-selected', String(b === btn)));

    if (src === 'file') {
      importFileInput.click();
      return;
    }
    // Lazy load interop
    try {
      const m = await import('/imagevendor/js/interop.js');
      await m.listFrom(src);
    } catch (err) {
      console.error('interop not available', err);
    }
  });
});

// ─── EXPORT ───────────────────────────────────────────────────────────────────

document.getElementById('export-go').addEventListener('click', async () => {
  try {
    const m = await import('/imagevendor/js/interop.js');
    await m.runExport();
  } catch (err) {
    setStatus('Export failed: ' + err.message, 'error');
  }
});

// ─── addImageLayer (exported) ─────────────────────────────────────────────────

export function addImageLayer(source, name) {
  if (doc.layers.length >= 64) throw new Error('Layer limit reached (64)');
  const id = nextLayerId();
  const { w, h } = doc.canvas;
  const off = createLayerOffscreen();
  const ctx = off.getContext('2d');

  let srcW, srcH;
  if (source instanceof HTMLCanvasElement) {
    srcW = source.width; srcH = source.height;
  } else if (source instanceof HTMLImageElement) {
    srcW = source.naturalWidth || source.width;
    srcH = source.naturalHeight || source.height;
  } else if (typeof source === 'string') {
    if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(source)) throw new Error('Use an embedded PNG, JPEG, or WebP image');
    // Decode and normalize to a PNG canvas before adding the layer.
    const img = new Image();
    img.onload = () => {
      try { addImageLayer(img, name); } catch (err) { setStatus('Import failed: ' + err.message, 'error'); }
    };
    img.onerror = () => setStatus('Import failed: image could not be decoded', 'error');
    img.src = source;
    return id;
  } else {
    srcW = w; srcH = h;
  }

  // Fit/center without upscaling beyond natural size
  const scale = Math.min(1, w / srcW, h / srcH);
  const dw = Math.round(srcW * scale);
  const dh = Math.round(srcH * scale);
  const dx = Math.round((w - dw) / 2);
  const dy = Math.round((h - dh) / 2);
  if (!Number.isFinite(srcW) || !Number.isFinite(srcH) || srcW < 1 || srcH < 1) throw new Error('Image has invalid dimensions');
  ctx.drawImage(source, dx, dy, Math.max(1, dw), Math.max(1, dh));
  // Reject tainted rasterization before changing the document.
  off.toDataURL('image/png');
  pushHistory();

  const newLayer = { id, name: name || 'Imported', visible: true, opacity: 1, data: '' };
  doc.layers.push(newLayer);
  layerCanvases.push({ id, offscreen: off });
  setActiveLayerId(id);
  composite();
  refreshLayersPanel();
  scheduleAutosave();
  return id;
}

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────────

document.addEventListener('keydown', (evt) => {
  // Always: Ctrl/Cmd+Shift+X → home
  if ((evt.ctrlKey || evt.metaKey) && evt.shiftKey && evt.code === 'KeyX') {
    evt.preventDefault();
    window.ToolkitTabs ? window.ToolkitTabs.goHome() : (window.location.href = '/');
    return;
  }

  const tag = document.activeElement && document.activeElement.tagName.toLowerCase();
  if (restoringHistory || document.querySelector('.modal-backdrop.show')) return;
  const typing = document.activeElement?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';

  if (typing) return;

  // Undo/redo work even while typing (except in plain text fields they'll be handled by browser — but we check first)
  if ((evt.ctrlKey || evt.metaKey) && evt.shiftKey && (evt.key === 'z' || evt.key === 'Z')) {
    evt.preventDefault(); redo(); return;
  }
  if ((evt.ctrlKey || evt.metaKey) && (evt.key === 'y' || evt.key === 'Y')) {
    evt.preventDefault(); redo(); return;
  }
  if ((evt.ctrlKey || evt.metaKey) && (evt.key === 'z' || evt.key === 'Z') && !evt.shiftKey) {
    evt.preventDefault(); undo(); return;
  }

  if (typing) return;

  // Tool keys
  if (!evt.ctrlKey && !evt.metaKey && !evt.altKey) {
    if (evt.key === 'v') setTool('move');
    if (evt.key === 'b') setTool('brush');
    if (evt.key === 'e') setTool('eraser');
    if (evt.key === 'g') setTool('fill');
    if (evt.key === 'i') setTool('eyedropper');
    if (evt.key === 'm') setTool('select-rect');
    if (evt.key === 't') setTool('text');
    if (evt.key === 'c') setTool('crop');
  }

  // Brush size
  if (evt.key === '[') {
    setBrushSize(Math.max(1, brushSize - 2));
    const slider = document.getElementById('brush-size');
    if (slider) slider.value = brushSize;
  }
  if (evt.key === ']') {
    setBrushSize(Math.min(200, brushSize + 2));
    const slider = document.getElementById('brush-size');
    if (slider) slider.value = brushSize;
  }

  // Tool-specific keys (Escape, Enter, Delete)
  handleToolKey(evt);
});

// ─── LOAD DOC FROM SERVER ─────────────────────────────────────────────────────

function loadDataUrlIntoCanvas(dataUrl, canvas) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve();
    };
    img.onerror = () => reject(new Error('A saved layer could not be decoded'));
    img.src = dataUrl;
  });
}

async function loadDoc(serverDoc) {
  validateImageDocument(serverDoc);
  const canvas = serverDoc.canvas || { w: 1280, h: 800, bg: '#ffffff' };
  doc.canvas.w = canvas.w;
  doc.canvas.h = canvas.h;
  doc.canvas.bg = canvas.bg;
  doc.layers.length = 0;
  layerCanvases.length = 0;

  const layers = serverDoc.layers || [];
  for (const l of layers) {
    const off = document.createElement('canvas');
    off.width = canvas.w;
    off.height = canvas.h;
    if (l.data) {
      await loadDataUrlIntoCanvas(l.data, off);
    }
    doc.layers.push({ id: l.id, name: l.name, visible: l.visible !== false, opacity: l.opacity ?? 1, data: '' });
    layerCanvases.push({ id: l.id, offscreen: off });
  }

  if (doc.layers.length === 0) {
    initDefaultDoc(canvas.w, canvas.h, canvas.bg);
  }
  setActiveLayerId(doc.layers[doc.layers.length - 1].id);
}

function initDefaultDoc(w = 1280, h = 800, bg = '#ffffff') {
  doc.canvas.w = w;
  doc.canvas.h = h;
  doc.canvas.bg = bg;
  doc.layers.length = 0;
  layerCanvases.length = 0;

  const id = nextLayerId();
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  if (bg !== 'transparent') {
    const c = off.getContext('2d');
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
  }
  doc.layers.push({ id, name: 'Background', visible: true, opacity: 1, data: '' });
  layerCanvases.push({ id, offscreen: off });
  setActiveLayerId(id);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

async function init() {
  document.body.inert = true;
  updateHistoryButtons();

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') || null;
  setImageId(id);

  // Hide quality row initially
  const qualityRow = document.getElementById('quality-row');
  if (qualityRow) qualityRow.style.display = 'none';

  if (id) {
    try {
      const data = await api(`/api/images/${id}`);
      const image = data.image || data;
      serverRevision = image.revision ?? 0;
      const name = image.name || 'Untitled image';
      setImageName(name);
      imageNameInput.value = name;
      document.title = name + ' — ImageVendor';

      const serverDoc = image.document || {};
      await loadDoc(serverDoc);
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      console.error('Failed to load image', err);
      setImageId(null);
      initDefaultDoc();
      setStatus('Load failed — original image is protected. Reload to retry.', 'error');
      setCanvasDimensions(doc.canvas.w, doc.canvas.h);
      composite();
      refreshLayersPanel();
      fitToScreen();
      return;
    }

    setCanvasDimensions(doc.canvas.w, doc.canvas.h);
    composite();
    refreshLayersPanel();
    fitToScreen();
    setStatus('Saved', '');
  } else {
    // No id — show gallery
    initDefaultDoc();
    setCanvasDimensions(doc.canvas.w, doc.canvas.h);
    composite();
    refreshLayersPanel();
    fitToScreen();
    await populateGalleryGrid();
    openModal('gallery-modal');
  }
}

init().catch(err => {
  setImageId(null);
  setStatus('Initialization failed: ' + err.message, 'error');
}).finally(() => { document.body.inert = false; });
