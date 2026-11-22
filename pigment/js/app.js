import { assertRasterSource, assertRasterDimensions } from '/pigment/js/raster.js';
// Pigment – main engine
// type="module" — loaded by app.html

import { COLORING, getColoring } from '/pigment/js/library.js';

// ─── API HELPER ──────────────────────────────────────────────────────────────

export async function api(path, options = {}) {
  const opts = {
    method: options.method || 'GET',
    headers: { 'X-Requested-With': 'pigment' },
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
    window.location.href = '/auth?next=' + encodeURIComponent('/pigment/app');
    return true;
  }
  return false;
}

// ─── STATE ───────────────────────────────────────────────────────────────────

let doc = { version: 1, canvas: { w: 1600, h: 1000, bg: '#ffffff' }, items: [] };
let currentTool = 'brush';
let currentColor = '#e0342f';
let currentSize = 8;
let paintingId = null;
let paintingName = 'Untitled painting';

// ─── GRADIENT HELPERS ────────────────────────────────────────────────────────

export function isGradient(p) { return !!(p && typeof p === 'object' && p.grad); }

function gradKey(p) {
  let s = JSON.stringify(p), h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return (h >>> 0).toString(36);
}

let liveDefs = null;

function ensureGradientDef(p) {
  const id = 'grad-' + gradKey(p);
  if (!liveDefs) return id;
  if (liveDefs.querySelector('[id="' + id + '"]')) return id;
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, p.grad === 'radial' ? 'radialGradient' : 'linearGradient');
  g.setAttribute('id', id);
  if (p.grad !== 'radial') {
    const rad = (Number(p.angle) || 0) * Math.PI / 180;
    g.setAttribute('x1', (0.5 - Math.cos(rad) / 2).toFixed(4));
    g.setAttribute('y1', (0.5 - Math.sin(rad) / 2).toFixed(4));
    g.setAttribute('x2', (0.5 + Math.cos(rad) / 2).toFixed(4));
    g.setAttribute('y2', (0.5 + Math.sin(rad) / 2).toFixed(4));
  }
  for (const s of (p.stops || [])) {
    const st = document.createElementNS(ns, 'stop');
    st.setAttribute('offset', s.at);
    st.setAttribute('stop-color', s.color);
    g.appendChild(st);
  }
  liveDefs.appendChild(g);
  return id;
}

function resolvePaint(p) {
  return isGradient(p) ? 'url(#' + ensureGradientDef(p) + ')' : p;
}

export function flattenPaint(p) {
  return isGradient(p) ? ((p.stops && p.stops[0] && p.stops[0].color) || '#000000') : p;
}

// ─── GRADIENT MODE STATE ─────────────────────────────────────────────────────

let gradientMode = false;
let currentGradient = {
  grad: 'linear',
  angle: 90,
  stops: [{ at: 0, color: '#e0342f' }, { at: 1, color: '#2a6fdb' }],
};

function currentPaint() {
  return gradientMode ? structuredClone(currentGradient) : currentColor;
}

const undoStack = [];
const redoStack = [];

export function getDoc() { return { canvas: doc.canvas, items: doc.items }; }
export function getName() { return paintingName; }

