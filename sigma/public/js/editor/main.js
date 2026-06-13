// Sigma editor bootstrap and interaction controller.
import { api, redirectIfSignedOut } from '../api.js';
import {
  state, events, getNode, getSelectedNodes, setSelection, expandGroups,
  pushUndo, undo, redo, canUndo, canRedo, snapshot, markDirty,
  baseNode, rotatePoint, nodeAABB, selectionBBox,
  deleteSelected, duplicateSelected, copySelected, pasteClipboard,
  groupSelection, ungroupSelection, reorder,
} from './state.js';
import {
  initRender, renderDoc, renderOverlay, applyView,
  screenToWorld, worldToScreen, eventPoint, setMarquee, setPenPreview,
} from './render.js';
import { initLayers } from './panels.js';
import { initProps } from './panels.js';
import { exportFile, makeThumbnail } from './export.js';
import { CLIPART, getClipart } from './clipart.js';

const $ = (id) => document.getElementById(id);
const svg = $('viewport');
const canvasWrap = $('canvas-wrap');

const DEFAULT_FILL = '#d9d9d9';
const DEFAULT_STROKE = '#3b2c20';

// ---------------- project load / save ----------------
const projectId = window.location.pathname.split('/').pop();

async function loadProject() {
  try {
    const data = await api(`/api/projects/${projectId}`);
    state.projectId = projectId;
    state.projectName = data.project.name;
    const doc = data.project.document;
    if (doc && doc.artboard && Array.isArray(doc.nodes)) {
      state.doc.artboard = { name: 'Artboard', w: 1280, h: 800, bg: '#ffffff', ...doc.artboard };
      state.doc.nodes = doc.nodes;
    }
    $('project-name').value = state.projectName;
    document.title = `${state.projectName} — Sigma`;
  } catch (err) {
    if (!redirectIfSignedOut(err)) window.location.href = '/dashboard';
    throw err;
  }
}

let saveTimer = null;
let saving = false;
let saveQueued = false;

function setSaveStatus(text, cls = '') {
  const el = $('save-status');
  el.textContent = text;
  el.className = cls;
}

function scheduleSave() {
  setSaveStatus('Edited', 'saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 1500);
}

async function saveNow() {
  if (saving) { saveQueued = true; return; }
  if (!state.dirty) return;
  saving = true;
  state.dirty = false;
  setSaveStatus('Saving…', 'saving');
  try {
    const thumbnail = await makeThumbnail();
    const body = { document: { version: 1, artboard: state.doc.artboard, nodes: state.doc.nodes } };
    if (thumbnail) body.thumbnail = thumbnail;
    await api(`/api/projects/${projectId}`, { method: 'PUT', body });
    setSaveStatus('Saved');
  } catch (err) {
    state.dirty = true;
    setSaveStatus('Save failed — retrying', 'error');
    if (!redirectIfSignedOut(err)) setTimeout(saveNow, 5000);
  } finally {
    saving = false;
    if (saveQueued) { saveQueued = false; saveNow(); }
  }
}

window.addEventListener('beforeunload', () => {
  if (state.dirty) {
    clearTimeout(saveTimer);
    // Best effort flush; keepalive allows custom headers unlike sendBeacon.
    fetch(`/api/projects/${projectId}`, {
      method: 'PUT',
      keepalive: true,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'sigma' },
      body: JSON.stringify({ document: { version: 1, artboard: state.doc.artboard, nodes: state.doc.nodes } }),
    }).catch(() => {});
  }
});

$('project-name').addEventListener('change', async (e) => {
  const name = e.target.value.trim();
  if (!name) { e.target.value = state.projectName; return; }
  try {
    await api(`/api/projects/${projectId}`, { method: 'PUT', body: { name } });
    state.projectName = name;
    document.title = `${name} — Sigma`;
  } catch (err) {
    if (!redirectIfSignedOut(err)) e.target.value = state.projectName;
  }
});

// ---------------- tools ----------------
const HINTS = {
  pen: 'Pen — click to add points · click the first point to close · Enter to finish · Esc to cancel',
  clipart: 'Click anywhere on the canvas to place the clipart',
  text: 'Click on the canvas to add text',
  hand: 'Drag to pan around the canvas',
};

