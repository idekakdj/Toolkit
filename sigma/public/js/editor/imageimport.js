// imageimport.js — Import image nodes from ImageVendor, Pigment, or the user's
// local computer. Sources are flattened into self-contained PNG nodes.

import { api, redirectIfSignedOut } from '../api.js';
import { showDialog, hideDialog } from '../dialogs.js';
import { requireDimensions, requireRaster, imageToPNG } from './raster.js';
import {
  state, pushUndo, markDirty, setSelection, baseNode,
} from './state.js';

const $ = (id) => document.getElementById(id);

// ─── Modal open / close helpers (reuses main.js pattern) ─────────────────────
function showModal(id) { showDialog($(id)); }
function hideModal(id) { hideDialog($(id)); }

// ─── Tab state ───────────────────────────────────────────────────────────────
let activeTab = 'imagevendor';
let loadSequence = 0;

function setTab(tab) {
  activeTab = tab;
  loadSequence++;
  for (const btn of document.querySelectorAll('.ii-tab')) {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  }
  const grid = $('import-image-grid');
  grid.innerHTML = '';
  if (tab === 'computer') {
    $('import-image-file').click();
    return;
  }
  loadTab(tab);
}

// ─── Load ImageVendor or Pigment listing ─────────────────────────────────────
async function loadTab(tab) {
  const grid = $('import-image-grid');
  grid.innerHTML = '<p class="ii-loading">Loading…</p>';

  const sequence = ++loadSequence;
  const endpoint = tab === 'imagevendor' ? '/api/images' : '/api/paintings';
  let items = [];
  try {
    const data = await api(endpoint);
    items = data.images || data.paintings || [];
  } catch (err) {
    if (sequence !== loadSequence) return;
    if (redirectIfSignedOut(err)) return;
    grid.innerHTML = '<p class="ii-loading">Could not load — are you signed in?</p>';
    return;
  }

  if (sequence !== loadSequence || activeTab !== tab) return;
  grid.innerHTML = '';
  if (!items.length) {
    grid.innerHTML = '<p class="ii-loading">Nothing here yet.</p>';
    return;
  }

  for (const item of items) {
    const btn = document.createElement('button');
    btn.className = 'clip-item ii-item';
    btn.type = 'button';
    btn.title = item.name || 'Untitled';
    if (item.thumbnail) {
      const img = document.createElement('img');
      img.src = item.thumbnail;
      img.alt = '';
      img.style.cssText = 'width:52px;height:52px;object-fit:contain;display:block;margin:0 auto 6px;';
      btn.append(img);
    }
    const label = document.createElement('span');
    label.className = 'clip-name';
    label.textContent = item.name || 'Untitled';
    btn.append(label);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        if (tab === 'imagevendor') await importFromImageVendor(item);
        else await importFromPigment(item);
        hideModal('import-image-modal');
      } catch (err) {
        alert('Could not import: ' + err.message);
      } finally { btn.disabled = false; }
    });
    grid.appendChild(btn);
  }
}

// ─── ImageVendor import ───────────────────────────────────────────────────────
export async function importFromImageVendor(item) {
  let data;
  try {
    data = await api(`/api/images/${item.id}`);
  } catch (err) {
    if (!redirectIfSignedOut(err)) throw err;
    return;
  }

  const image = data.image || {};
  const doc = image.document || {};
  const canvas = doc.canvas || { w: 1280, h: 800, bg: '#ffffff' };
  const layers = Array.isArray(doc.layers) ? doc.layers : [];

  requireDimensions(canvas.w, canvas.h);
  // Composite all visible layers onto a canvas.
  const offscreen = document.createElement('canvas');
  offscreen.width = canvas.w;
  offscreen.height = canvas.h;
  const ctx = offscreen.getContext('2d');

  // Fill background.
  if (canvas.bg && canvas.bg !== 'transparent') {
    ctx.fillStyle = canvas.bg;
    ctx.fillRect(0, 0, canvas.w, canvas.h);
  }

  // Draw each visible layer in order.
  for (const layer of layers) {
    if (layer.visible === false) continue;
    if (!layer.data) continue;
    requireRaster(layer.data);
    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
        ctx.globalAlpha = layer.opacity != null ? Math.min(1, Math.max(0, layer.opacity)) : 1;
        ctx.drawImage(img, 0, 0);
        ctx.globalAlpha = 1;
        resolve();
        } catch (err) { reject(err); }
      };
      img.onerror = () => reject(new Error('A source layer could not be decoded.'));
      img.src = layer.data;
    });
  }

  const dataURL = offscreen.toDataURL('image/png');
  placeImageNode(dataURL, canvas.w, canvas.h, item.name || 'Image');
}

