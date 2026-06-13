// Layers panel and properties panel.
import {
  state, events, getNode, getSelectedNodes, setSelection, pushUndo, markDirty,
  alignSelected, reorder, groupSelection, ungroupSelection,
} from './state.js';

const $ = (id) => document.getElementById(id);

const TYPE_ICONS = {
  rect: '▭', ellipse: '◯', polygon: '⬠', star: '★',
  path: '〰', line: '╱', text: 'T', clipart: '✦',
};

// ---------- layers ----------
let dragId = null;

export function initLayers() {
  events.on('doc', refreshLayers);
  events.on('selection', refreshLayers);
}

export function refreshLayers() {
  const list = $('layers-list');
  list.replaceChildren();
  const nodes = [...state.doc.nodes].reverse(); // top of stack first
  if (!nodes.length) {
    const empty = document.createElement('div');
    empty.className = 'layers-empty';
    empty.textContent = 'Draw something to get started.';
    list.appendChild(empty);
    return;
  }
  for (const n of nodes) {
    list.appendChild(layerItem(n));
  }
}

function layerItem(n) {
  const item = document.createElement('div');
  item.className = 'layer-item';
  if (state.selection.includes(n.id)) item.classList.add('selected');
  item.draggable = true;
  item.dataset.id = n.id;

  const type = document.createElement('span');
  type.className = 'l-type';
  type.textContent = TYPE_ICONS[n.type] || '▱';

  const name = document.createElement('span');
  name.className = 'l-name' + (n.visible ? '' : ' dim');
  name.textContent = n.name;
  name.title = n.name;

  const eye = document.createElement('button');
  eye.className = 'l-btn' + (n.visible ? '' : ' on');
  eye.title = n.visible ? 'Hide' : 'Show';
  eye.textContent = n.visible ? '👁' : '–';
  eye.addEventListener('click', (e) => {
    e.stopPropagation();
    pushUndo();
    n.visible = !n.visible;
    if (!n.visible) setSelection(state.selection.filter(id => id !== n.id), { expand: false });
    markDirty();
  });

  const lock = document.createElement('button');
  lock.className = 'l-btn' + (n.locked ? ' on' : '');
  lock.title = n.locked ? 'Unlock' : 'Lock';
  lock.textContent = n.locked ? '🔒' : '🔓';
  lock.addEventListener('click', (e) => {
    e.stopPropagation();
    pushUndo();
    n.locked = !n.locked;
    markDirty();
  });

  item.append(type);
  if (n.groupId) {
    const dot = document.createElement('span');
    dot.className = 'l-group-dot';
    dot.title = 'In a group';
    item.append(dot);
  }
  item.append(name, eye, lock);

  item.addEventListener('click', (e) => {
    if (e.shiftKey) {
      const sel = new Set(state.selection);
      sel.has(n.id) ? sel.delete(n.id) : sel.add(n.id);
      setSelection([...sel]);
    } else {
      setSelection([n.id]);
    }
  });

  name.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    const input = document.createElement('input');
    input.className = 'l-rename';
    input.value = n.name;
    input.maxLength = 60;
    name.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const v = input.value.trim();
      if (v && v !== n.name) { pushUndo(); n.name = v; markDirty(); }
      else refreshLayers();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') input.blur();
      if (ev.key === 'Escape') { input.value = n.name; input.blur(); }
      ev.stopPropagation();
    });
  });

  // drag to reorder
  item.addEventListener('dragstart', (e) => {
    dragId = n.id;
    e.dataTransfer.effectAllowed = 'move';
  });
  item.addEventListener('dragover', (e) => {
    if (!dragId || dragId === n.id) return;
    e.preventDefault();
    const rect = item.getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    item.classList.toggle('drop-above', above);
    item.classList.toggle('drop-below', !above);
  });
  item.addEventListener('dragleave', () => {
    item.classList.remove('drop-above', 'drop-below');
  });
  item.addEventListener('drop', (e) => {
    e.preventDefault();
    const above = item.classList.contains('drop-above');
    item.classList.remove('drop-above', 'drop-below');
    if (!dragId || dragId === n.id) return;
    const nodes = state.doc.nodes;
    const from = nodes.findIndex(x => x.id === dragId);
    if (from === -1) return;
    const [moved] = nodes.splice(from, 1);
    let to = nodes.findIndex(x => x.id === n.id);
    // List is reversed: "above" in the list = after in the array.
    if (above) to += 1;
    pushUndo();
    nodes.splice(to, 0, moved);
    markDirty();
    dragId = null;
  });
  item.addEventListener('dragend', () => { dragId = null; });

  return item;
}

// ---------- properties ----------
// Live-edit helper: push one undo entry per edit gesture.
function bindLive(input, apply) {
  let inGesture = false;
  input.addEventListener('input', () => {
    if (!inGesture) { pushUndo(); inGesture = true; }
    apply(input.value);
    markDirty();
  });
  input.addEventListener('change', () => { inGesture = false; });
  input.addEventListener('blur', () => { inGesture = false; });
}

