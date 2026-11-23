// interop.js — cross-app import/export for ImageVendor
// Loaded lazily via dynamic import() from app.js event handlers.

import {
  api,
  redirectIfSignedOut,
  getName,
  getCanvasSize,
  getCompositeCanvas,
  addImageLayer,
  setStatus,
  closeModal,
} from '/imagevendor/js/app.js';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Replace non-filename-safe chars, collapse spaces to dashes, fallback. */
function safe(name) {
  return (String(name || '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-')) || 'image';
}

/** Blob -> object URL -> <a download> -> click, revoke after 5s. */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Preserve original resolution and alpha for cross-app handoffs.
 * Reject oversized payloads before creating an empty destination document.
 */
function makeHandoff(canvas) {
  const src = canvas.toDataURL('image/png');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(src)) {
    throw new Error('Image encoding failed');
  }
  // Both destination APIs accept 8 MiB of document JSON. Leave room for
  // geometry and metadata; never silently resize or flatten transparency.
  if (src.length > 8 * 1024 * 1024 - 4096) {
    throw new Error('Image exceeds the 8 MB transfer limit. Resize it or download a PNG instead.');
  }
  return src;
}

/**
 * Render an SVG string to a canvas of size w×h.
 * The source SVG defines its own background, including transparency.
 */
function svgToImage(svgString, w, h) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas);
      } catch (err) { reject(err); }
      finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('SVG render failed'));
    };
    img.src = url;
  });
}

// ─── SIGMA SERIALISER ─────────────────────────────────────────────────────────
// Mirrors placeholder/js/design-import.js sigmaToSVG exactly.

function sigmaPaint(n) {
  let s = ' fill="' + esc(n.fill && n.fill !== 'none' ? n.fill : 'none') + '"';
  if (n.stroke && n.stroke !== 'none' && (n.strokeWidth || 0) > 0) {
    s += ' stroke="' + esc(n.stroke) + '" stroke-width="' + (Number(n.strokeWidth) || 1) + '"';
  }
  return s;
}

function sigmaPolyPoints(n) {
  const cx = n.w / 2, cy = n.h / 2;
  const sides = Math.max(3, n.sides || 3);
  const star = n.type === 'star';
  const steps = star ? sides * 2 : sides;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / steps;
    const ratio = star && i % 2 === 1 ? (n.innerRatio != null ? n.innerRatio : 0.45) : 1;
    pts.push(
      (n.x + cx + cx * ratio * Math.cos(a)).toFixed(2) + ','
      + (n.y + cy + cy * ratio * Math.sin(a)).toFixed(2)
    );
  }
  return pts.join(' ');
}

function sigmaPathD(n) {
  if (!n.points || n.points.length < 2) return '';
  let d = n.points.map((p, i) =>
    (i === 0 ? 'M' : 'L') + (n.x + p[0]).toFixed(2) + ' ' + (n.y + p[1]).toFixed(2)
  ).join(' ');
  if (n.closed) d += ' Z';
  return d;
}

