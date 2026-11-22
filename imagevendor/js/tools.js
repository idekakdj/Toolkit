// tools.js — pointer-event handlers and drawing tools for ImageVendor

import {
  doc, layerCanvases, activeLayerId,
  currentTool, currentColor, brushSize, brushOpacity,
  selection, setSelection, zoom,
} from './state.js';
import { inSelection, applySelectionClip } from './adjust.js';

// References injected by app.js after DOM is ready
let _composite = null;
let _pushHistory = null;
let _scheduleAutosave = null;
let _refreshLayers = null;
let _overlay = null; // #iv-overlay canvas
let _ivCanvas = null; // #iv-canvas

export function initTools(composite, pushHistory, scheduleAutosave, refreshLayers, ivCanvas, overlay) {
  _composite = composite;
  _pushHistory = pushHistory;
  _scheduleAutosave = scheduleAutosave;
  _refreshLayers = refreshLayers;
  _ivCanvas = ivCanvas;
  _overlay = overlay;
}

// ─── COORDINATE MAPPING ──────────────────────────────────────────────────────

export function clientToImage(clientX, clientY) {
  const rect = _ivCanvas.getBoundingClientRect();
  const ix = (clientX - rect.left) / zoom;
  const iy = (clientY - rect.top) / zoom;
  const { w, h } = doc.canvas;
  return [
    Math.max(0, Math.min(w, ix)),
    Math.max(0, Math.min(h, iy)),
  ];
}

// ─── ACTIVE LAYER CTX ────────────────────────────────────────────────────────

function getActiveOffscreen() {
  return layerCanvases.find(l => l.id === activeLayerId);
}

// ─── OVERLAY CLEAR ───────────────────────────────────────────────────────────

export function clearOverlay() {
  if (!_overlay) return;
  const ctx = _overlay.getContext('2d');
  ctx.clearRect(0, 0, _overlay.width, _overlay.height);
}

// ─── MARQUEE ANIMATION ───────────────────────────────────────────────────────

let _marqueeRaf = null;
let _marqueeDashOffset = 0;

export function startMarqueeAnimation() {
  if (_marqueeRaf) return;
  function tick() {
    _marqueeDashOffset = (_marqueeDashOffset + 0.5) % 8;
    drawMarquee();
    _marqueeRaf = requestAnimationFrame(tick);
  }
  _marqueeRaf = requestAnimationFrame(tick);
}

export function stopMarqueeAnimation() {
  if (_marqueeRaf) {
    cancelAnimationFrame(_marqueeRaf);
    _marqueeRaf = null;
  }
}

function drawMarquee() {
  if (!selection || !_overlay) return;
  const ctx = _overlay.getContext('2d');
  ctx.clearRect(0, 0, _overlay.width, _overlay.height);
  const { x, y, w, h, type } = selection;
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -_marqueeDashOffset;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (type === 'rect') {
    ctx.rect(x, y, w, h);
  } else {
    ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -_marqueeDashOffset + 4;
  ctx.strokeStyle = '#000000';
  ctx.stroke();
  ctx.restore();
}

// ─── POINTER STATE ───────────────────────────────────────────────────────────

let _pointerActive = false;
let _startX = 0, _startY = 0;
let _lastX = 0, _lastY = 0;
let _moveOffsetX = 0, _moveOffsetY = 0;
let _moveOldCanvas = null;
let _cropRect = null;

// ─── BRUSH / ERASER CONTEXT SETUP ───────────────────────────────────────────

function setupPaintCtx(ctx, erase) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = brushSize;
  ctx.globalAlpha = brushOpacity / 100;
  if (erase) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = currentColor;
  }
}

// ─── FLOOD FILL ──────────────────────────────────────────────────────────────

function hexToRgba(hex) {
  const h = hex.replace('#', '');
  const num = parseInt(h, 16);
  if (h.length === 3) {
    return [
      ((num >> 8) & 0xf) * 17,
      ((num >> 4) & 0xf) * 17,
      (num & 0xf) * 17,
      255,
    ];
  }
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 255];
}