// ─── Pigment import ───────────────────────────────────────────────────────────
async function importFromPigment(item) {
  let data;
  try {
    data = await api(`/api/paintings/${item.id}`);
  } catch (err) {
    if (!redirectIfSignedOut(err)) throw err;
    return;
  }

  const painting = data.painting || {};
  const doc = painting.document || {};
  const canvas = doc.canvas || { w: 1600, h: 1000, bg: '#ffffff' };
  const items = Array.isArray(doc.items) ? doc.items : [];

  // Build an SVG string from the Pigment document items.
  let getColoring = null;
  if (items.some(it => it.kind === 'art')) {
    try {
      const mod = await import('/pigment/js/library.js');
      getColoring = mod.getColoring;
    } catch {
      throw new Error('The Pigment art library could not be loaded.');
    }
  }

  const { w, h } = canvas;
  requireDimensions(w, h);
  const svgStr = buildPigmentSVG({ ...doc, canvas, items }, getColoring);

  // Rasterize SVG → canvas → dataURL.
  const dataURL = await new Promise((resolve, reject) => {
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL('image/png'));
      } catch (err) { reject(err); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Rasterize failed')); };
    img.src = url;
  });

  placeImageNode(dataURL, w, h, item.name || 'Painting');
}

// ─── Local file import ────────────────────────────────────────────────────────
async function handleFileInput(file) {
  if (!file) return;
  // Verify the real file type, size and pixel dimensions from its bytes before any decoder runs.
  const guard = window.ToolkitUploadGuard;
  const verdict = guard ? await guard.checkImage(file) : { ok: false, message: 'Upload checks are unavailable; reload the page.' };
  if (!verdict.ok) { alert('Could not import: ' + verdict.message); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataURL = e.target.result;
    // Determine natural size from the decoded image.
    const img = new Image();
    img.onload = () => {
      try {
        const png = imageToPNG(img);
        placeImageNode(png, img.naturalWidth, img.naturalHeight, file.name.replace(/\.[^.]+$/, ''));
      } catch (err) { alert('Could not import: ' + err.message); }
    };
    img.onerror = () => alert('The file is not a decodable image.');
    img.src = dataURL;
  };
  reader.onerror = () => alert('Could not read the file.');
  reader.readAsDataURL(file);
}

// ─── Place an image node on the artboard ─────────────────────────────────────
export function placeImageNode(dataURL, natW, natH, name) {
  requireRaster(dataURL);
  requireDimensions(natW, natH);
  if (!Number.isFinite(natW) || !Number.isFinite(natH) || natW <= 0 || natH <= 0) throw new Error('Invalid image dimensions.');
  const ab = state.doc.artboard;
  // Scale to fit within the artboard without exceeding natural size.
  const maxW = ab.w;
  const maxH = ab.h;
  const scale = Math.min(1, maxW / Math.max(1, natW), maxH / Math.max(1, natH));
  const w = Math.max(1, Math.round(natW * scale));
  const h = Math.max(1, Math.round(natH * scale));
  const x = Math.round((ab.w - w) / 2);
  const y = Math.round((ab.h - h) / 2);

  const node = baseNode('image', { x, y, w, h, src: dataURL, fill: 'none', stroke: 'none' });
  if (name) node.name = name;
  if (state.doc.nodes.length >= 5000 || new Blob([JSON.stringify({ ...state.doc, nodes: [...state.doc.nodes, node] })]).size > 8 * 1024 * 1024) {
    throw new Error('This image would exceed the project size limit (8 MB or 5000 layers).');
  }
  pushUndo();
  state.doc.nodes.push(node);
  setSelection([node.id]);
  markDirty();
}

// ─── Wire up the modal ────────────────────────────────────────────────────────
export function initImageImport() {
  const openBtn = $('import-image-btn');
  if (!openBtn) return;

  openBtn.addEventListener('click', () => {
    // Reset to default tab.
    activeTab = 'imagevendor';
    for (const btn of document.querySelectorAll('.ii-tab')) {
      btn.classList.toggle('active', btn.dataset.tab === 'imagevendor');
    }
    loadTab('imagevendor');
    showModal('import-image-modal');
  });

  // Tab buttons.
  for (const btn of document.querySelectorAll('.ii-tab')) {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  }

  // File input.
  const fileInput = $('import-image-file');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      hideModal('import-image-modal');
      if (file) handleFileInput(file);
      // Reset so the same file can be picked again.
      fileInput.value = '';
    });
  }

  // Close button and backdrop are handled by main.js's generic [data-close] / backdrop listeners.
}