function sigmaNodeSVG(n, clipart) {
  if (n.visible === false) return '';
  const rot = n.rotation
    ? ' transform="rotate(' + n.rotation + ' ' + (n.x + n.w / 2) + ' ' + (n.y + n.h / 2) + ')"'
    : '';
  const op = (n.opacity != null && n.opacity < 1) ? ' opacity="' + n.opacity + '"' : '';

  if (n.type === 'rect') {
    return '<rect x="' + n.x + '" y="' + n.y
      + '" width="' + Math.max(0.01, n.w) + '" height="' + Math.max(0.01, n.h)
      + '" rx="' + (n.rx || 0) + '"' + sigmaPaint(n) + op + rot + '/>';
  }
  if (n.type === 'ellipse') {
    return '<ellipse cx="' + (n.x + n.w / 2) + '" cy="' + (n.y + n.h / 2)
      + '" rx="' + Math.max(0.01, n.w / 2) + '" ry="' + Math.max(0.01, n.h / 2) + '"'
      + sigmaPaint(n) + op + rot + '/>';
  }
  if (n.type === 'polygon' || n.type === 'star') {
    return '<polygon points="' + sigmaPolyPoints(n) + '"' + sigmaPaint(n) + op + rot + '/>';
  }
  if (n.type === 'path' || n.type === 'line') {
    const fill = n.closed && n.fill && n.fill !== 'none' ? esc(n.fill) : 'none';
    let s = '<path d="' + sigmaPathD(n) + '" fill="' + fill + '"';
    if (n.stroke && n.stroke !== 'none' && (n.strokeWidth || 0) > 0) {
      s += ' stroke="' + esc(n.stroke) + '" stroke-width="' + (Number(n.strokeWidth) || 1)
        + '" stroke-linecap="round" stroke-linejoin="round"';
    }
    return s + op + rot + '/>';
  }
  if (n.type === 'text') {
    const fs = n.fontSize || 24, lh = fs * 1.25;
    let anchor = '', tx = n.x;
    if (n.align === 'center') { anchor = ' text-anchor="middle"'; tx = n.x + (n.w || 0) / 2; }
    else if (n.align === 'right') { anchor = ' text-anchor="end"'; tx = n.x + (n.w || 0); }
    const spans = String(n.text || '').split('\n').map((line, i) =>
      '<tspan x="' + tx + '" y="' + (n.y + fs * 0.9 + i * lh) + '">'
      + (esc(line) || ' ') + '</tspan>'
    ).join('');
    return '<text font-family="' + esc(n.fontFamily || 'Arial') + '" font-size="' + fs
      + '" font-weight="' + (n.fontWeight || 400) + '" fill="' + esc(n.fill || '#1e1e1e') + '"'
      + anchor + op + rot + ' xml:space="preserve">' + spans + '</text>';
  }
  if (n.type === 'clipart') {
    if (!clipart || !clipart.getClipart) throw new Error('Sigma clipart library could not load. Please retry.');
    const art = clipart.getClipart(n.clipartId);
    if (!art) throw new Error('Unknown Sigma clipart: ' + n.clipartId);
    const tint = art.tintable ? ' color="' + esc(n.tint || '#c96f2e') + '"' : '';
    return '<g' + op + rot + '><g transform="translate(' + n.x + ' ' + n.y + ') scale('
      + (n.w / 100) + ' ' + (n.h / 100) + ')"' + tint + '>' + art.markup + '</g></g>';
  }
  if (n.type === 'image') {
    return '<image href="' + esc(n.src || '') + '" x="' + n.x + '" y="' + n.y
      + '" width="' + Math.max(0.01, n.w) + '" height="' + Math.max(0.01, n.h) + '"'
      + op + rot + '/>';
  }
  return '';
}

async function sigmaToSVG(docObj) {
  const ab = docObj.artboard || { w: 1280, h: 800, bg: '#ffffff' };
  const nodes = Array.isArray(docObj.nodes) ? docObj.nodes : [];
  const visible = nodes.filter(n => n.visible !== false);

  let clipart = null;
  if (visible.some(n => n.type === 'clipart')) {
    try { clipart = await import('/sigma/js/editor/clipart.js'); } catch (e) { throw new Error('Sigma clipart library could not load. Please retry.'); }
  }

  const body = visible.map(n => sigmaNodeSVG(n, clipart)).join('');
  const w = ab.w, h = ab.h;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h
    + '" viewBox="0 0 ' + w + ' ' + h + '">'
    + '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="' + esc(ab.bg || '#ffffff') + '"/>'
    + body + '</svg>';
}

// ─── PIGMENT SERIALISER ────────────────────────────────────────────────────────
// Mirrors placeholder/js/design-import.js pigmentToSVG exactly.

function isGradient(p) { return !!(p && typeof p === 'object' && p.grad); }