function eachSelected(fn) {
  for (const n of getSelectedNodes()) {
    if (!n.locked) fn(n);
  }
}

function num(v, fallback = 0) {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : fallback;
}

export function initProps() {
  // Artboard
  bindLive($('ab-w'), v => { state.doc.artboard.w = Math.min(8000, Math.max(16, num(v, 1280))); });
  bindLive($('ab-h'), v => { state.doc.artboard.h = Math.min(8000, Math.max(16, num(v, 800))); });
  bindLive($('ab-bg'), v => { state.doc.artboard.bg = v; });
  $('ab-preset').addEventListener('change', (e) => {
    const v = e.target.value;
    if (!v) return;
    const [w, h] = v.split('x').map(Number);
    pushUndo();
    state.doc.artboard.w = w;
    state.doc.artboard.h = h;
    markDirty();
    e.target.value = '';
  });

  // Transform
  bindLive($('nd-x'), v => {
    const nodes = getSelectedNodes().filter(n => !n.locked);
    if (!nodes.length) return;
    const dx = num(v) - Math.min(...nodes.map(n => n.x));
    nodes.forEach(n => { n.x += dx; });
  });
  bindLive($('nd-y'), v => {
    const nodes = getSelectedNodes().filter(n => !n.locked);
    if (!nodes.length) return;
    const dy = num(v) - Math.min(...nodes.map(n => n.y));
    nodes.forEach(n => { n.y += dy; });
  });
  bindLive($('nd-w'), v => eachSelected(n => resizeNodeTo(n, Math.max(1, num(v, n.w)), null)));
  bindLive($('nd-h'), v => eachSelected(n => resizeNodeTo(n, null, Math.max(1, num(v, n.h)))));
  bindLive($('nd-rot'), v => eachSelected(n => { n.rotation = num(v) % 360; }));
  bindLive($('nd-opacity'), v => eachSelected(n => {
    n.opacity = Math.min(100, Math.max(0, num(v, 100))) / 100;
  }));

  // Shape-specific
  bindLive($('nd-rx'), v => eachSelected(n => { if (n.type === 'rect') n.rx = Math.max(0, num(v)); }));
  bindLive($('nd-sides'), v => eachSelected(n => {
    if (n.type === 'polygon' || n.type === 'star') n.sides = Math.min(24, Math.max(3, Math.round(num(v, 5))));
  }));
  bindLive($('nd-inner'), v => eachSelected(n => {
    if (n.type === 'star') n.innerRatio = Math.min(0.95, Math.max(0.05, num(v, 45) / 100));
  }));

  // Fill / stroke
  bindLive($('nd-fill'), v => eachSelected(n => {
    if ('fill' in n) { n.fill = v; $('nd-fill-none').checked = false; }
  }));
  $('nd-fill-none').addEventListener('change', (e) => {
    pushUndo();
    eachSelected(n => { if ('fill' in n) n.fill = e.target.checked ? 'none' : $('nd-fill').value; });
    markDirty();
  });
  bindLive($('nd-stroke'), v => eachSelected(n => {
    n.stroke = v;
    if (!n.strokeWidth) n.strokeWidth = 1;
    $('nd-stroke-none').checked = false;
  }));
  $('nd-stroke-none').addEventListener('change', (e) => {
    pushUndo();
    eachSelected(n => { n.stroke = e.target.checked ? 'none' : $('nd-stroke').value; });
    markDirty();
  });
  bindLive($('nd-stroke-w'), v => eachSelected(n => { n.strokeWidth = Math.max(0, num(v)); }));

  // Text
  bindLive($('nd-fontsize'), v => eachSelected(n => {
    if (n.type === 'text') n.fontSize = Math.min(600, Math.max(4, num(v, 24)));
  }));
  $('nd-font').addEventListener('change', (e) => {
    pushUndo();
    eachSelected(n => { if (n.type === 'text') n.fontFamily = e.target.value; });
    markDirty();
  });
  $('nd-weight').addEventListener('change', (e) => {
    pushUndo();
    eachSelected(n => { if (n.type === 'text') n.fontWeight = Number(e.target.value); });
    markDirty();
  });
  for (const btn of document.querySelectorAll('[data-talign]')) {
    btn.addEventListener('click', () => {
      pushUndo();
      eachSelected(n => { if (n.type === 'text') n.align = btn.dataset.talign; });
      markDirty();
    });
  }

  // Clipart tint
  bindLive($('nd-tint'), v => eachSelected(n => { if (n.type === 'clipart') n.tint = v; }));

  // Align / arrange / group
  for (const btn of document.querySelectorAll('[data-align]')) {
    btn.addEventListener('click', () => alignSelected(btn.dataset.align));
  }
  for (const btn of document.querySelectorAll('[data-arrange]')) {
    btn.addEventListener('click', () => reorder(btn.dataset.arrange));
  }
  $('group-btn').addEventListener('click', groupSelection);
  $('ungroup-btn').addEventListener('click', ungroupSelection);

  events.on('selection', refreshProps);
  events.on('doc', refreshProps);
}