export function floodFill(imageData, startX, startY, fillColor) {
  const data = imageData.data;
  const w = imageData.width;
  const h = imageData.height;
  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;

  const idx0 = (sy * w + sx) * 4;
  const tr = data[idx0], tg = data[idx0 + 1], tb = data[idx0 + 2], ta = data[idx0 + 3];

  const [fr, fg, fb, fa] = hexToRgba(fillColor);
  if (tr === fr && tg === fg && tb === fb && ta === fa) return;

  const tol = 32;
  function matches(i) {
    return Math.abs(data[i] - tr) <= tol &&
           Math.abs(data[i + 1] - tg) <= tol &&
           Math.abs(data[i + 2] - tb) <= tol &&
           Math.abs(data[i + 3] - ta) <= tol;
  }

  const visited = new Uint8Array(w * h);
  const stack = [sx + sy * w];
  visited[sx + sy * w] = 1;

  while (stack.length) {
    const pos = stack.pop();
    const px = pos % w;
    const py = (pos / w) | 0;
    if (!inSelection(px, py)) continue;
    const i = pos * 4;
    data[i] = fr; data[i + 1] = fg; data[i + 2] = fb; data[i + 3] = fa;

    const neighbors = [pos - 1, pos + 1, pos - w, pos + w];
    for (const n of neighbors) {
      if (n < 0 || n >= w * h || visited[n]) continue;
      const nx = n % w;
      const ny = (n / w) | 0;
      if (px !== nx && py !== ny) continue; // only 4-connected
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (matches(n * 4)) {
        visited[n] = 1;
        stack.push(n);
      }
    }
  }
}

// ─── POINTER DOWN ─────────────────────────────────────────────────────────────

export function onPointerDown(evt) {
  if (evt.button !== 0) return;
  evt.preventDefault();
  const tool = currentTool;
  const [ix, iy] = clientToImage(evt.clientX, evt.clientY);
  _startX = ix; _startY = iy;
  _lastX = ix; _lastY = iy;
  _pointerActive = true;

  try { _overlay.setPointerCapture(evt.pointerId); } catch { /* ok */ }

  const lc = getActiveOffscreen();

  if (tool === 'brush' || tool === 'eraser') {
    _pushHistory();
    if (!lc) return;
    const ctx = lc.offscreen.getContext('2d');
    ctx.save();
    if (selection) applySelectionClip(ctx);
    setupPaintCtx(ctx, tool === 'eraser');
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    ctx.lineTo(ix + 0.1, iy); // ensure a dot
    ctx.stroke();
    ctx.restore();
    _composite();

  } else if (tool === 'fill') {
    if (!lc) return;
    _pushHistory();
    const ctx = lc.offscreen.getContext('2d');
    const id = ctx.getImageData(0, 0, doc.canvas.w, doc.canvas.h);
    floodFill(id, ix, iy, currentColor);
    ctx.putImageData(id, 0, 0);
    _composite();
    _scheduleAutosave();

  } else if (tool === 'eyedropper') {
    sampleColor(evt.clientX, evt.clientY);

  } else if (tool === 'move') {
    if (!lc) return;
    _pushHistory();
    _moveOffsetX = 0;
    _moveOffsetY = 0;
    // Snapshot the current state before moving
    const tmp = document.createElement('canvas');
    tmp.width = doc.canvas.w;
    tmp.height = doc.canvas.h;
    tmp.getContext('2d').drawImage(lc.offscreen, 0, 0);
    _moveOldCanvas = tmp;

  } else if (tool === 'select-rect' || tool === 'select-ellipse') {
    // begin drag — clear selection
    setSelection(null);
    clearOverlay();
    stopMarqueeAnimation();

  } else if (tool === 'crop') {
    _cropRect = null;

  } else if (tool === 'text') {
    // handled on click (pointerup without move)

  } else if (tool === 'shape-rect' || tool === 'shape-ellipse' || tool === 'shape-line') {
    _pushHistory();
  }
}