function setTool(tool) {
  if (state.tool === 'pen' && tool !== 'pen') cancelPen();
  state.tool = tool;
  if (tool !== 'clipart') state.pendingClipart = null;
  canvasWrap.dataset.tool = tool;
  for (const btn of document.querySelectorAll('.tool-btn[data-tool]')) {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  }
  $('clipart-btn').classList.toggle('active', tool === 'clipart');
  const hint = $('hint-bar');
  if (HINTS[tool]) { hint.textContent = HINTS[tool]; hint.hidden = false; }
  else hint.hidden = true;
  events.emit('tool');
}

for (const btn of document.querySelectorAll('.tool-btn[data-tool]')) {
  btn.addEventListener('click', () => setTool(btn.dataset.tool));
}

// ---------------- viewport: zoom & pan ----------------
function setZoom(zoom, screenAnchor) {
  const z = Math.min(16, Math.max(0.05, zoom));
  const anchor = screenAnchor || { x: svg.clientWidth / 2, y: svg.clientHeight / 2 };
  const before = screenToWorld(anchor);
  state.zoom = z;
  state.pan.x = anchor.x - before.x * z;
  state.pan.y = anchor.y - before.y * z;
  applyView();
  renderDoc();
  $('zoom-label').textContent = Math.round(z * 100) + '%';
}

function fitArtboard() {
  const ab = state.doc.artboard;
  const cw = svg.clientWidth, ch = svg.clientHeight;
  const z = Math.min(16, Math.max(0.05, Math.min(cw / ab.w, ch / ab.h) * 0.85));
  state.zoom = z;
  state.pan.x = (cw - ab.w * z) / 2;
  state.pan.y = (ch - ab.h * z) / 2;
  applyView();
  renderDoc();
  $('zoom-label').textContent = Math.round(z * 100) + '%';
}

svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const factor = Math.exp(-e.deltaY * 0.002);
    setZoom(state.zoom * factor, eventPoint(e));
  } else {
    state.pan.x -= e.shiftKey ? e.deltaY : e.deltaX;
    state.pan.y -= e.shiftKey ? 0 : e.deltaY;
    applyView();
  }
}, { passive: false });

$('zoom-in-btn').addEventListener('click', () => setZoom(state.zoom * 1.25));
$('zoom-out-btn').addEventListener('click', () => setZoom(state.zoom / 1.25));
$('zoom-label').addEventListener('click', () => setZoom(1));
$('zoom-fit-btn').addEventListener('click', fitArtboard);

// ---------------- pointer interaction ----------------
let drag = null;       // active drag descriptor
let spaceHeld = false;
let pen = null;        // { points: [...] } while pen path in progress

function capturePointer(e) {
  try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic or stale pointer */ }
}

function startStates() {
  return getSelectedNodes().map(n => JSON.parse(JSON.stringify(n)));
}

svg.addEventListener('pointerdown', (e) => {
  if (state.editingTextId) commitTextEdit();
  svg.focus({ preventScroll: true });
  const sp = eventPoint(e);
  const wp = screenToWorld(sp);

  // pan: middle button, space, or hand tool
  if (e.button === 1 || spaceHeld || state.tool === 'hand') {
    drag = { kind: 'pan', start: sp, pan0: { ...state.pan } };
    canvasWrap.classList.add('panning');
    capturePointer(e);
    return;
  }
  if (e.button !== 0) return;

  if (state.tool === 'pen') {
    handlePenClick(wp, sp);
    return;
  }

  if (state.tool === 'text') {
    createTextAt(wp);
    return;
  }

  if (state.tool === 'clipart' && state.pendingClipart) {
    placeClipart(wp);
    return;
  }

  if (['rect', 'ellipse', 'line', 'polygon', 'star'].includes(state.tool)) {
    drag = { kind: 'draw', start: wp, node: null, snap: snapshot() };
    capturePointer(e);
    return;
  }

  // ---- select tool ----
  const handle = e.target.dataset && e.target.dataset.handle;
  if (handle && state.selection.length) {
    const nodes = getSelectedNodes();
    const single = nodes.length === 1 ? nodes[0] : null;
    const box = selectionBBox();
    drag = {
      kind: handle === 'rotate' ? 'rotate' : 'resize',
      handle, start: wp, snap: snapshot(), moved: false,
      nodes0: startStates(), box0: box, single,
      center: { x: box.x + box.w / 2, y: box.y + box.h / 2 },
      angle0: Math.atan2(wp.y - (box.y + box.h / 2), wp.x - (box.x + box.w / 2)),
    };
    capturePointer(e);
    return;
  }

  const el = e.target.closest && e.target.closest('[data-node-id]');
  if (el) {
    const id = el.getAttribute('data-node-id');
    const node = getNode(id);
    if (node && !node.locked) {
      let sel;
      if (e.shiftKey) {
        const cur = new Set(state.selection);
        const ids = e.ctrlKey || e.metaKey ? [id] : expandGroups([id]);
        const has = ids.every(i => cur.has(i));
        ids.forEach(i => has ? cur.delete(i) : cur.add(i));
        sel = [...cur];
        setSelection(sel, { expand: false });
      } else if (!state.selection.includes(id)) {
        // Ctrl-click selects just the node inside a group (deep select).
        sel = e.ctrlKey || e.metaKey ? [id] : null;
        setSelection(sel || [id], { expand: !(e.ctrlKey || e.metaKey) });
      }
      drag = {
        kind: 'move', start: wp, snap: snapshot(), moved: false,
        nodes0: startStates(),
      };
      capturePointer(e);
      return;
    }
  }

  // empty space -> marquee
  drag = {
    kind: 'marquee', start: wp,
    base: e.shiftKey ? [...state.selection] : [],
  };
  if (!e.shiftKey) setSelection([]);
  svg.setPointerCapture(e.pointerId);
});