// Resize keeping the node centred math simple (top-left anchored).
function resizeNodeTo(n, w, h) {
  if (n.type === 'text') {
    if (h) n.fontSize = Math.min(600, Math.max(4, (n.fontSize || 24) * (h / Math.max(1, n.h))));
    return;
  }
  if (n.type === 'path' || n.type === 'line') {
    const sx = w ? w / Math.max(0.01, n.w) : 1;
    const sy = h ? h / Math.max(0.01, n.h) : 1;
    n.points = (n.points || []).map(p => [p[0] * sx, p[1] * sy]);
  }
  if (w) n.w = w;
  if (h) n.h = h;
}

function setVal(id, value) {
  const input = $(id);
  if (document.activeElement !== input) input.value = value;
}

export function refreshProps() {
  const nodes = getSelectedNodes();
  const show = (id, on) => { $(id).hidden = !on; };

  if (!nodes.length) {
    show('props-artboard', true);
    for (const id of ['props-transform', 'props-rect', 'props-poly', 'props-fill',
      'props-stroke', 'props-text', 'props-clipart', 'props-align', 'props-arrange']) show(id, false);
    setVal('ab-w', Math.round(state.doc.artboard.w));
    setVal('ab-h', Math.round(state.doc.artboard.h));
    setVal('ab-bg', state.doc.artboard.bg);
    return;
  }

  show('props-artboard', false);
  show('props-transform', true);
  show('props-align', true);
  show('props-arrange', true);

  const first = nodes[0];
  const types = new Set(nodes.map(n => n.type));
  const r1 = (v) => Math.round(v * 10) / 10;

  setVal('nd-x', r1(Math.min(...nodes.map(n => n.x))));
  setVal('nd-y', r1(Math.min(...nodes.map(n => n.y))));
  setVal('nd-w', r1(first.w));
  setVal('nd-h', r1(first.h));
  setVal('nd-rot', r1(first.rotation || 0));
  setVal('nd-opacity', Math.round((first.opacity ?? 1) * 100));

  show('props-rect', types.has('rect'));
  if (types.has('rect')) setVal('nd-rx', Math.round(first.rx || 0));

  const poly = types.has('polygon') || types.has('star');
  show('props-poly', poly);
  if (poly) {
    setVal('nd-sides', first.sides || 5);
    $('star-ratio-field').style.display = types.has('star') ? '' : 'none';
    if (types.has('star')) setVal('nd-inner', Math.round((first.innerRatio ?? 0.45) * 100));
  }

  const fillable = nodes.some(n => 'fill' in n && n.type !== 'line');
  show('props-fill', fillable);
  if (fillable) {
    const f = first.fill && first.fill !== 'none' ? first.fill : '#d9d9d9';
    setVal('nd-fill', toHex(f));
    $('nd-fill-none').checked = !first.fill || first.fill === 'none';
  }

  const strokable = !types.has('clipart');
  show('props-stroke', strokable);
  if (strokable) {
    const s = first.stroke && first.stroke !== 'none' ? first.stroke : '#3b2c20';
    setVal('nd-stroke', toHex(s));
    $('nd-stroke-none').checked = !first.stroke || first.stroke === 'none';
    setVal('nd-stroke-w', first.strokeWidth ?? 0);
  }

  show('props-text', types.has('text'));
  if (types.has('text')) {
    const t = nodes.find(n => n.type === 'text');
    setVal('nd-fontsize', Math.round(t.fontSize || 24));
    if (document.activeElement !== $('nd-font')) $('nd-font').value = t.fontFamily || 'Arial';
    if (document.activeElement !== $('nd-weight')) $('nd-weight').value = String(t.fontWeight || 400);
    for (const btn of document.querySelectorAll('[data-talign]')) {
      btn.classList.toggle('active', (t.align || 'left') === btn.dataset.talign);
    }
  }

  const clip = nodes.find(n => n.type === 'clipart');
  show('props-clipart', !!(clip && clip.tintable !== false && isTintable(clip)));
  if (clip) setVal('nd-tint', toHex(clip.tint || '#c96f2e'));
}

import { getClipart } from './clipart.js';
function isTintable(n) {
  const art = getClipart(n.clipartId);
  return !!(art && art.tintable);
}

// <input type=color> needs #rrggbb.
function toHex(color) {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    return '#' + [...color.slice(1)].map(c => c + c).join('');
  }
  return '#d9d9d9';
}
