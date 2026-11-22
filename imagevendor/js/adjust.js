// adjust.js — pixel-level adjustments and filters for ImageVendor

import { doc, layerCanvases, activeLayerId, selection, adjustBase, setAdjustBase, clearAdjustBase } from './state.js';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

function getActiveCtx() {
  const lc = layerCanvases.find(l => l.id === activeLayerId);
  if (!lc) return null;
  return lc.offscreen.getContext('2d');
}

/** Returns a clone of an ImageData object */
export function cloneImageData(id) {
  const clone = new ImageData(new Uint8ClampedArray(id.data), id.width, id.height);
  return clone;
}

/** Apply selection clip to a ctx before drawing */
export function applySelectionClip(ctx) {
  if (!selection) return false;
  ctx.beginPath();
  if (selection.type === 'rect') {
    ctx.rect(selection.x, selection.y, selection.w, selection.h);
  } else {
    const cx = selection.x + selection.w / 2;
    const cy = selection.y + selection.h / 2;
    const rx = selection.w / 2;
    const ry = selection.h / 2;
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }
  ctx.clip();
  return true;
}

/** Check if a pixel at (px,py) is inside the current selection (or no selection → always inside) */
export function inSelection(px, py) {
  if (!selection) return true;
  const { x, y, w, h, type } = selection;
  if (type === 'rect') {
    return px >= x && px < x + w && py >= y && py < y + h;
  } else {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    if (rx === 0 || ry === 0) return false;
    const nx = (px - cx) / rx;
    const ny = (py - cy) / ry;
    return nx * nx + ny * ny <= 1;
  }
}

// ─── RGB ↔ HSL ─────────────────────────────────────────────────────────────

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1/6) return p + (q - p) * 6 * t;
  if (t < 1/2) return q;
  if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// ─── ADJUSTMENT APPLICATION ─────────────────────────────────────────────────

/**
 * applyAdjustments — given a source ImageData and the four knob values,
 * return a new ImageData with all adjustments applied (respects selection).
 */
export function applyAdjustments(srcData, brightness, contrast, saturation, hue) {
  const src = srcData.data;
  const out = new ImageData(new Uint8ClampedArray(src), srcData.width, srcData.height);
  const d = out.data;
  const w = srcData.width;

  const cf = contrast !== 0 ? (259 * (contrast + 255)) / (255 * (259 - contrast)) : 1;

  for (let i = 0; i < d.length; i += 4) {
    const a = src[i + 3];
    if (a === 0) continue;

    const px = (i / 4) % w;
    const py = Math.floor((i / 4) / w);
    if (!inSelection(px, py)) continue;

    let r = src[i], g = src[i + 1], b = src[i + 2];

    // Brightness
    if (brightness !== 0) {
      const bv = brightness * 2.55;
      r = clamp(r + bv);
      g = clamp(g + bv);
      b = clamp(b + bv);
    }

    // Contrast
    if (contrast !== 0) {
      r = clamp(cf * (r - 128) + 128);
      g = clamp(cf * (g - 128) + 128);
      b = clamp(cf * (b - 128) + 128);
    }

    // Saturation
    if (saturation !== 0) {
      const sat = 1 + saturation / 100;
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = clamp(gray + (r - gray) * sat);
      g = clamp(gray + (g - gray) * sat);
      b = clamp(gray + (b - gray) * sat);
    }

    // Hue
    if (hue !== 0) {
      const [h, s, l] = rgbToHsl(r, g, b);
      const newH = ((h + hue / 360) % 1 + 1) % 1;
      [r, g, b] = hslToRgb(newH, s, l);
    }

    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  return out;
}

// ─── FILTERS ─────────────────────────────────────────────────────────────────

export function filterGrayscale(imageData) {
  const d = imageData.data;
  const w = imageData.width;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const px = (i / 4) % w;
    const py = Math.floor((i / 4) / w);
    if (!inSelection(px, py)) continue;
    const gray = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = gray;
  }
}