svg.addEventListener('pointermove', (e) => {
  const sp = eventPoint(e);
  const wp = screenToWorld(sp);

  if (pen) {
    setPenPreview({ points: pen.points, cursor: wp });
  }
  if (!drag) return;

  if (drag.kind === 'pan') {
    state.pan.x = drag.pan0.x + (sp.x - drag.start.x);
    state.pan.y = drag.pan0.y + (sp.y - drag.start.y);
    applyView();
    return;
  }

  if (drag.kind === 'draw') {
    updateDraw(drag, wp, e.shiftKey);
    return;
  }

  if (drag.kind === 'move') {
    let dx = wp.x - drag.start.x, dy = wp.y - drag.start.y;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    if (!drag.moved) { drag.moved = true; pushUndo(drag.snap); }
    if (e.shiftKey) { Math.abs(dx) > Math.abs(dy) ? dy = 0 : dx = 0; }
    const sel = getSelectedNodes();
    sel.forEach((n, i) => {
      const n0 = drag.nodes0.find(s => s.id === n.id);
      if (!n0 || n.locked) return;
      n.x = Math.round(n0.x + dx);
      n.y = Math.round(n0.y + dy);
    });
    markDirty();
    return;
  }

  if (drag.kind === 'resize') {
    if (!drag.moved) { drag.moved = true; pushUndo(drag.snap); }
    applyResize(drag, wp, e.shiftKey);
    markDirty();
    return;
  }

  if (drag.kind === 'rotate') {
    if (!drag.moved) { drag.moved = true; pushUndo(drag.snap); }
    const angle = Math.atan2(wp.y - drag.center.y, wp.x - drag.center.x);
    let deltaDeg = (angle - drag.angle0) * 180 / Math.PI;
    const sel = getSelectedNodes();
    sel.forEach(n => {
      const n0 = drag.nodes0.find(s => s.id === n.id);
      if (!n0 || n.locked) return;
      let r = (n0.rotation || 0) + deltaDeg;
      if (e.shiftKey) r = Math.round(r / 15) * 15;
      n.rotation = Math.round(((r % 360) + 360) % 360 * 10) / 10;
    });
    markDirty();
    return;
  }

  if (drag.kind === 'marquee') {
    const x = Math.min(drag.start.x, wp.x), y = Math.min(drag.start.y, wp.y);
    const rect = { x, y, w: Math.abs(wp.x - drag.start.x), h: Math.abs(wp.y - drag.start.y) };
    setMarquee(rect);
    const hits = state.doc.nodes.filter(n => {
      if (!n.visible || n.locked) return false;
      const b = nodeAABB(n);
      return b.x < rect.x + rect.w && b.x + b.w > rect.x &&
             b.y < rect.y + rect.h && b.y + b.h > rect.y;
    }).map(n => n.id);
    setSelection([...new Set([...drag.base, ...hits])]);
  }
});