export function pushHistory() {
  if (!documentReady) throw new Error('Painting is not ready');
  undoStack.push(JSON.stringify({ canvas: doc.canvas, items: doc.items }));
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function updateHistoryButtons() {
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

// ─── SAVE STATUS ─────────────────────────────────────────────────────────────

export function setStatus(text, cls) {
  const el = document.getElementById('save-status');
  if (!el) return;
  el.textContent = text;
  el.className = cls || '';
}

// ─── RENDERING ───────────────────────────────────────────────────────────────

const svg = document.getElementById('paint-svg');
const canvasWrap = document.getElementById('canvas-wrap');

function fitSvg() {
  const { w, h } = doc.canvas;
  const cw = canvasWrap.clientWidth;
  const ch = canvasWrap.clientHeight;
  const scale = Math.min(cw / w, ch / h);
  const dw = Math.round(w * scale);
  const dh = Math.round(h * scale);
  svg.style.width = dw + 'px';
  svg.style.height = dh + 'px';
}

function screenToCanvas(evt) {
  const rect = svg.getBoundingClientRect();
  const { w, h } = doc.canvas;
  const scaleX = w / rect.width;
  const scaleY = h / rect.height;
  return [
    (evt.clientX - rect.left) * scaleX,
    (evt.clientY - rect.top) * scaleY,
  ];
}

function buildPathD(points, closed) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) {
    const [x, y] = points[0];
    return `M${x},${y} L${x},${y}`;
  }
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L${points[i][0]},${points[i][1]}`;
  }
  if (closed) d += ' Z';
  return d;
}

function renderItem(item, idx) {
  if (item.kind === 'stroke') {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', resolvePaint(item.color));
    el.setAttribute('stroke-width', item.size);
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    const d = buildPathD(item.points, false);
    el.setAttribute('d', d || `M0,0 L0,0`);
    el.setAttribute('data-item-index', idx);
    return el;
  }
  if (item.kind === 'region') {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('fill', resolvePaint(item.fill));
    el.setAttribute('stroke', item.stroke || '#1e1e1e');
    el.setAttribute('stroke-width', item.strokeWidth ?? 2);
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('d', buildPathD(item.points, true));
    el.setAttribute('data-item-index', idx);
    return el;
  }
  if (item.kind === 'art') {
    const piece = getColoring(item.artId);
    if (!piece) return null;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const sx = item.w / 200;
    const sy = item.h / 200;
    g.setAttribute('transform', `translate(${item.x} ${item.y}) scale(${sx} ${sy})`);
    g.setAttribute('data-item-index', idx);
    // Parse markup
    const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tmp.innerHTML = piece.markup;
    const fills = item.fills || {};
    for (const child of Array.from(tmp.children)) {
      const regionId = child.getAttribute('data-region');
      if (regionId) {
        child.setAttribute('fill', resolvePaint(fills[regionId] || '#ffffff'));
        // keep data-region for hit-testing
      }
      g.appendChild(child.cloneNode(true));
    }
    return g;
  }
  if (item.kind === 'image') {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    el.setAttributeNS('http://www.w3.org/1999/xlink', 'href', item.src);
    el.setAttribute('href', item.src);
    el.setAttribute('x', item.x);
    el.setAttribute('y', item.y);
    el.setAttribute('width', item.w);
    el.setAttribute('height', item.h);
    el.setAttribute('preserveAspectRatio', 'none');
    if (item.rotation) el.setAttribute('transform', `rotate(${item.rotation} ${item.x + item.w / 2} ${item.y + item.h / 2})`);
    el.setAttribute('data-item-index', idx);
    return el;
  }
  return null;
}

function reRender() {
  // Clear everything and rebuild from scratch
  svg.innerHTML = '';
  // Re-add the background rect
  const { w, h } = doc.canvas;
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', 0);
  bg.setAttribute('y', 0);
  bg.setAttribute('width', w);
  bg.setAttribute('height', h);
  bg.setAttribute('fill', doc.canvas.bg);
  bg.setAttribute('data-bg', '1');
  svg.appendChild(bg);
  // Fresh defs for gradient definitions
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  svg.appendChild(defs);
  liveDefs = defs;
  for (let i = 0; i < doc.items.length; i++) {
    const el = renderItem(doc.items[i], i);
    if (el) { el.setAttribute('opacity', doc.items[i].opacity ?? 1); svg.appendChild(el); }
  }
}

function initSvg() {
  svg.setAttribute('viewBox', `0 0 ${doc.canvas.w} ${doc.canvas.h}`);
  reRender();
  fitSvg();
}

export function reRenderAndSave() {
  reRender();
  scheduleAutosave();
}

// ─── AUTOSAVE ────────────────────────────────────────────────────────────────

let autosaveTimer = null;
let isSaving = false;
let saveQueued = false;
let hasUnsavedEdits = false;
let editRevision = 0;
let documentReady = false;

function scheduleAutosave() {
  hasUnsavedEdits = true;
  editRevision++;
  if (saveConflict) { setStatus(conflictMessage, 'error'); return; }
  setStatus('Edited', '');
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(doAutosave, 1500);
}

async function generateThumbnail() {
  try {
    const { w, h } = doc.canvas;
    const maxW = 280;
    const scale = Math.min(1, maxW / w);
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    const svgStr = buildSheetSVG();
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    let img;
    try {
      img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = url;
      });
    } finally { URL.revokeObjectURL(url); }

    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = doc.canvas.bg || '#ffffff';
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(img, 0, 0, tw, th);
    const dataURL = canvas.toDataURL('image/jpeg', 0.7);
    // Check size ~200KB
    if (dataURL.length > 200 * 1024 * 1.37) return null; // base64 ~37% overhead
    return dataURL;
  } catch {
    return null;
  }
}

function buildSheetSVG() {
  // Serialize DOM attributes instead of interpolating imported paint/source strings.
  const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.setAttribute('viewBox', `0 0 ${doc.canvas.w} ${doc.canvas.h}`);
  root.setAttribute('width', doc.canvas.w);
  root.setAttribute('height', doc.canvas.h);
  const oldDefs = liveDefs;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  root.appendChild(defs);
  liveDefs = defs;
  try {
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', doc.canvas.w); bg.setAttribute('height', doc.canvas.h);
    bg.setAttribute('fill', doc.canvas.bg); root.appendChild(bg);
    doc.items.forEach((item, idx) => {
      const el = renderItem(item, idx);
      if (el) { el.setAttribute('opacity', item.opacity ?? 1); root.appendChild(el); }
    });
    return new XMLSerializer().serializeToString(root);
  } finally { liveDefs = oldDefs; }
}

// Export for interop.js
export { buildSheetSVG };

let serverRevision = 0;
let saveConflict = false;
const conflictMessage = "Save conflict: changed in another tab. Local edits kept; export them using Export, then reload to resume saving.";
let saveRetryTimer = null;

async function doAutosave(isRetry = false) {
  if (saveConflict || !paintingId || !documentReady) return;
  clearTimeout(saveRetryTimer);
  if (isSaving) {
    saveQueued = true;
    return;
  }
  isSaving = true;
  saveQueued = false;
  setStatus('Saving…', 'saving');
  const revision = editRevision;
  const snapshot = structuredClone({ name: paintingName, document: { version: 1, canvas: doc.canvas, items: doc.items } });

  try {
    const thumbnail = await generateThumbnail();
    const result = await api(`/api/paintings/${paintingId}`, {
      method: 'PUT',
      body: {
        ...snapshot,
        baseRevision: serverRevision,
        thumbnail,
      },
    });
    serverRevision = result?.painting?.revision ?? serverRevision + 1;
    hasUnsavedEdits = editRevision !== revision;
    setStatus(hasUnsavedEdits ? 'Edited' : 'Saved', '');
    if (hasUnsavedEdits) saveQueued = true;
  } catch (err) {
    if (redirectIfSignedOut(err)) { isSaving = false; return; }
    if (err.status === 409) {
      saveConflict = true;
      hasUnsavedEdits = true; saveQueued = false;
      clearTimeout(autosaveTimer); clearTimeout(saveRetryTimer);
      setStatus(conflictMessage, 'error');
      return;
    }
    setStatus('Save failed', 'error');
    if (!isRetry) {
      saveRetryTimer = setTimeout(() => doAutosave(true), 4000);
    }
  } finally {
    isSaving = false;
    if (saveQueued && !saveConflict) {
      scheduleAutosave();
    }
  }
}

// ─── TOOLS – POINTER HANDLING ────────────────────────────────────────────────

let activePointerId = null;
let isDrawing = false;
let activeStrokeIndex = -1;
let eraserActive = false;
let eraserHistoryPushed = false;
let shapeGesture = null;

function shapeItem(gesture, evt) {
  const end = screenToCanvas(evt);
  let dx = end[0] - gesture.start[0], dy = end[1] - gesture.start[1];
  if (evt.shiftKey) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * side;
    dy = (dy < 0 ? -1 : 1) * side;
  }
  const x = Math.min(gesture.start[0], gesture.start[0] + dx);
  const y = Math.min(gesture.start[1], gesture.start[1] + dy);
  const w = Math.abs(dx), h = Math.abs(dy);
  const rect = svg.getBoundingClientRect();
  // Ignore clicks and sub-three-pixel dimensions at the current zoom.
  if (![x, y, w, h].every(Number.isFinite) || w * rect.width / doc.canvas.w < 3 || h * rect.height / doc.canvas.h < 3) return null;
  const points = gesture.tool === 'rectangle'
    ? [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
    : Array.from({ length: 48 }, (_, i) => {
      const t = i / 48 * Math.PI * 2;
      return [x + w / 2 + Math.cos(t) * w / 2, y + h / 2 + Math.sin(t) * h / 2];
    });
  return { kind: 'region', points, fill: gesture.paint, stroke: '#1e1e1e', strokeWidth: 2 };
}

function previewShape(evt) {
  shapeGesture.item = shapeItem(shapeGesture, evt);
  shapeGesture.preview?.remove();
  shapeGesture.preview = null;
  if (!shapeGesture.item) return;
  const el = renderItem(shapeGesture.item, -1);
  el.removeAttribute('data-item-index');
  el.setAttribute('data-shape-preview', shapeGesture.tool);
  el.setAttribute('pointer-events', 'none');
  svg.appendChild(el);
  shapeGesture.preview = el;
}

svg.addEventListener('pointerdown', onPointerDown);
svg.addEventListener('pointermove', onPointerMove);
svg.addEventListener('pointerup', onPointerUp);
svg.addEventListener('pointercancel', onPointerUp);
svg.addEventListener('lostpointercapture', onPointerUp);

function onPointerDown(evt) {
  if (evt.button !== 0 || !documentReady || activePointerId !== null) return;
  activePointerId = evt.pointerId;
  evt.preventDefault();
  try { svg.setPointerCapture(evt.pointerId); } catch { /* synthetic or stale pointer */ }

  const pt = screenToCanvas(evt);

  if (currentTool === 'rectangle' || currentTool === 'ellipse') {
    shapeGesture = { tool: currentTool, start: pt, paint: currentPaint(), item: null, preview: null };
  } else if (currentTool === 'brush') {
    pushHistory();
    const item = {
      kind: 'stroke',
      points: [pt],
      color: currentPaint(),
      size: currentSize,
    };
    doc.items.push(item);
    activeStrokeIndex = doc.items.length - 1;
    isDrawing = true;
    // Live render
    const el = renderItem(item, activeStrokeIndex);
    if (el) svg.appendChild(el);
  } else if (currentTool === 'eraser') {
    eraserActive = true;
    eraserHistoryPushed = false;
    eraserGesture = { start: pt, moved: false };
    eraseAt(pt, evt);
  } else if (currentTool === 'fill') {
    doFill(evt, pt);
  }
}

function onPointerMove(evt) {
  if (evt.pointerId !== activePointerId) return;
  if (shapeGesture) {
    previewShape(evt);
  } else if (currentTool === 'brush' && isDrawing) {
    const pt = screenToCanvas(evt);
    const item = doc.items[activeStrokeIndex];
    if (!item) return;
    const last = item.points[item.points.length - 1];
    const dx = pt[0] - last[0];
    const dy = pt[1] - last[1];
    if (Math.sqrt(dx * dx + dy * dy) >= 2) {
      item.points.push(pt);
      // Update live stroke element
      const el = svg.querySelector(`[data-item-index="${activeStrokeIndex}"]`);
      if (el) {
        el.setAttribute('d', buildPathD(item.points, false));
      }
    }
  } else if (currentTool === 'eraser' && eraserActive) {
    const pt = screenToCanvas(evt);
    if (eraserGesture && Math.hypot(pt[0] - eraserGesture.start[0], pt[1] - eraserGesture.start[1]) > 4) eraserGesture.moved = true;
    eraseAt(pt, evt);
  }
}

function onPointerUp(evt) {
  if (evt && evt.pointerId !== activePointerId) return;
  const pointer = activePointerId;
  const gesture = shapeGesture;
  if (gesture && evt?.type === 'pointerup') gesture.item = shapeItem(gesture, evt);
  shapeGesture = null;
  gesture?.preview?.remove();
  activePointerId = null;
  if (pointer !== null && svg.hasPointerCapture(pointer)) svg.releasePointerCapture(pointer);
  if (gesture) {
    if (evt?.type === 'pointerup' && gesture.item) {
      pushHistory();
      doc.items.push(gesture.item);
      reRender();
      scheduleAutosave();
    } else {
      reRender();
    }
  } else if (isDrawing) {
    isDrawing = false;
    // Ensure at least a dot for single-point strokes
    const item = doc.items[activeStrokeIndex];
    if (item && item.points.length === 1) {
      // Already handled by buildPathD (M x,y L x,y)
    }
    activeStrokeIndex = -1;
    scheduleAutosave();
  } else if (eraserActive) {
    eraserActive = false;
    // A still click that erased no mark removes the picture under it (coloring page or
    // imported image). Drags never do, so cleaning up a drawing cannot wipe its page.
    if (evt?.type === 'pointerup' && eraserGesture && !eraserGesture.moved && !eraserHistoryPushed) {
      eraseObjectAt(eraserGesture.start);
    }
    eraserGesture = null;
    if (eraserHistoryPushed) {
      reRender();
      scheduleAutosave();
    }
  }
}

function eraseAt(pt, evt) {
  const hits = [];
  for (let i = 0; i < doc.items.length; i++) {
    if (eraserHits(doc.items[i], pt)) hits.push(i);
  }
  // Dragging erases marks only (strokes and shapes); pictures are removed by a click.
  const toRemove = new Set(hits.filter(i => doc.items[i].kind === 'stroke' || doc.items[i].kind === 'region'));
  if (toRemove.size > 0) {
    if (!eraserHistoryPushed) {
      pushHistory();
      eraserHistoryPushed = true;
    }
    doc.items = doc.items.filter((_, i) => !toRemove.has(i));
    reRender();
  }
}

// Current eraser gesture: where it started and whether it has moved.
let eraserGesture = null;

// Remove the topmost coloring page or image under pt (one undo step).
function eraseObjectAt(pt) {
  for (let i = doc.items.length - 1; i >= 0; i--) {
    const item = doc.items[i];
    if ((item.kind === 'art' || item.kind === 'image') && eraserHits(item, pt)) {
      pushHistory();
      doc.items.splice(i, 1);
      eraserHistoryPushed = true;
      return;
    }
  }
}

// The eraser removes whole objects it touches: brush strokes, shapes, imported images
// and coloring pages. Shapes count as touched inside their fill or on their outline.
function eraserHits(item, pt) {
  if (item.kind === 'stroke') {
    return item.points.length > 0 && distanceToPolyline(pt, item.points, false) <= item.size / 2 + 6;
  }
  if (item.kind === 'region') {
    if (!item.points || item.points.length < 2) return false;
    const filled = item.fill && item.fill !== 'none';
    return (filled && insidePolygon(pt, item.points)) ||
      distanceToPolyline(pt, item.points, true) <= (item.strokeWidth || 2) / 2 + 6;
  }
  if (item.kind === 'image' || item.kind === 'art') {
    if (item.rotation) {
      // Test against the unrotated box by rotating the point the other way.
      const cx = item.x + item.w / 2, cy = item.y + item.h / 2, a = -item.rotation * Math.PI / 180;
      const dx = pt[0] - cx, dy = pt[1] - cy;
      pt = [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
    }
    return pt[0] >= item.x && pt[0] <= item.x + item.w && pt[1] >= item.y && pt[1] <= item.y + item.h;
  }
  return false;
}

// Distance from pt to the polyline through points (closed adds the last-to-first edge).
function distanceToPolyline(pt, points, closed) {
  let best = Infinity;
  const n = points.length;
  const edges = closed ? n : n - 1;
  for (let j = 0; j < Math.max(edges, 1); j++) {
    const prev = points[j], p = points[(j + 1) % n] || prev;
    const vx = p[0] - prev[0], vy = p[1] - prev[1];
    const t = Math.max(0, Math.min(1, ((pt[0] - prev[0]) * vx + (pt[1] - prev[1]) * vy) / (vx * vx + vy * vy || 1)));
    best = Math.min(best, Math.hypot(prev[0] + t * vx - pt[0], prev[1] + t * vy - pt[1]));
  }
  return best;
}

// Even-odd point-in-polygon test.
function insidePolygon(pt, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function doFill(evt, pt) {
  const hit = document.elementFromPoint(evt.clientX, evt.clientY);
  if (!hit) return;

  // Check if hit element has data-region and is inside an art group
  const regionId = hit.getAttribute('data-region');
  if (regionId) {
    // Walk up to find the art group (has data-item-index)
    let el = hit;
    let artGroup = null;
    while (el && el !== svg) {
      if (el.hasAttribute('data-item-index')) {
        artGroup = el;
        break;
      }
      el = el.parentElement;
    }
    if (artGroup) {
      const idx = parseInt(artGroup.getAttribute('data-item-index'), 10);
      const item = doc.items[idx];
      if (item && item.kind === 'art') {
        pushHistory();
        if (!item.fills) item.fills = {};
        item.fills[regionId] = currentPaint();
        reRender();
        scheduleAutosave();
        return;
      }
    }
  }

  // Check if it maps to a kind:'region' or kind:'stroke' item
  let el2 = hit;
  while (el2 && el2 !== svg) {
    if (el2.hasAttribute('data-item-index')) {
      const idx = parseInt(el2.getAttribute('data-item-index'), 10);
      const item = doc.items[idx];
      if (item) {
        if (item.kind === 'image') {
          // image items are not colorable — ignore fill tool
          return;
        }
        if (item.kind === 'region') {
          pushHistory();
          item.fill = currentPaint();
          reRender();
          scheduleAutosave();
          return;
        } else if (item.kind === 'stroke') {
          pushHistory();
          item.color = currentPaint();
          reRender();
          scheduleAutosave();
          return;
        }
      }
      break;
    }
    el2 = el2.parentElement;
  }
  // background or empty — do nothing
}

// ─── UNDO / REDO ─────────────────────────────────────────────────────────────

function undo() {
  onPointerUp();
  if (undoStack.length === 0) return;
  redoStack.push(JSON.stringify({ canvas: doc.canvas, items: doc.items }));
  const snap = JSON.parse(undoStack.pop());
  doc.canvas = snap.canvas;
  doc.items = snap.items;
  updateHistoryButtons();
  initSvg();
  scheduleAutosave();
}

function redo() {
  onPointerUp();
  if (redoStack.length === 0) return;
  undoStack.push(JSON.stringify({ canvas: doc.canvas, items: doc.items }));
  const snap = JSON.parse(redoStack.pop());
  doc.canvas = snap.canvas;
  doc.items = snap.items;
  updateHistoryButtons();
  initSvg();
  scheduleAutosave();
}

document.getElementById('undo-btn').addEventListener('click', undo);
document.getElementById('redo-btn').addEventListener('click', redo);

document.addEventListener('keydown', (evt) => {
  // Ctrl/Cmd+Shift+X → back to the Toolkit home. Checked before the field
  // guard below so it works even while a text field is focused.
  if ((evt.ctrlKey || evt.metaKey) && evt.shiftKey && evt.code === 'KeyX') {
    evt.preventDefault();
    window.location.href = '/';
    return;
  }

  if (evt.key === 'Escape' && shapeGesture) { evt.preventDefault(); onPointerUp(); return; }

  const tag = document.activeElement && document.activeElement.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable || document.querySelector('.modal-backdrop.show')) return;

  if (evt.key.toLowerCase() === 'z' && (evt.ctrlKey || evt.metaKey) && evt.shiftKey) { evt.preventDefault(); redo(); return; }
  if (evt.key.toLowerCase() === 'y' && (evt.ctrlKey || evt.metaKey)) { evt.preventDefault(); redo(); return; }
  if (evt.key.toLowerCase() === 'z' && (evt.ctrlKey || evt.metaKey)) { evt.preventDefault(); undo(); return; }

  // Tool shortcuts
  if (!evt.ctrlKey && !evt.metaKey && !evt.altKey) {
    if (evt.key === 'b') setTool('brush');
    if (evt.key === 'e') setTool('eraser');
    if (evt.key === 'f') setTool('fill');
    if (evt.key === 'r') setTool('rectangle');
    if (evt.key === 'o') setTool('ellipse');
  }
});

// ─── TOOL BUTTONS ────────────────────────────────────────────────────────────

function setTool(name) {
  onPointerUp();
  currentTool = name;
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === name);
    btn.setAttribute('aria-pressed', String(btn.dataset.tool === name));
  });
}

document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
});

// ─── COLOR / SIZE ─────────────────────────────────────────────────────────────

const colorPicker = document.getElementById('color-picker');
const palette = document.getElementById('palette');

colorPicker.addEventListener('input', () => {
  currentColor = colorPicker.value;
  // Disable gradient mode when a solid color is picked
  gradientMode = false;
  const gradToggle = document.getElementById('gradient-toggle');
  if (gradToggle) { gradToggle.textContent = 'Off'; gradToggle.classList.remove('active'); gradToggle.setAttribute('aria-pressed', 'false'); }
  // Select matching swatch or clear selection
  let matched = false;
  document.querySelectorAll('#palette .swatch').forEach(sw => {
    if (sw.dataset.color.toLowerCase() === currentColor.toLowerCase()) {
      sw.classList.add('selected');
      matched = true;
    } else {
      sw.classList.remove('selected');
    }
  });
});

palette.addEventListener('click', (evt) => {
  const sw = evt.target.closest('.swatch');
  if (!sw) return;
  currentColor = sw.dataset.color;
  colorPicker.value = currentColor;
  // Disable gradient mode when a solid color is picked
  gradientMode = false;
  const gradToggle = document.getElementById('gradient-toggle');
  if (gradToggle) { gradToggle.textContent = 'Off'; gradToggle.classList.remove('active'); gradToggle.setAttribute('aria-pressed', 'false'); }
  document.querySelectorAll('#palette .swatch').forEach(s => s.classList.remove('selected'));
  sw.classList.add('selected');
});

document.getElementById('brush-size').addEventListener('input', (evt) => {
  currentSize = parseInt(evt.target.value, 10);
  const label = document.getElementById('brush-size-value');
  if (label) label.textContent = String(currentSize);
});

// Init currentSize and currentColor from DOM
currentSize = parseInt(document.getElementById('brush-size').value, 10);
currentColor = colorPicker.value;

// ─── GRADIENT PICKER ─────────────────────────────────────────────────────────

function updateGradPreview() {
  const preview = document.getElementById('grad-preview');
  if (!preview) return;
  const a = currentGradient.stops[0].color;
  const b = currentGradient.stops[1].color;
  if (currentGradient.grad === 'radial') {
    preview.style.background = `radial-gradient(circle, ${a}, ${b})`;
  } else {
    preview.style.background = `linear-gradient(${currentGradient.angle}deg, ${a}, ${b})`;
  }
}

function rebuildCurrentGradient() {
  const typeEl = document.getElementById('grad-type');
  const angleEl = document.getElementById('grad-angle');
  const stopA = document.getElementById('grad-stop-a');
  const stopB = document.getElementById('grad-stop-b');
  if (!typeEl || !angleEl || !stopA || !stopB) return;
  const type = typeEl.value;
  currentGradient = {
    grad: type === 'radial' ? 'radial' : 'linear',
    angle: Number(angleEl.value),
    stops: [{ at: 0, color: stopA.value }, { at: 1, color: stopB.value }],
  };
  // Hide angle slider for radial
  angleEl.classList.toggle('grad-angle-hidden', type === 'radial');
  updateGradPreview();
}

// Gradient toggle button
const gradToggleBtn = document.getElementById('gradient-toggle');
if (gradToggleBtn) {
  gradToggleBtn.addEventListener('click', () => {
    gradientMode = !gradientMode;
    if (gradientMode) {
      rebuildCurrentGradient();
      gradToggleBtn.textContent = 'On';
      gradToggleBtn.classList.add('active');
      gradToggleBtn.setAttribute('aria-pressed', 'true');
      // Deselect solid swatches
      document.querySelectorAll('#palette .swatch').forEach(s => s.classList.remove('selected'));
    } else {
      gradToggleBtn.textContent = 'Off';
      gradToggleBtn.classList.remove('active');
      gradToggleBtn.setAttribute('aria-pressed', 'false');
    }
  });
}

// Gradient controls — update currentGradient on any change
['grad-stop-a', 'grad-stop-b', 'grad-type', 'grad-angle'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', rebuildCurrentGradient);
    el.addEventListener('change', rebuildCurrentGradient);
  }
});

// Init gradient state from DOM controls
rebuildCurrentGradient();

// ─── CLEAR ───────────────────────────────────────────────────────────────────

document.getElementById('clear-btn').addEventListener('click', () => {
  if (!confirm('Clear the whole canvas?')) return;
  pushHistory();
  doc.items = [];
  reRender();
  scheduleAutosave();
});

// ─── LIBRARY ─────────────────────────────────────────────────────────────────

function populateLibrary() {
  const grid = document.getElementById('library-grid');
  grid.innerHTML = '';
  for (const piece of COLORING) {
    const tile = document.createElement('div');
    tile.className = 'lib-item';
    tile.tabIndex = 0;
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-label', piece.name);
    tile.addEventListener('keydown', activateTile);
    tile.innerHTML = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">${piece.markup}</svg><div class="lib-name">${piece.name}</div>`;
    tile.addEventListener('click', () => {
      pushHistory();
      const size = Math.min(doc.canvas.w, doc.canvas.h) * 0.5;
      const art = {
        kind: 'art',
        artId: piece.id,
        x: (doc.canvas.w - size) / 2,
        y: (doc.canvas.h - size) / 2,
        w: size,
        h: size,
        fills: {},
      };
      doc.items.push(art);
      setTool('fill');
      closeModal('library-modal');
      reRender();
      scheduleAutosave();
    });
    grid.appendChild(tile);
  }
}