// ─── POINTER MOVE ─────────────────────────────────────────────────────────────

export function onPointerMove(evt) {
  if (!_pointerActive) return;
  const tool = currentTool;
  const [ix, iy] = clientToImage(evt.clientX, evt.clientY);

  const lc = getActiveOffscreen();

  if (tool === 'brush' || tool === 'eraser') {
    if (!lc) return;
    const dx = ix - _lastX, dy = iy - _lastY;
    if (dx * dx + dy * dy < 1) return;
    const ctx = lc.offscreen.getContext('2d');
    ctx.save();
    if (selection) applySelectionClip(ctx);
    setupPaintCtx(ctx, tool === 'eraser');
    ctx.beginPath();
    ctx.moveTo(_lastX, _lastY);
    ctx.lineTo(ix, iy);
    ctx.stroke();
    ctx.restore();
    _lastX = ix; _lastY = iy;
    _composite();

  } else if (tool === 'move') {
    if (!lc || !_moveOldCanvas) return;
    const dx = ix - _startX;
    const dy = iy - _startY;
    _moveOffsetX = dx;
    _moveOffsetY = dy;
    // Bake preview: clear and draw shifted
    const ctx = lc.offscreen.getContext('2d');
    ctx.clearRect(0, 0, doc.canvas.w, doc.canvas.h);
    ctx.drawImage(_moveOldCanvas, dx, dy);
    _composite();

  } else if (tool === 'select-rect' || tool === 'select-ellipse') {
    let x = Math.min(_startX, ix);
    let y = Math.min(_startY, iy);
    let w = Math.abs(ix - _startX);
    let h = Math.abs(iy - _startY);
    setSelection({ type: tool === 'select-rect' ? 'rect' : 'ellipse', x, y, w, h });
    stopMarqueeAnimation();
    drawDragMarquee(x, y, w, h, tool);

  } else if (tool === 'crop') {
    let x = Math.min(_startX, ix);
    let y = Math.min(_startY, iy);
    let w = Math.abs(ix - _startX);
    let h = Math.abs(iy - _startY);
    _cropRect = { x, y, w, h };
    drawCropOverlay(x, y, w, h);

  } else if (tool === 'shape-rect' || tool === 'shape-ellipse' || tool === 'shape-line') {
    let x = _startX, y = _startY, w = ix - _startX, h = iy - _startY;
    if (evt.shiftKey) {
      const s = Math.min(Math.abs(w), Math.abs(h));
      w = w < 0 ? -s : s;
      h = h < 0 ? -s : s;
    }
    drawShapePreview(tool, x, y, w, h);
  }
}

// ─── POINTER UP ───────────────────────────────────────────────────────────────

export function onPointerUp(evt) {
  if (!_pointerActive) return;
  _pointerActive = false;
  const tool = currentTool;
  const [ix, iy] = clientToImage(evt.clientX, evt.clientY);

  const lc = getActiveOffscreen();

  if (tool === 'brush' || tool === 'eraser') {
    _scheduleAutosave();

  } else if (tool === 'move') {
    _moveOldCanvas = null;
    _scheduleAutosave();

  } else if (tool === 'eyedropper') {
    // already handled on down

  } else if (tool === 'select-rect' || tool === 'select-ellipse') {
    let x = Math.min(_startX, ix);
    let y = Math.min(_startY, iy);
    let w = Math.abs(ix - _startX);
    let h = Math.abs(iy - _startY);
    if (w < 2 && h < 2) {
      setSelection(null);
      clearOverlay();
      stopMarqueeAnimation();
    } else {
      setSelection({ type: tool === 'select-rect' ? 'rect' : 'ellipse', x, y, w, h });
      startMarqueeAnimation();
    }

  } else if (tool === 'text') {
    // show text input at click position
    showTextInput(ix, iy);

  } else if (tool === 'crop') {
    if (_cropRect && _cropRect.w > 4 && _cropRect.h > 4) {
      drawCropOverlay(_cropRect.x, _cropRect.y, _cropRect.w, _cropRect.h);
      // commit on Enter or double-click; just show overlay here
    }

  } else if (tool === 'shape-rect' || tool === 'shape-ellipse' || tool === 'shape-line') {
    if (!lc) return;
    let x = _startX, y = _startY, w = ix - _startX, h = iy - _startY;
    if (evt.shiftKey) {
      const s = Math.min(Math.abs(w), Math.abs(h));
      w = w < 0 ? -s : s;
      h = h < 0 ? -s : s;
    }
    clearOverlay();
    bakeShape(lc, tool, x, y, w, h);
    _composite();
    _scheduleAutosave();
  }
}

