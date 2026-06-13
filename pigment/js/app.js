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
    el.setAttribute('stroke-width', item.strokeWidth || 2);
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
    if (el) svg.appendChild(el);
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

function scheduleAutosave() {
  hasUnsavedEdits = true;
  setStatus('Edited', '');
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(doAutosave, 1500);
}

async function generateThumbnail() {
  try {
    const { w, h } = doc.canvas;
    const maxW = 280;
    const scale = Math.min(1, maxW / w);
    const tw = Math.round(w * scale);
    const th = Math.round(h * scale);

    const svgStr = buildSheetSVG();
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    URL.revokeObjectURL(url);

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
  const { w, h, bg } = doc.canvas;
  const gradDefs = new Map();

  function resolveStr(p) {
    if (!isGradient(p)) return p;
    const id = 'grad-' + gradKey(p);
    if (!gradDefs.has(id)) gradDefs.set(id, p);
    return 'url(#' + id + ')';
  }

  function buildGradDefStr(id, p) {
    if (p.grad === 'radial') {
      const stops = (p.stops || []).map(s =>
        `<stop offset="${s.at}" stop-color="${s.color}"/>`
      ).join('');
      return `<radialGradient id="${id}">${stops}</radialGradient>`;
    }
    const rad = (Number(p.angle) || 0) * Math.PI / 180;
    const x1 = (0.5 - Math.cos(rad) / 2).toFixed(4);
    const y1 = (0.5 - Math.sin(rad) / 2).toFixed(4);
    const x2 = (0.5 + Math.cos(rad) / 2).toFixed(4);
    const y2 = (0.5 + Math.sin(rad) / 2).toFixed(4);
    const stops = (p.stops || []).map(s =>
      `<stop offset="${s.at}" stop-color="${s.color}"/>`
    ).join('');
    return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
  }

  const bodyLines = [];
  bodyLines.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="${bg}"/>`);
  for (let i = 0; i < doc.items.length; i++) {
    const item = doc.items[i];
    if (item.kind === 'stroke') {
      const d = buildPathD(item.points, false);
      bodyLines.push(`<path fill="none" stroke="${resolveStr(item.color)}" stroke-width="${item.size}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`);
    } else if (item.kind === 'region') {
      const d = buildPathD(item.points, true);
      bodyLines.push(`<path fill="${resolveStr(item.fill)}" stroke="${item.stroke || '#1e1e1e'}" stroke-width="${item.strokeWidth || 2}" stroke-linejoin="round" d="${d}"/>`);
    } else if (item.kind === 'art') {
      const piece = getColoring(item.artId);
      if (!piece) continue;
      const sx = item.w / 200;
      const sy = item.h / 200;
      const fills = item.fills || {};
      // Parse markup and apply fills
      const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      tmp.innerHTML = piece.markup;
      let innerParts = [];
      for (const child of Array.from(tmp.children)) {
        const regionId = child.getAttribute('data-region');
        if (regionId) {
          child.setAttribute('fill', resolveStr(fills[regionId] || '#ffffff'));
        }
        innerParts.push(new XMLSerializer().serializeToString(child));
      }
      bodyLines.push(`<g transform="translate(${item.x} ${item.y}) scale(${sx} ${sy})">${innerParts.join('')}</g>`);
    }
  }

  // Build defs string if any gradients were used
  let defsStr = '';
  if (gradDefs.size > 0) {
    const defParts = [];
    for (const [id, p] of gradDefs) {
      defParts.push(buildGradDefStr(id, p));
    }
    defsStr = `<defs>${defParts.join('')}</defs>\n`;
  }

  const lines = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`, defsStr + bodyLines.join('\n'), '</svg>'];
  return lines.join('\n');
}

// Export for interop.js
export { buildSheetSVG };

let saveRetryTimer = null;

async function doAutosave(isRetry = false) {
  if (!paintingId) return;
  if (isSaving) {
    saveQueued = true;
    return;
  }
  isSaving = true;
  saveQueued = false;
  setStatus('Saving…', 'saving');

  try {
    const thumbnail = await generateThumbnail();
    await api(`/api/paintings/${paintingId}`, {
      method: 'PUT',
      body: {
        name: paintingName,
        document: { version: 1, canvas: doc.canvas, items: doc.items },
        thumbnail,
      },
    });
    hasUnsavedEdits = false;
    setStatus('Saved', '');
  } catch (err) {
    if (redirectIfSignedOut(err)) { isSaving = false; return; }
    setStatus('Save failed', 'error');
    if (!isRetry) {
      saveRetryTimer = setTimeout(() => doAutosave(true), 4000);
    }
  } finally {
    isSaving = false;
    if (saveQueued) {
      scheduleAutosave();
    }
  }
}

// ─── TOOLS – POINTER HANDLING ────────────────────────────────────────────────

let isDrawing = false;
let activeStrokeIndex = -1;
let eraserActive = false;
let eraserHistoryPushed = false;

svg.addEventListener('pointerdown', onPointerDown);
svg.addEventListener('pointermove', onPointerMove);
svg.addEventListener('pointerup', onPointerUp);
svg.addEventListener('pointerleave', onPointerUp);

function onPointerDown(evt) {
  if (evt.button !== 0) return;
  evt.preventDefault();
  try { svg.setPointerCapture(evt.pointerId); } catch { /* synthetic or stale pointer */ }

  const pt = screenToCanvas(evt);

  if (currentTool === 'brush') {
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
    eraseAt(pt, evt);
  } else if (currentTool === 'fill') {
    doFill(evt, pt);
  }
}

function onPointerMove(evt) {
  if (currentTool === 'brush' && isDrawing) {
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
    eraseAt(pt, evt);
  }
}

function onPointerUp(evt) {
  if (currentTool === 'brush' && isDrawing) {
    isDrawing = false;
    // Ensure at least a dot for single-point strokes
    const item = doc.items[activeStrokeIndex];
    if (item && item.points.length === 1) {
      // Already handled by buildPathD (M x,y L x,y)
    }
    activeStrokeIndex = -1;
    scheduleAutosave();
  } else if (currentTool === 'eraser' && eraserActive) {
    eraserActive = false;
    if (eraserHistoryPushed) {
      reRender();
      scheduleAutosave();
    }
  }
}

function eraseAt(pt, evt) {
  const before = doc.items.length;
  const toRemove = new Set();
  for (let i = 0; i < doc.items.length; i++) {
    const item = doc.items[i];
    if (item.kind !== 'stroke') continue;
    const radius = item.size / 2 + 6;
    for (const p of item.points) {
      const dx = p[0] - pt[0];
      const dy = p[1] - pt[1];
      if (Math.sqrt(dx * dx + dy * dy) <= radius) {
        toRemove.add(i);
        break;
      }
    }
  }
  if (toRemove.size > 0) {
    if (!eraserHistoryPushed) {
      pushHistory();
      eraserHistoryPushed = true;
    }
    doc.items = doc.items.filter((_, i) => !toRemove.has(i));
    reRender();
  }
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
  const tag = document.activeElement && document.activeElement.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  if (evt.key === 'z' && evt.ctrlKey && evt.shiftKey) { evt.preventDefault(); redo(); return; }
  if (evt.key === 'y' && evt.ctrlKey) { evt.preventDefault(); redo(); return; }
  if (evt.key === 'z' && evt.ctrlKey) { evt.preventDefault(); undo(); return; }

  // Tool shortcuts
  if (!evt.ctrlKey && !evt.metaKey && !evt.altKey) {
    if (evt.key === 'b') setTool('brush');
    if (evt.key === 'e') setTool('eraser');
    if (evt.key === 'f') setTool('fill');
  }
});

// ─── TOOL BUTTONS ────────────────────────────────────────────────────────────

function setTool(name) {
  currentTool = name;
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === name);
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
  if (el) el.classList.add('show');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
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

document.getElementById('gallery-btn').addEventListener('click', () => {
  openModal('gallery-modal');
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
paintingNameInput.addEventListener('change', async () => {
  paintingName = paintingNameInput.value || 'Untitled painting';
  document.title = paintingName + ' — Pigment';
  if (!paintingId) return;
  try {
    await api(`/api/paintings/${paintingId}`, {
      method: 'PUT',
      body: { name: paintingName },
    });
    setStatus('Saved', '');
  } catch (err) {
    if (!redirectIfSignedOut(err)) setStatus('Save failed', 'error');
  }
});

// ─── BEFORE UNLOAD ───────────────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
  if (!hasUnsavedEdits || !paintingId) return;
  const body = JSON.stringify({
    document: { version: 1, canvas: doc.canvas, items: doc.items },
  });
  fetch(`/api/paintings/${paintingId}`, {
    method: 'PUT',
    keepalive: true,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'pigment',
    },
    body,
  }).catch(() => {});
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
    const thumb = p.thumbnail ? `<img src="${p.thumbnail}" alt="">` : '<img alt="">';
    card.innerHTML = `<div class="g-thumb">${thumb}</div><div class="g-name">${p.name || 'Untitled'}</div><button class="g-del">✕</button>`;
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
      paintingName = painting.name || 'Untitled painting';
      paintingNameInput.value = paintingName;
      document.title = paintingName + ' — Pigment';
      const loaded = painting.document || { version: 1, canvas: { w: 1600, h: 1000, bg: '#ffffff' }, items: [] };
      doc.canvas = loaded.canvas || doc.canvas;
      doc.items = loaded.items || [];
    } catch (err) {
      if (redirectIfSignedOut(err)) return;
      console.error('Failed to load painting', err);
    }
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

init();