// ─── MODALS ──────────────────────────────────────────────────────────────────

function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el._opener = document.activeElement;
    el.classList.add('show');
    el.querySelector('.modal').setAttribute('role', 'dialog');
    el.querySelector('.modal').setAttribute('aria-modal', 'true');
    el.querySelector('.modal').setAttribute('aria-label', el.querySelector('h2').textContent);
    el.querySelector('button, input, select, [tabindex]').focus();
  }
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('show'); el._opener?.focus(); }
}

// Close buttons
document.querySelectorAll('.modal-close[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

// Backdrop click
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', (evt) => {
    if (evt.target === backdrop) closeModal(backdrop.id);
  });
});

document.getElementById('gallery-btn').addEventListener('click', async () => {
  openModal('gallery-modal');
  populateGalleryGrid(await loadGallery());
});

document.getElementById('library-btn').addEventListener('click', () => {
  populateLibrary();
  openModal('library-modal');
});

document.getElementById('export-btn').addEventListener('click', () => {
  openModal('export-modal');
});

document.getElementById('import-btn').addEventListener('click', () => {
  // Lazily import interop to avoid top-level cycles
  import('/pigment/js/interop.js').then(m => m.openImport());
  openModal('import-modal');
});

// ─── EXPORT ──────────────────────────────────────────────────────────────────