// ─── DOUBLE CLICK (crop commit) ───────────────────────────────────────────────

export function onDblClick(evt) {
  if (currentTool === 'crop' && _cropRect && _cropRect.w > 4 && _cropRect.h > 4) {
    commitCrop(_cropRect);
    _cropRect = null;
  }
}

// ─── KEY: Escape / Enter / Delete ─────────────────────────────────────────────

export function handleToolKey(evt) {
  if (evt.key === 'Escape') {
    if (selection) {
      setSelection(null);
      stopMarqueeAnimation();
      clearOverlay();
    }
    if (_cropRect) {
      _cropRect = null;
      clearOverlay();
    }
  }
  if (evt.key === 'Enter' && currentTool === 'crop' && _cropRect) {
    commitCrop(_cropRect);
    _cropRect = null;
  }
  if ((evt.key === 'Delete' || evt.key === 'Backspace') && selection) {
    evt.preventDefault();
    clearSelectionPixels();
  }
}

// ─── CLEAR SELECTION PIXELS ───────────────────────────────────────────────────

function clearSelectionPixels() {
  const lc = getActiveOffscreen();
  if (!lc) return;
  _pushHistory();
  const ctx = lc.offscreen.getContext('2d');
  ctx.save();
  applySelectionClip(ctx);
  ctx.clearRect(0, 0, doc.canvas.w, doc.canvas.h);
  ctx.restore();
  _composite();
  _scheduleAutosave();
}

// ─── EYEDROPPER ───────────────────────────────────────────────────────────────

function sampleColor(clientX, clientY) {
  if (!_ivCanvas) return;
  const [ix, iy] = clientToImage(clientX, clientY);
  const ctx = _ivCanvas.getContext('2d');
  const px = ctx.getImageData(Math.min(doc.canvas.w - 1, Math.floor(ix)), Math.min(doc.canvas.h - 1, Math.floor(iy)), 1, 1).data;
  const hex = '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join('');
  // Update color picker and state
  const picker = document.getElementById('color-picker');
  if (picker) picker.value = hex;
  // dispatch input event so state.js / app.js pick it up
  picker && picker.dispatchEvent(new Event('input'));
}

// ─── SHAPE PREVIEW ON OVERLAY ────────────────────────────────────────────────