function gradKey(p) {
  let s = JSON.stringify(p), h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function paintResolver(defsMap) {
  return function (p) {
    if (!isGradient(p)) return p || 'none';
    const id = 'pg-' + gradKey(p);
    if (!defsMap.has(id)) defsMap.set(id, p);
    return 'url(#' + id + ')';
  };
}

function gradientDefsSVG(defsMap) {
  if (!defsMap.size) return '';
  let out = '<defs>';
  for (const [id, p] of defsMap) {
    if (p.grad === 'radial') {
      out += '<radialGradient id="' + id + '">';
    } else {
      const rad = (Number(p.angle) || 0) * Math.PI / 180;
      out += '<linearGradient id="' + id + '"'
        + ' x1="' + (0.5 - Math.cos(rad) / 2).toFixed(4) + '"'
        + ' y1="' + (0.5 - Math.sin(rad) / 2).toFixed(4) + '"'
        + ' x2="' + (0.5 + Math.cos(rad) / 2).toFixed(4) + '"'
        + ' y2="' + (0.5 + Math.sin(rad) / 2).toFixed(4) + '">';
    }
    for (const s of (p.stops || [])) {
      out += '<stop offset="' + s.at + '" stop-color="' + esc(s.color) + '"/>';
    }
    out += p.grad === 'radial' ? '</radialGradient>' : '</linearGradient>';
  }
  return out + '</defs>';
}

function pathD(points, closed) {
  if (!points || !points.length) return '';
  if (points.length === 1) {
    const p = points[0];
    return 'M' + p[0] + ',' + p[1] + ' L' + p[0] + ',' + p[1];
  }
  let d = 'M' + points[0][0] + ',' + points[0][1];
  for (let i = 1; i < points.length; i++) d += ' L' + points[i][0] + ',' + points[i][1];
  if (closed) d += ' Z';
  return d;
}

function applyArtFills(markup, fills, resolve) {
  let parsed;
  try {
    parsed = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg">' + markup + '</svg>', 'image/svg+xml'
    );
  } catch (e) { return markup; }
  const root = parsed.documentElement;
  if (!root || parsed.querySelector('parsererror')) return markup;
  root.querySelectorAll('[data-region]').forEach((el) => {
    const rid = el.getAttribute('data-region');
    el.setAttribute('fill', resolve((fills && fills[rid]) || '#ffffff'));
  });
  let out = '';
  for (const child of Array.from(root.childNodes)) {
    out += new XMLSerializer().serializeToString(child);
  }
  return out;
}

async function pigmentToSVG(docObj) {
  const c = docObj.canvas || { w: 1600, h: 1000, bg: '#ffffff' };
  const items = Array.isArray(docObj.items) ? docObj.items : [];

  let lib = null;
  if (items.some(i => i.kind === 'art')) {
    try { lib = await import('/pigment/js/library.js'); } catch (e) { throw new Error('Pigment artwork library could not load. Please retry.'); }
  }

  const defsMap = new Map();
  const resolve = paintResolver(defsMap);
  const parts = [];

  for (const item of items) {
    const outputStart = parts.length;
    if (item.kind === 'stroke') {
      parts.push('<path fill="none" stroke="' + esc(resolve(item.color))
        + '" stroke-width="' + (item.size || 4)
        + '" stroke-linecap="round" stroke-linejoin="round" d="' + pathD(item.points, false) + '"/>');
    } else if (item.kind === 'region') {
      parts.push('<path fill="' + esc(resolve(item.fill))
        + '" stroke="' + esc(item.stroke || '#1e1e1e')
        + '" stroke-width="' + (item.strokeWidth ?? 2)
        + '" stroke-linejoin="round" d="' + pathD(item.points, true) + '"/>');
    } else if (item.kind === 'art') {
      const piece = lib && lib.getColoring ? lib.getColoring(item.artId) : null;
      if (!piece) throw new Error('Unknown Pigment artwork: ' + item.artId);
      const sx = item.w / 200, sy = item.h / 200;
      const inner = applyArtFills(piece.markup, item.fills || {}, resolve);
      parts.push('<g transform="translate(' + item.x + ' ' + item.y + ') scale('
        + sx + ' ' + sy + ')">' + inner + '</g>');
    } else if (item.kind === 'image') {
      parts.push('<image href="' + esc(item.src || '') + '" x="' + item.x + '" y="' + item.y
        + '" width="' + Math.max(0.01, item.w) + '" height="' + Math.max(0.01, item.h) + '"/>');
    }
  
    // Preserve per-item appearance when passing Pigment artwork between apps.
    if (parts.length > outputStart) {
      const opacity = Math.min(1, Math.max(0, Number(item.opacity ?? 1)));
      const rotation = item.kind === 'image' && Number.isFinite(item.rotation)
        ? ' transform="rotate(' + item.rotation + ' ' + (Number(item.x) + Number(item.w) / 2) + ' ' + (Number(item.y) + Number(item.h) / 2) + ')"' : '';
      const index = parts.length - 1;
      parts[index] = '<g opacity="' + (Number.isFinite(opacity) ? opacity : 1) + '"' + rotation + '>' + parts[index] + '</g>';
    }
  }

  const w = c.w, h = c.h;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h
    + '" viewBox="0 0 ' + w + ' ' + h + '">'
    + gradientDefsSVG(defsMap)
    + '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="' + esc(c.bg || '#ffffff') + '"/>'
    + parts.join('') + '</svg>';
}

