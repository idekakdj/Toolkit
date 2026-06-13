// Editor state: document model, selection, undo/redo and a tiny event bus.

export const state = {
  projectId: null,
  projectName: '',
  doc: { version: 1, artboard: { name: 'Artboard', w: 1280, h: 800, bg: '#ffffff' }, nodes: [] },
  selection: [],          // node ids
  tool: 'select',
  pendingClipart: null,   // clipart id waiting to be placed
  zoom: 1,
  pan: { x: 0, y: 0 },
  editingTextId: null,
  clipboard: null,
  dirty: false,
};

// ---------- event bus ----------
const listeners = {};
export const events = {
  on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
  emit(name, payload) { for (const fn of listeners[name] || []) fn(payload); },
};

// ---------- ids & lookup ----------
export function uid() {
  return 'n' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function getNode(id) {
  return state.doc.nodes.find(n => n.id === id) || null;
}

export function getSelectedNodes() {
  return state.selection.map(getNode).filter(Boolean);
}

// ---------- selection ----------
export function expandGroups(ids) {
  const out = new Set(ids);
  for (const id of ids) {
    const n = getNode(id);
    if (n && n.groupId) {
      for (const m of state.doc.nodes) if (m.groupId === n.groupId) out.add(m.id);
    }
  }
  return [...out];
}

export function setSelection(ids, { expand = true } = {}) {
  const valid = ids.filter(id => getNode(id));
  state.selection = expand ? expandGroups(valid) : valid;
  events.emit('selection');
}

// ---------- undo / redo ----------
const undoStack = [];
const redoStack = [];
const HISTORY_LIMIT = 100;

export function snapshot() {
  return JSON.stringify({ artboard: state.doc.artboard, nodes: state.doc.nodes });
}

export function pushUndo(snap) {
  undoStack.push(snap !== undefined ? snap : snapshot());
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
  redoStack.length = 0;
  events.emit('history');
}

function restore(snap) {
  const data = JSON.parse(snap);
  state.doc.artboard = data.artboard;
  state.doc.nodes = data.nodes;
  state.selection = state.selection.filter(id => getNode(id));
  markDirty();
  events.emit('selection');
}

export function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  events.emit('history');
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  events.emit('history');
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function markDirty() {
  state.dirty = true;
  events.emit('doc');
}

// ---------- node factory ----------
let nameCounters = {};
export function defaultName(type) {
  const labels = {
    rect: 'Rectangle', ellipse: 'Ellipse', path: 'Path', line: 'Line',
    polygon: 'Polygon', star: 'Star', text: 'Text', clipart: 'Clipart',
  };
  nameCounters[type] = (nameCounters[type] || 0) + 1;
  return `${labels[type] || 'Layer'} ${nameCounters[type]}`;
}

export function baseNode(type, props = {}) {
  return {
    id: uid(), type, name: defaultName(type),
    x: 0, y: 0, w: 100, h: 100, rotation: 0, opacity: 1,
    visible: true, locked: false, groupId: null,
    ...props,
  };
}

// ---------- geometry ----------
export function rotatePoint(p, c, rad) {
  const dx = p.x - c.x, dy = p.y - c.y;
  return {
    x: c.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: c.y + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

export function nodeCorners(n) {
  const c = { x: n.x + n.w / 2, y: n.y + n.h / 2 };
  const rad = (n.rotation || 0) * Math.PI / 180;
  return [
    { x: n.x, y: n.y }, { x: n.x + n.w, y: n.y },
    { x: n.x + n.w, y: n.y + n.h }, { x: n.x, y: n.y + n.h },
  ].map(p => rotatePoint(p, c, rad));
}

// Axis-aligned bounding box in world space (accounts for rotation).
export function nodeAABB(n) {
  const pts = nodeCorners(n);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function selectionBBox() {
  const nodes = getSelectedNodes();
  if (!nodes.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of nodes) {
    const b = nodeAABB(n);
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// ---------- operations ----------
export function deleteSelected() {
  if (!state.selection.length) return;
  pushUndo();
  const dead = new Set(state.selection);
  state.doc.nodes = state.doc.nodes.filter(n => !dead.has(n.id));
  state.selection = [];
  markDirty();
  events.emit('selection');
}

function cloneNodes(nodes, offset = 16) {
  const groupMap = {};
  return nodes.map(n => {
    const copy = JSON.parse(JSON.stringify(n));
    copy.id = uid();
    copy.name = n.name + ' copy';
    copy.x += offset; copy.y += offset;
    if (copy.groupId) {
      groupMap[copy.groupId] = groupMap[copy.groupId] || uid();
      copy.groupId = groupMap[copy.groupId];
    }
    return copy;
  });
}

export function duplicateSelected() {
  const nodes = getSelectedNodes();
  if (!nodes.length) return;
  pushUndo();
  const copies = cloneNodes(nodes);
  state.doc.nodes.push(...copies);
  state.selection = copies.map(c => c.id);
  markDirty();
  events.emit('selection');
}

export function copySelected() {
  const nodes = getSelectedNodes();
  if (nodes.length) state.clipboard = JSON.parse(JSON.stringify(nodes));
}

export function pasteClipboard() {
  if (!state.clipboard || !state.clipboard.length) return;
  pushUndo();
  const copies = cloneNodes(state.clipboard);
  state.doc.nodes.push(...copies);
  state.selection = copies.map(c => c.id);
  markDirty();
  events.emit('selection');
}

export function groupSelection() {
  const nodes = getSelectedNodes();
  if (nodes.length < 2) return;
  pushUndo();
  const gid = uid();
  for (const n of nodes) n.groupId = gid;
  markDirty();
}

export function ungroupSelection() {
  const nodes = getSelectedNodes();
  if (!nodes.some(n => n.groupId)) return;
  pushUndo();
  for (const n of nodes) n.groupId = null;
  markDirty();
}

// Reorder selected nodes in the z stack: 'front' | 'forward' | 'backward' | 'back'
export function reorder(action) {
  const sel = new Set(state.selection);
  if (!sel.size) return;
  pushUndo();
  const nodes = state.doc.nodes;
  const selected = nodes.filter(n => sel.has(n.id));
  const rest = nodes.filter(n => !sel.has(n.id));
  if (action === 'front') {
    state.doc.nodes = [...rest, ...selected];
  } else if (action === 'back') {
    state.doc.nodes = [...selected, ...rest];
  } else {
    const dir = action === 'forward' ? 1 : -1;
    const arr = [...nodes];
    const idxs = arr.map((n, i) => (sel.has(n.id) ? i : -1)).filter(i => i >= 0);
    if (dir === 1) idxs.reverse();
    for (const i of idxs) {
      const j = i + dir;
      if (j < 0 || j >= arr.length || sel.has(arr[j].id)) continue;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    state.doc.nodes = arr;
  }
  markDirty();
}

// Align selected nodes. With one node, align to the artboard.
export function alignSelected(mode) {
  const nodes = getSelectedNodes().filter(n => !n.locked);
  if (!nodes.length) return;
  pushUndo();
  const ref = nodes.length > 1
    ? selectionBBox()
    : { x: 0, y: 0, w: state.doc.artboard.w, h: state.doc.artboard.h };
  for (const n of nodes) {
    const b = nodeAABB(n);
    let dx = 0, dy = 0;
    if (mode === 'left') dx = ref.x - b.x;
    if (mode === 'hcenter') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
    if (mode === 'right') dx = ref.x + ref.w - (b.x + b.w);
    if (mode === 'top') dy = ref.y - b.y;
    if (mode === 'vcenter') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
    if (mode === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
    n.x += dx; n.y += dy;
  }
  markDirty();
}