// Pure conversion for simple items; art uses the trusted library markup.
export function buildPigmentSVG(doc, getColoring = null) {
  const { w, h, bg } = doc.canvas;
  requireDimensions(w, h);
  if ((doc.items || []).some(it => it.kind === 'art') && !getColoring) throw new Error('Pigment art library is required.');
  const items = doc.items || [];
  const definitions = [];

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildPathD(points, closed) {
    if (!points || !points.length) return '';
    let d = `M${points[0][0]},${points[0][1]}`;
    for (let i = 1; i < points.length; i++) d += ` L${points[i][0]},${points[i][1]}`;
    if (closed) d += ' Z';
    return d;
  }

  function resolvePaint(p) {
    if (!p || typeof p !== 'object' || !p.grad) return p || '#000000';
    const id = 'sigma-import-grad-' + definitions.length;
    const stops = (p.stops || []).map(s => `<stop offset="${esc(s.at)}" stop-color="${esc(s.color)}"/>`).join('');
    if (p.grad === 'radial') {
      definitions.push(`<radialGradient id="${id}">${stops}</radialGradient>`);
    } else {
      const rad = (Number(p.angle) || 0) * Math.PI / 180;
      definitions.push(`<linearGradient id="${id}" x1="${0.5 - Math.cos(rad) / 2}" y1="${0.5 - Math.sin(rad) / 2}" x2="${0.5 + Math.cos(rad) / 2}" y2="${0.5 + Math.sin(rad) / 2}">${stops}</linearGradient>`);
    }
    return `url(#${id})`;
  }

  const bodyParts = [];
  if (bg && bg !== 'transparent') {
    bodyParts.push(`<rect x="0" y="0" width="${w}" height="${h}" fill="${esc(bg)}"/>`);
  }

  for (const it of items) {
    const outputStart = bodyParts.length;
    if (it.kind === 'stroke') {
      const d = buildPathD(it.points, false);
      if (d) bodyParts.push(`<path fill="none" stroke="${esc(resolvePaint(it.color))}" stroke-width="${it.size || 2}" stroke-linecap="round" stroke-linejoin="round" d="${esc(d)}"/>`);
    } else if (it.kind === 'region') {
      const d = buildPathD(it.points, true);
      if (d) bodyParts.push(`<path fill="${esc(resolvePaint(it.fill))}" stroke="${esc(it.stroke || '#1e1e1e')}" stroke-width="${it.strokeWidth ?? 2}" stroke-linejoin="round" d="${esc(d)}"/>`);
    } else if (it.kind === 'art' && getColoring) {
      const piece = getColoring(it.artId);
      if (!piece) throw new Error('Unknown Pigment art: ' + it.artId);
      const sx = it.w / 200;
      const sy = it.h / 200;
      const fills = it.fills || {};
      // Apply fills to markup via a temporary DOM element.
      const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      tmp.innerHTML = piece.markup;
      for (const child of Array.from(tmp.children)) {
        const regionId = child.getAttribute('data-region');
        if (regionId) child.setAttribute('fill', resolvePaint(fills[regionId] || '#ffffff'));
      }
      const inner = Array.from(tmp.children).map(c => new XMLSerializer().serializeToString(c)).join('');
      bodyParts.push(`<g transform="translate(${it.x} ${it.y}) scale(${sx} ${sy})">${inner}</g>`);
    } else if (it.kind === 'image') {
      const escSrc = esc(requireRaster(it.src));
      bodyParts.push(`<image href="${escSrc}" x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" preserveAspectRatio="none"/>`);
    }
  
    if (bodyParts.length > outputStart) {
      const opacity = Math.min(1, Math.max(0, Number(it.opacity ?? 1)));
      const rotation = it.kind === 'image' && Number.isFinite(it.rotation)
        ? ' transform="rotate(' + it.rotation + ' ' + (Number(it.x) + Number(it.w) / 2) + ' ' + (Number(it.y) + Number(it.h) / 2) + ')"' : '';
      const index = bodyParts.length - 1;
      bodyParts[index] = '<g opacity="' + (Number.isFinite(opacity) ? opacity : 1) + '"' + rotation + '>' + bodyParts[index] + '</g>';
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n<defs>${definitions.join('')}</defs>\n${bodyParts.join('\n')}\n</svg>`;

}