// ─── IMPORT: list items from a source app ────────────────────────────────────

let listRevision = 0;
export async function listFrom(src) {
  const revision = ++listRevision;
  const grid = document.getElementById('import-grid');
  if (!grid) return;

  // Defensive tab activation (app.js may already do this)
  document.querySelectorAll('.import-src').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.src === src);
    btn.setAttribute('aria-selected', String(btn.dataset.src === src));
  });

  // Placeholder is a converter — no list to show
  if (src === 'placeholder') {
    grid.innerHTML = '<p class="grid-msg grid-msg-info">'
      + 'Placeholder converts files — use the “Your computer” tab to load a file, '
      + 'or open Placeholder and import this image there.</p>';
    return;
  }

  grid.innerHTML = '<p class="grid-msg">Loading…</p>';

  const listPath = src === 'sigma' ? '/api/projects' : '/api/paintings';
  const listKey  = src === 'sigma' ? 'projects'     : 'paintings';

  let items = [];
  try {
    const data = await api(listPath);
    items = (data && data[listKey]) || [];
  } catch (err) {
    if (redirectIfSignedOut(err) || revision !== listRevision) return;
    grid.innerHTML = '<p class="grid-msg">Could not load from '
      + esc(src) + ': ' + esc(err.message) + '</p>';
    return;
  }

  if (revision !== listRevision || !document.querySelector('.import-src.active')?.matches('[data-src="' + src + '"]')) return;
  grid.innerHTML = '';

  if (!items.length) {
    const label = src === 'sigma' ? 'Sigma projects' : 'Pigment paintings';
    grid.innerHTML = '<p class="grid-msg">No ' + label + ' found. Create one first!</p>';
    return;
  }

  for (const item of items) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'import-item';
    const thumbHTML = item.thumbnail
      ? '<img src="' + esc(item.thumbnail) + '" alt="" class="import-card-img">'
      : '';
    card.innerHTML = thumbHTML
      + '<div class="import-card-name">'
      + esc(item.name || 'Untitled') + '</div>';

    card.addEventListener('click', async () => {
      grid.innerHTML = '<p class="grid-msg">Loading “'
        + esc(item.name || 'Untitled') + '”…</p>';
      try {
        let canvas;
        if (src === 'sigma') {
          const full = await api('/api/projects/' + item.id);
          const docObj = full.project.document;
          const ab = docObj.artboard || { w: 1280, h: 800 };
          const svgStr = await sigmaToSVG(docObj);
          canvas = await svgToImage(svgStr, ab.w, ab.h);
        } else {
          const full = await api('/api/paintings/' + item.id);
          const docObj = full.painting.document;
          const c = docObj.canvas || { w: 1600, h: 1000 };
          const svgStr = await pigmentToSVG(docObj);
          canvas = await svgToImage(svgStr, c.w, c.h);
        }
        addImageLayer(canvas, item.name || 'Imported');
        closeModal('import-modal');
      } catch (err) {
        if (redirectIfSignedOut(err)) return;
        grid.innerHTML = '<p class="grid-msg">Failed to import: '
          + esc(err.message) + '</p>';
      }
    });

    grid.appendChild(card);
  }
}