svg.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  canvasWrap.classList.remove('panning');

  if (d.kind === 'draw') {
    finishDraw(d);
  } else if (d.kind === 'marquee') {
    setMarquee(null);
  }
  renderOverlay();
});

svg.addEventListener('dblclick', (e) => {
  const el = e.target.closest && e.target.closest('[data-node-id]');
  if (!el) return;
  const node = getNode(el.getAttribute('data-node-id'));
  if (node && node.type === 'text' && !node.locked) {
    setSelection([node.id], { expand: false });
    startTextEdit(node);
  }
});

// ---------------- drawing shapes ----------------
function updateDraw(d, wp, shiftKey) {
  let x1 = d.start.x, y1 = d.start.y, x2 = wp.x, y2 = wp.y;
  if (shiftKey && state.tool !== 'line') {
    const s = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    x2 = x1 + Math.sign(x2 - x1 || 1) * s;
    y2 = y1 + Math.sign(y2 - y1 || 1) * s;
  }
  if (!d.node) {
    pushUndo(d.snap);
    d.node = makeShapeNode(state.tool, x1, y1);
    state.doc.nodes.push(d.node);
    setSelection([d.node.id]);
  }
  const n = d.node;
  if (state.tool === 'line') {
    if (shiftKey) {
      // snap to 45 degree increments
      const ang = Math.round(Math.atan2(y2 - y1, x2 - x1) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(x2 - x1, y2 - y1);
      x2 = x1 + Math.cos(ang) * len;
      y2 = y1 + Math.sin(ang) * len;
    }
    n.x = Math.min(x1, x2); n.y = Math.min(y1, y2);
    n.w = Math.max(0.01, Math.abs(x2 - x1));
    n.h = Math.max(0.01, Math.abs(y2 - y1));
    n.points = [
      [x1 - n.x, y1 - n.y],
      [x2 - n.x, y2 - n.y],
    ];
  } else {
    n.x = Math.min(x1, x2); n.y = Math.min(y1, y2);
    n.w = Math.max(0.01, Math.abs(x2 - x1));
    n.h = Math.max(0.01, Math.abs(y2 - y1));
  }
  markDirty();
}

function makeShapeNode(tool, x, y) {
  if (tool === 'line') {
    return baseNode('line', {
      x, y, w: 0.01, h: 0.01, points: [[0, 0], [0, 0]], closed: false,
      fill: 'none', stroke: DEFAULT_STROKE, strokeWidth: 3,
    });
  }
  const common = { x, y, w: 0.01, h: 0.01, fill: DEFAULT_FILL, stroke: 'none', strokeWidth: 0 };
  if (tool === 'rect') return baseNode('rect', { ...common, rx: 0 });
  if (tool === 'ellipse') return baseNode('ellipse', common);
  if (tool === 'polygon') return baseNode('polygon', { ...common, sides: 5 });
  if (tool === 'star') return baseNode('star', { ...common, sides: 5, innerRatio: 0.45 });
  return baseNode('rect', common);
}

function finishDraw(d) {
  if (!d.node) return; // click without drag: nothing created
  const n = d.node;
  if (n.w < 2 && n.h < 2) {
    // tiny drag -> sensible default size
    if (n.type === 'line') {
      n.points = [[0, 0], [100, 0]];
      n.w = 100; n.h = 0.01;
    } else {
      n.w = 100; n.h = 100;
    }
    markDirty();
  }
  setTool('select');
}

// ---------------- pen tool ----------------
function handlePenClick(wp, sp) {
  if (!pen) {
    pen = { points: [wp] };
  } else {
    const first = worldToScreen(pen.points[0]);
    if (pen.points.length > 2 && Math.hypot(sp.x - first.x, sp.y - first.y) < 9) {
      finishPen(true);
      return;
    }
    pen.points.push(wp);
  }
  setPenPreview({ points: pen.points, cursor: wp });
}

function finishPen(closed) {
  if (!pen) return;
  const pts = pen.points;
  pen = null;
  setPenPreview(null);
  if (pts.length < 2) return;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  const w = Math.max(0.01, Math.max(...xs) - x);
  const h = Math.max(0.01, Math.max(...ys) - y);
  pushUndo();
  const node = baseNode('path', {
    x, y, w, h,
    points: pts.map(p => [p.x - x, p.y - y]),
    closed: !!closed,
    fill: closed ? DEFAULT_FILL : 'none',
    stroke: DEFAULT_STROKE, strokeWidth: 3,
  });
  state.doc.nodes.push(node);
  setSelection([node.id]);
  markDirty();
  setTool('select');
}

function cancelPen() {
  pen = null;
  setPenPreview(null);
}

svg.addEventListener('dblclick', () => { if (pen) finishPen(false); });

// ---------------- resize math ----------------
function applyResize(d, wp, shiftKey) {
  const h = d.handle;
  const sel = getSelectedNodes();

  if (d.single) {
    const n = sel[0];
    const n0 = d.nodes0[0];
    if (!n || !n0 || n.locked) return;
    const rad = (n0.rotation || 0) * Math.PI / 180;
    const c0 = { x: n0.x + n0.w / 2, y: n0.y + n0.h / 2 };
    const lp = rotatePoint(wp, c0, -rad);
    let x1 = n0.x, y1 = n0.y, x2 = n0.x + n0.w, y2 = n0.y + n0.h;
    if (h.includes('w')) x1 = lp.x;
    if (h.includes('e')) x2 = lp.x;
    if (h.includes('n')) y1 = lp.y;
    if (h.includes('s')) y2 = lp.y;
    if (shiftKey && h.length === 2) {
      // proportional: match the larger relative change
      const sx = Math.abs(x2 - x1) / Math.max(0.01, n0.w);
      const sy = Math.abs(y2 - y1) / Math.max(0.01, n0.h);
      const s = Math.max(sx, sy);
      const nw = n0.w * s, nh = n0.h * s;
      if (h.includes('w')) x1 = x2 - nw; else x2 = x1 + nw;
      if (h.includes('n')) y1 = y2 - nh; else y2 = y1 + nh;
    }
    const nx = Math.min(x1, x2), ny = Math.min(y1, y2);
    const nw = Math.max(1, Math.abs(x2 - x1)), nh = Math.max(1, Math.abs(y2 - y1));
    // keep the anchor fixed in world space
    const c1l = { x: nx + nw / 2, y: ny + nh / 2 };
    const c1w = rotatePoint(c1l, c0, rad);
    applyNodeResize(n, n0, c1w.x - nw / 2, c1w.y - nh / 2, nw, nh);
    return;
  }

  // multi-select: scale everything relative to the anchored side/corner of the box
  const b = d.box0;
  let ax = h.includes('w') ? b.x + b.w : b.x;        // anchor x
  let ay = h.includes('n') ? b.y + b.h : b.y;        // anchor y
  let sx = 1, sy = 1;
  if (h.includes('e')) sx = (wp.x - ax) / Math.max(0.01, b.w);
  if (h.includes('w')) sx = (ax - wp.x) / Math.max(0.01, b.w);
  if (h.includes('s')) sy = (wp.y - ay) / Math.max(0.01, b.h);
  if (h.includes('n')) sy = (ay - wp.y) / Math.max(0.01, b.h);
  if (h === 'n' || h === 's') sx = 1;
  if (h === 'e' || h === 'w') sy = 1;
  if (shiftKey && h.length === 2) { sx = sy = Math.max(sx, sy); }
  sx = Math.max(0.02, sx); sy = Math.max(0.02, sy);

  sel.forEach(n => {
    const n0 = d.nodes0.find(s => s.id === n.id);
    if (!n0 || n.locked) return;
    applyNodeResize(n, n0,
      ax + (n0.x - ax) * sx,
      ay + (n0.y - ay) * sy,
      Math.max(1, n0.w * sx), Math.max(1, n0.h * sy));
  });
}

function applyNodeResize(n, n0, x, y, w, h) {
  if (n.type === 'text') {
    const s = h / Math.max(1, n0.h);
    n.fontSize = Math.min(600, Math.max(4, (n0.fontSize || 24) * s));
    n.x = x; n.y = y;
    return; // w/h re-measured on render
  }
  if ((n.type === 'path' || n.type === 'line') && n0.points) {
    const sx = w / Math.max(0.01, n0.w), sy = h / Math.max(0.01, n0.h);
    n.points = n0.points.map(p => [p[0] * sx, p[1] * sy]);
  }
  n.x = x; n.y = y; n.w = w; n.h = h;
}

// ---------------- text ----------------
function createTextAt(wp) {
  pushUndo();
  const node = baseNode('text', {
    x: wp.x, y: wp.y - 15, w: 10, h: 30,
    text: '', fontSize: 24, fontFamily: 'Arial', fontWeight: 400,
    align: 'left', fill: '#1e1e1e',
  });
  state.doc.nodes.push(node);
  setSelection([node.id]);
  markDirty();
  setTool('select');
  startTextEdit(node, true);
}

let editingIsNew = false;

function startTextEdit(node, isNew = false) {
  state.editingTextId = node.id;
  editingIsNew = isNew;
  const ta = $('text-editor');
  const sp = worldToScreen({ x: node.x, y: node.y });
  const fs = (node.fontSize || 24) * state.zoom;
  ta.value = node.text || '';
  ta.style.left = (sp.x - 2) + 'px';
  ta.style.top = (sp.y - 2) + 'px';
  ta.style.fontSize = fs + 'px';
  ta.style.lineHeight = 1.25;
  ta.style.fontFamily = node.fontFamily || 'Arial';
  ta.style.fontWeight = node.fontWeight || 400;
  ta.style.color = node.fill || '#1e1e1e';
  ta.style.minWidth = '60px';
  ta.hidden = false;
  sizeTextarea(ta);
  ta.focus();
  if (!isNew) ta.select();
  renderDoc(); // hides selection chrome via editingTextId
  // dim the original while editing
  const el = svg.querySelector(`text[data-node-id="${node.id}"]`);
  if (el) el.style.opacity = 0.25;
}

function sizeTextarea(ta) {
  ta.style.width = 'auto';
  ta.style.height = 'auto';
  ta.style.width = Math.max(60, ta.scrollWidth + 12) + 'px';
  ta.style.height = Math.max(20, ta.scrollHeight) + 'px';
}

$('text-editor').addEventListener('input', (e) => sizeTextarea(e.target));
$('text-editor').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') commitTextEdit();
});
$('text-editor').addEventListener('blur', () => commitTextEdit());

