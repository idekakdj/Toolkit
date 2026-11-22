// state.js — shared mutable state for ImageVendor

export const doc = {
  version: 1,
  canvas: { w: 1280, h: 800, bg: '#ffffff' },
  layers: [],
};

// In-memory layer data: each entry mirrors doc.layers[i] but also holds `offscreen` (HTMLCanvasElement)
export const layerCanvases = []; // parallel array to doc.layers, each: { id, offscreen }

export let activeLayerId = null;
export function setActiveLayerId(id) { activeLayerId = id; }

export let currentTool = 'move';
export function setCurrentTool(t) { currentTool = t; }

export let currentColor = '#c9a227';
export function setCurrentColor(c) { currentColor = c; }

export let brushSize = 12;
export function setBrushSize(s) { brushSize = s; }

export let brushOpacity = 100;
export function setBrushOpacity(o) { brushOpacity = o; }

export let zoom = 1;
export function setZoom(z) { zoom = Math.max(0.05, Math.min(16, z)); }

// Current selection: null or { type: 'rect'|'ellipse', x, y, w, h }
export let selection = null;
export function setSelection(s) { selection = s; }

// Adjust base cache
export let adjustBase = null;
export function setAdjustBase(d) { adjustBase = d; }
export function clearAdjustBase() { adjustBase = null; }

// Undo / redo stacks hold JSON strings (snapshots)
export const undoStack = [];
export const redoStack = [];

// Save state
export let imageId = null;
export function setImageId(id) { imageId = id; }

export let imageName = 'Untitled image';
export function setImageName(n) { imageName = n; }

export let hasUnsavedEdits = false;
export function setHasUnsavedEdits(v) { hasUnsavedEdits = v; }

export let isSaving = false;
export function setIsSaving(v) { isSaving = v; }

export let saveQueued = false;
export function setSaveQueued(v) { saveQueued = v; }

// Generate a collision-proof layer id. Must NOT be a counter that resets on
// page load — otherwise newly-created layers reuse ids of layers loaded from
// the server, and two layers sharing an id collapse to one offscreen at save.
let _layerIdSeq = 0;
export function nextLayerId() {
  _layerIdSeq += 1;
  return 'layer-' + Date.now().toString(36) + '-' + _layerIdSeq + '-' + Math.random().toString(36).slice(2, 8);
}