// ─── EXPORT: run the export chosen in the modal ────────────────────────────────

export async function runExport() {
  const modeEl    = document.getElementById('export-mode');
  const qualityEl = document.getElementById('export-quality');
  const goBtn     = document.getElementById('export-go');

  const mode    = modeEl    ? modeEl.value                           : 'png';
  const quality = qualityEl ? (parseInt(qualityEl.value, 10) || 90) / 100 : 0.9;

  function closeExportModal() {
    closeModal('export-modal');
  }

  function disableGo(yes) {
    if (goBtn) goBtn.disabled = yes;
  }

  if (goBtn?.disabled) return;
  if (mode === 'png' || mode === 'jpeg') {
    disableGo(true);
    try {
      let canvas = getCompositeCanvas();
      if (mode === 'jpeg') {
        const flat = document.createElement('canvas');
        flat.width = canvas.width; flat.height = canvas.height;
        const ctx = flat.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, flat.width, flat.height);
        ctx.drawImage(canvas, 0, 0);
        canvas = flat;
      }
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(value => value ? resolve(value) : reject(new Error('Image encoding failed')), mode === 'jpeg' ? 'image/jpeg' : 'image/png', quality);
      });
      downloadBlob(blob, safe(getName()) + (mode === 'jpeg' ? '.jpg' : '.png'));
      closeExportModal();
    } catch (err) { setStatus('Export failed: ' + err.message, 'error'); }
    finally { disableGo(false); }
    return;
  }

  // ── Cross-app exports ─────────────────────────────────────────────
  disableGo(true);
  setStatus('Exporting…', 'saving');

  try {
    if (mode === 'sigma') {
      const src = makeHandoff(getCompositeCanvas());
      const { w, h } = getCanvasSize();
      const created = await api('/api/projects', {
        method: 'POST',
        body: { name: (getName().trim() || 'Untitled image').slice(0, 61) + ' (from ImageVendor)' },
      });
      const id = (created.project || created).id;
      await api('/api/projects/' + id, {
        method: 'PUT',
        body: {
          document: {
            version: 1,
            artboard: { name: 'Artboard', w, h, bg: 'transparent' },
            nodes: [{
              id: 'iv-' + Date.now(),
              type: 'image',
              name: 'ImageVendor',
              x: 0, y: 0, w, h,
              rotation: 0, opacity: 1,
              visible: true, locked: false, groupId: null,
              src,
            }],
          },
        },
      });
      setStatus('Sent to Sigma ✓', '');

      closeExportModal();

    } else if (mode === 'pigment') {
      const src = makeHandoff(getCompositeCanvas());
      const { w, h } = getCanvasSize();
      const created = await api('/api/paintings', {
        method: 'POST',
        body: { name: (getName().trim() || 'Untitled image').slice(0, 61) + ' (from ImageVendor)' },
      });
      const id = (created.painting || created).id;
      await api('/api/paintings/' + id, {
        method: 'PUT',
        body: {
          document: {
            version: 1,
            canvas: { w, h, bg: 'transparent' },
            items: [{ kind: 'image', x: 0, y: 0, w, h, src }],
          },
        },
      });
      setStatus('Sent to Pigment ✓', '');

      closeExportModal();

    } else if (mode === 'placeholder') {
      setStatus('Opening Placeholder…', 'saving');
      setTimeout(() => {
        window.location.href = '/placeholder/convert.html';
      }, 400);

    } else {
      setStatus('Unknown export mode', 'error');
      disableGo(false);
    }
  } catch (err) {
    if (redirectIfSignedOut(err)) return;
    setStatus('Export failed: ' + err.message, 'error');
  } finally {
    disableGo(false);
  }
}