function commitTextEdit() {
  const id = state.editingTextId;
  if (!id) return;
  const ta = $('text-editor');
  const node = getNode(id);
  state.editingTextId = null;
  ta.hidden = true;
  if (!node) return;
  const text = ta.value.replace(/\s+$/, '');
  if (!text.trim()) {
    state.doc.nodes = state.doc.nodes.filter(n => n.id !== id);
    setSelection([]);
  } else if (text !== node.text) {
    if (!editingIsNew) pushUndo();
    node.text = text;
  }
  editingIsNew = false;
  markDirty();
}

// ---------------- clipart ----------------
function buildClipartGrid() {
  const grid = $('clipart-grid');
  grid.replaceChildren();
  for (const art of CLIPART) {
    const item = document.createElement('button');
    item.className = 'clip-item';
    item.type = 'button';
    item.title = art.name;
    // Trusted markup from our own library.
    item.innerHTML = `<svg viewBox="0 0 100 100">${art.markup}</svg><span class="clip-name">${art.name}</span>`;
    item.addEventListener('click', () => {
      state.pendingClipart = art.id;
      hideModal('clipart-modal');
      setTool('clipart');
    });
    grid.appendChild(item);
  }
}

function placeClipart(wp) {
  const art = getClipart(state.pendingClipart);
  if (!art) { setTool('select'); return; }
  pushUndo();
  const size = 140;
  const node = baseNode('clipart', {
    x: wp.x - size / 2, y: wp.y - size / 2, w: size, h: size,
    clipartId: art.id, tint: '#c96f2e',
  });
  node.name = art.name;
  state.doc.nodes.push(node);
  setSelection([node.id]);
  markDirty();
  setTool('select');
}