export function filterInvert(imageData) {
  const d = imageData.data;
  const w = imageData.width;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const px = (i / 4) % w;
    const py = Math.floor((i / 4) / w);
    if (!inSelection(px, py)) continue;
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
}

export function filterSepia(imageData) {
  const d = imageData.data;
  const w = imageData.width;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const px = (i / 4) % w;
    const py = Math.floor((i / 4) / w);
    if (!inSelection(px, py)) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i]     = clamp(r * 0.393 + g * 0.769 + b * 0.189);
    d[i + 1] = clamp(r * 0.349 + g * 0.686 + b * 0.168);
    d[i + 2] = clamp(r * 0.272 + g * 0.534 + b * 0.131);
  }
}

export function filterBlur(imageData) {
  const src = new Uint8ClampedArray(imageData.data);
  const d = imageData.data;
  const w = imageData.width;
  const h = imageData.height;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inSelection(x, y)) continue;
      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = (ny * w + nx) * 4;
          const alpha = src[ni + 3];
          r += src[ni] * alpha; g += src[ni + 1] * alpha; b += src[ni + 2] * alpha; a += alpha;
          count++;
        }
      }
      const idx = (y * w + x) * 4;
      d[idx]     = a ? Math.round(r / a) : 0;
      d[idx + 1] = a ? Math.round(g / a) : 0;
      d[idx + 2] = a ? Math.round(b / a) : 0;
      d[idx + 3] = Math.round(a / count);
    }
  }
}

export function filterSharpen(imageData) {
  const src = new Uint8ClampedArray(imageData.data);
  const d = imageData.data;
  const w = imageData.width;
  const h = imageData.height;
  // kernel: [0,-1,0,-1,5,-1,0,-1,0]
  const kernel = [0,-1,0,-1,5,-1,0,-1,0];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inSelection(x, y)) continue;
      let r = 0, g = 0, b = 0;
      let ki = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = kernel[ki++];
          if (k === 0) continue;
          const nx = Math.max(0, Math.min(w - 1, x + dx));
          const ny = Math.max(0, Math.min(h - 1, y + dy));
          const ni = (ny * w + nx) * 4;
          r += src[ni] * k;
          g += src[ni + 1] * k;
          b += src[ni + 2] * k;
        }
      }
      const idx = (y * w + x) * 4;
      d[idx]     = clamp(r);
      d[idx + 1] = clamp(g);
      d[idx + 2] = clamp(b);
      // alpha unchanged
    }
  }
}

// ─── ADJUST BASE MANAGEMENT ─────────────────────────────────────────────────

export { adjustBase, setAdjustBase, clearAdjustBase };

/**
 * Ensure we have an adjustBase snapshot of the active layer.
 * Only captures once per adjust session.
 */
export function ensureAdjustBase() {
  if (adjustBase) return;
  const lc = layerCanvases.find(l => l.id === activeLayerId);
  if (!lc) return;
  const ctx = lc.offscreen.getContext('2d');
  const id = ctx.getImageData(0, 0, doc.canvas.w, doc.canvas.h);
  setAdjustBase(cloneImageData(id));
}

/**
 * Apply current slider values to the active layer starting from adjustBase.
 */
export function liveAdjust(brightness, contrast, saturation, hue, compositeFn) {
  if (!adjustBase) return;
  const lc = layerCanvases.find(l => l.id === activeLayerId);
  if (!lc) return;
  const result = applyAdjustments(adjustBase, brightness, contrast, saturation, hue);
  const ctx = lc.offscreen.getContext('2d');
  ctx.putImageData(result, 0, 0);
  compositeFn();
}

/**
 * Restore the adjustBase to the active layer (for reset).
 */
export function restoreAdjustBase(compositeFn) {
  if (!adjustBase) return;
  const lc = layerCanvases.find(l => l.id === activeLayerId);
  if (!lc) return;
  const ctx = lc.offscreen.getContext('2d');
  ctx.putImageData(adjustBase, 0, 0);
  clearAdjustBase();
  compositeFn();
}