const exportGo = document.getElementById('export-go');
exportGo.addEventListener('click', async () => {
  const mode = document.getElementById('export-mode').value;
  const { exportToSigma, downloadSVG, downloadPNG } = await import('/pigment/js/interop.js');
  if (mode === 'sigma') {
    exportGo.disabled = true;
    try {
      await exportToSigma();
    } finally {
      exportGo.disabled = false;
    }
    closeModal('export-modal');
  } else if (mode === 'svg') {
    downloadSVG();
    closeModal('export-modal');
  } else if (mode === 'png') {
    downloadPNG();
    closeModal('export-modal');
  }
});

// ─── PAINTING NAME ───────────────────────────────────────────────────────────

const paintingNameInput = document.getElementById('painting-name');
paintingNameInput.addEventListener('input', () => {
  if (!documentReady) return;
  paintingName = paintingNameInput.value.trim() || 'Untitled painting';
  document.title = paintingName + ' — Pigment';
  scheduleAutosave();
});

// ─── BEFORE UNLOAD ───────────────────────────────────────────────────────────

window.addEventListener('beforeunload', (evt) => {
  if (!hasUnsavedEdits || !paintingId) return;
  evt.preventDefault();
  evt.returnValue = '';

});

// ─── GALLERY ─────────────────────────────────────────────────────────────────