function drawShapePreview(tool, x, y, w, h) {
  const ctx = _overlay.getContext('2d');
  ctx.clearRect(0, 0, _overlay.width, _overlay.height);
  ctx.save();
  ctx.globalAlpha = brushOpacity / 100;
  ctx.strokeStyle = currentColor;
  ctx.fillStyle = currentColor;
  ctx.lineWidth = brushSize;
  ctx.lineCap = 'round';
  if (tool === 'shape-rect') {
    ctx.fillRect(x, y, w, h);
  } else if (tool === 'shape-ellipse') {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (tool === 'shape-line') {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

function bakeShape(lc, tool, x, y, w, h) {
  const ctx = lc.offscreen.getContext('2d');
  ctx.save();
  if (selection) applySelectionClip(ctx);
  ctx.globalAlpha = brushOpacity / 100;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = currentColor;
  ctx.fillStyle = currentColor;
  ctx.lineWidth = brushSize;
  ctx.lineCap = 'round';
  if (tool === 'shape-rect') {
    ctx.fillRect(x, y, w, h);
  } else if (tool === 'shape-ellipse') {
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (tool === 'shape-line') {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
  }
  ctx.restore();
}

// ─── DRAG MARQUEE PREVIEW ────────────────────────────────────────────────────

function drawDragMarquee(x, y, w, h, tool) {
  const ctx = _overlay.getContext('2d');
  ctx.clearRect(0, 0, _overlay.width, _overlay.height);
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (tool === 'select-rect') {
    ctx.rect(x, y, w, h);
  } else {
    ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = 4;
  ctx.strokeStyle = '#000000';
  ctx.stroke();
  ctx.restore();
}

// ─── CROP OVERLAY ─────────────────────────────────────────────────────────────

function drawCropOverlay(x, y, w, h) {
  const ctx = _overlay.getContext('2d');
  ctx.clearRect(0, 0, _overlay.width, _overlay.height);
  const cw = _overlay.width, ch = _overlay.height;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  // Draw dimmed overlay outside crop rect
  ctx.fillRect(0, 0, cw, y);
  ctx.fillRect(0, y + h, cw, ch - y - h);
  ctx.fillRect(0, y, x, h);
  ctx.fillRect(x + w, y, cw - x - w, h);
  // crop border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function commitCrop(rect) {
  const { x, y, w, h } = rect;
  if (w < 1 || h < 1) return;
  _pushHistory();

  const newW = Math.round(w);
  const newH = Math.round(h);

  for (const lc of layerCanvases) {
    const newOff = document.createElement('canvas');
    newOff.width = newW;
    newOff.height = newH;
    newOff.getContext('2d').drawImage(lc.offscreen, -Math.round(x), -Math.round(y));
    lc.offscreen = newOff;
  }

  setSelection(null);
  stopMarqueeAnimation();
  doc.canvas.w = newW;
  doc.canvas.h = newH;

  // Resize the main canvases
  _ivCanvas.width = newW;
  _ivCanvas.height = newH;
  _overlay.width = newW;
  _overlay.height = newH;
  for (const canvas of [_ivCanvas, _overlay]) {
    canvas.style.width = Math.round(newW * zoom) + 'px';
    canvas.style.height = Math.round(newH * zoom) + 'px';
  }

  clearOverlay();
  _composite();
  _scheduleAutosave();
  _refreshLayers();
}

// ─── TEXT INPUT ───────────────────────────────────────────────────────────────

export function showTextInput(ix, iy) {
  const rect = _ivCanvas.getBoundingClientRect();
  const screenX = rect.left + ix * zoom;
  const screenY = rect.top + iy * zoom;

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.setAttribute('aria-label', 'Text to add to image');
  inp.style.cssText = [
    'position:fixed',
    `left:${screenX}px`,
    `top:${screenY}px`,
    `font-size:${Math.max(12, brushSize * 2)}px`,
    "font-family:'Segoe UI',system-ui,sans-serif",
    'background:rgba(255,255,255,0.15)',
    'color:' + currentColor,
    'border:1px dashed rgba(255,255,255,0.6)',
    'outline:none',
    'padding:2px 4px',
    'min-width:80px',
    'z-index:9999',
  ].join(';');

  document.body.appendChild(inp);
  inp.focus();

  let finished = false;
  function commit() {
    if (finished) return;
    finished = true;
    const text = inp.value.trim();
    inp.remove();
    if (!text) return;
    const lc = getActiveOffscreen();
    if (!lc) return;
    _pushHistory();
    const ctx = lc.offscreen.getContext('2d');
    ctx.save();
    if (selection) applySelectionClip(ctx);
    ctx.fillStyle = currentColor;
    ctx.font = `${Math.max(12, brushSize * 2)}px 'Segoe UI',system-ui,sans-serif`;
    ctx.textBaseline = 'top';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillText(text, ix, iy);
    ctx.restore();
    _composite();
    _scheduleAutosave();
  }

  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { finished = true; inp.remove(); }
    e.stopPropagation();
  });
  inp.addEventListener('blur', commit);
}