$('clipart-btn').addEventListener('click', () => showModal('clipart-modal'));

// ---------------- modals ----------------
function showModal(id) { $(id).classList.add('show'); }
function hideModal(id) { $(id).classList.remove('show'); }

for (const btn of document.querySelectorAll('[data-close]')) {
  btn.addEventListener('click', () => hideModal(btn.dataset.close));
}
for (const backdrop of document.querySelectorAll('.modal-backdrop')) {
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.classList.remove('show');
  });
}

$('export-btn').addEventListener('click', () => {
  $('export-scope').querySelector('[value="selection"]').disabled = !state.selection.length;
  if (!state.selection.length) $('export-scope').value = 'artboard';
  showModal('export-modal');
});
$('export-format').addEventListener('change', (e) => {
  $('export-scale-row').style.display = e.target.value === 'svg' ? 'none' : '';
});
$('export-go').addEventListener('click', async () => {
  const btn = $('export-go');
  btn.disabled = true;
  try {
    await exportFile({
      format: $('export-format').value,
      scale: Number($('export-scale').value) || 1,
      scope: $('export-scope').value,
    });
    hideModal('export-modal');
  } catch (err) {
    alert('Export failed: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

$('help-btn').addEventListener('click', () => showModal('help-modal'));

// ---------------- keyboard ----------------
function inTextInput(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

window.addEventListener('keydown', (e) => {
  if (inTextInput(e)) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();

  if (key === ' ' && !spaceHeld) { spaceHeld = true; canvasWrap.classList.add('panning'); e.preventDefault(); return; }

  if (ctrl && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (ctrl && key === 'y') { e.preventDefault(); redo(); return; }
  if (ctrl && key === 'd') { e.preventDefault(); duplicateSelected(); return; }
  if (ctrl && key === 'c') { e.preventDefault(); copySelected(); return; }
  if (ctrl && key === 'v') { e.preventDefault(); pasteClipboard(); return; }
  if (ctrl && key === 'a') {
    e.preventDefault();
    setSelection(state.doc.nodes.filter(n => n.visible && !n.locked).map(n => n.id), { expand: false });
    return;
  }
  if (ctrl && key === 'g') { e.preventDefault(); e.shiftKey ? ungroupSelection() : groupSelection(); return; }
  if (ctrl && key === 's') { e.preventDefault(); clearTimeout(saveTimer); saveNow(); return; }
  if (ctrl && key === '[') { e.preventDefault(); reorder(e.altKey ? 'back' : 'backward'); return; }
  if (ctrl && key === ']') { e.preventDefault(); reorder(e.altKey ? 'front' : 'forward'); return; }
  if (ctrl && key === '0') { e.preventDefault(); setZoom(1); return; }
  if (ctrl && key === '1') { e.preventDefault(); fitArtboard(); return; }
  if (ctrl) return;

  if (key === 'delete' || key === 'backspace') { e.preventDefault(); deleteSelected(); return; }
  if (key === 'escape') {
    if (pen) { cancelPen(); return; }
    if (state.pendingClipart) { setTool('select'); return; }
    setSelection([]);
    return;
  }
  if (key === 'enter' && pen) { e.preventDefault(); finishPen(false); return; }

  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
    const nodes = getSelectedNodes().filter(n => !n.locked);
    if (!nodes.length) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    pushUndo();
    for (const n of nodes) {
      if (key === 'arrowleft') n.x -= step;
      if (key === 'arrowright') n.x += step;
      if (key === 'arrowup') n.y -= step;
      if (key === 'arrowdown') n.y += step;
    }
    markDirty();
    return;
  }

  const toolKeys = {
    v: 'select', h: 'hand', r: 'rect', o: 'ellipse', l: 'line',
    g: 'polygon', s: 'star', p: 'pen', t: 'text',
  };
  if (toolKeys[key]) { setTool(toolKeys[key]); return; }
  if (key === 'c') { showModal('clipart-modal'); return; }
  if (key === '?') { showModal('help-modal'); return; }
  if (key === '+' || key === '=') { setZoom(state.zoom * 1.25); return; }
  if (key === '-') { setZoom(state.zoom / 1.25); return; }
});

window.addEventListener('keyup', (e) => {
  if (e.key === ' ') { spaceHeld = false; if (!drag) canvasWrap.classList.remove('panning'); }
});

// ---------------- undo/redo buttons ----------------
$('undo-btn').addEventListener('click', undo);
$('redo-btn').addEventListener('click', redo);
events.on('history', () => {
  $('undo-btn').disabled = !canUndo();
  $('redo-btn').disabled = !canRedo();
});

// ---------------- events wiring ----------------
events.on('doc', () => { renderDoc(); scheduleSave(); });
events.on('selection', () => renderOverlay());

window.addEventListener('resize', () => { applyView(); });

// ---------------- boot ----------------
(async function boot() {
  await loadProject();
  initRender(svg);
  initLayers();
  initProps();
  buildClipartGrid();
  renderDoc();
  fitArtboard();
  events.emit('selection');
  events.emit('history');
  state.dirty = false;
  setSaveStatus('Saved');
  setTool('select');
})();