async function loadGallery() {
  try {
    const list = await api('/api/paintings');
    return Array.isArray(list) ? list : (list.paintings || []);
  } catch (err) {
    redirectIfSignedOut(err);
    return [];
  }
}

function populateGalleryGrid(list) {
  const grid = document.getElementById('gallery-grid');
  grid.innerHTML = '';
  if (list.length === 0) {
    grid.innerHTML = '<p style="opacity:.6;padding:1rem;">No paintings yet.</p>';
    return;
  }
  for (const p of list) {
    const card = document.createElement('div');
    card.className = 'gallery-item';
    card.innerHTML = '<div class="g-thumb"><img alt=""></div><div class="g-name"></div><button class="g-del">✕</button>';
    if (p.thumbnail) card.querySelector('img').src = p.thumbnail;
    card.querySelector('.g-name').textContent = p.name || 'Untitled';
    card.querySelector('.g-del').setAttribute('aria-label', 'Delete ' + (p.name || 'Untitled'));
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Open ' + (p.name || 'Untitled'));
    card.addEventListener('keydown', activateTile);
    card.querySelector('.g-del').addEventListener('click', async (evt) => {
      evt.stopPropagation();
      if (!confirm(`Delete "${p.name}"?`)) return;
      try {
        await api(`/api/paintings/${p.id}`, { method: 'DELETE' });
        const updated = await loadGallery();
        populateGalleryGrid(updated);
      } catch (err) {
        if (!redirectIfSignedOut(err)) alert('Could not delete painting.');
      }
    });
    card.addEventListener('click', () => {
      window.location.href = '/pigment/app?id=' + p.id;
    });
    grid.appendChild(card);
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

window.addEventListener('resize', fitSvg);

async function init() {
  updateHistoryButtons();

  const params = new URLSearchParams(window.location.search);
  paintingId = params.get('id') || null;

  // Load gallery list (used in both branches)
  let list = [];
  try {
    list = await loadGallery();
  } catch { /* ignore */ }

  if (paintingId) {
    try {
      const data = await api(`/api/paintings/${paintingId}`);
      const painting = data.painting || data;
      serverRevision = painting.revision ?? 0;
      paintingName = painting.name || 'Untitled painting';
      paintingNameInput.value = paintingName;
      document.title = paintingName + ' — Pigment';
      const loaded = painting.document || { version: 1, canvas: { w: 1600, h: 1000, bg: '#ffffff' }, items: [] };
      if (!loaded.canvas || !Number.isInteger(loaded.canvas.w) || !Number.isInteger(loaded.canvas.h) || loaded.canvas.w < 1 || loaded.canvas.h < 1 || loaded.canvas.w > 8000 || loaded.canvas.h > 8000 || !Array.isArray(loaded.items)) throw new Error('Invalid painting document');
      for (const item of loaded.items) {
        if (item?.kind === 'image') { assertRasterSource(item.src); assertRasterDimensions(item.w, item.h); }
      }
      doc.canvas = loaded.canvas;
      doc.items = loaded.items || [];
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      console.error('Failed to load painting', err);
      paintingId = null;
      initSvg();
      setStatus('Load failed — reload to retry', 'error');
      return;
    }
    documentReady = true;
    initSvg();
    setStatus('Saved', '');
  } else {
    // No id: open gallery modal
    initSvg();
    populateGalleryGrid(list);
    openModal('gallery-modal');
  }

  document.getElementById('new-painting-btn').addEventListener('click', async () => {
    try {
      const data = await api('/api/paintings', {
        method: 'POST',
        body: { name: 'Untitled painting' },
      });
      const created = data.painting || data;
      window.location.href = '/pigment/app?id=' + created.id;
    } catch (err) {
      if (!redirectIfSignedOut(err)) alert('Could not create painting.');
    }
  });
}

function activateTile(evt) {
  if (evt.target === evt.currentTarget && (evt.key === 'Enter' || evt.key === ' ')) {
    evt.preventDefault(); evt.currentTarget.click();
  }
}
document.addEventListener('keydown', evt => {
  const modal = document.querySelector('.modal-backdrop.show');
  if (!modal) return;
  if (evt.key === 'Escape') { evt.preventDefault(); closeModal(modal.id); }
  if (evt.key === 'Tab') {
    const controls = [...modal.querySelectorAll('button:not(:disabled), input, select, [tabindex="0"]')];
    const first = controls[0], last = controls.at(-1);
    if (evt.shiftKey && document.activeElement === first) { evt.preventDefault(); last?.focus(); }
    else if (!evt.shiftKey && document.activeElement === last) { evt.preventDefault(); first?.focus(); }
  }
});
document.querySelectorAll('button[title]').forEach(btn => {
  if (!btn.hasAttribute('aria-label')) btn.setAttribute('aria-label', btn.title);
});
setTool('brush');
init();
