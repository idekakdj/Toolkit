// Pigment – Sigma <-> Pigment interchange
// Imported by app.js event handlers (call-time only, not at module top level).

import { getColoring } from '/pigment/js/library.js';
import {
  api,
  redirectIfSignedOut,
  pushHistory,
  reRenderAndSave,
  setStatus,
  getDoc,
  getName,
  buildSheetSVG,
  flattenPaint,
} from '/pigment/js/app.js';

// ─── GEOMETRY HELPERS ────────────────────────────────────────────────────────

function bbox(points) {
  if (!points || points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function uid() {
  return 'n' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function rotatePoint(px, py, cx, cy, deg) {
  if (!deg) return [px, py];
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

function applyRotation(points, node) {
  if (!node.rotation) return points;
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  return points.map(([px, py]) => rotatePoint(px, py, cx, cy, node.rotation));
}

// ─── SVG RENDERING HELPERS ───────────────────────────────────────────────────

function svgImageToCanvas(svgStr, w, h) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(cv);
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─── SAMPLE ELEMENT PATH ────────────────────────────────────────────────────

function sampleElement(el, artItem, scale) {
  // Returns array of canvas-space points, or null if not possible
  let total = 0;
  try {
    total = el.getTotalLength ? el.getTotalLength() : 0;
  } catch {
    return null;
  }
  if (!total || total <= 0) return null;

  const step = 2.5;
  const maxSamples = 400;
  const numSamples = Math.min(maxSamples, Math.ceil(total / step) + 1);
  const points = [];
  for (let i = 0; i < numSamples; i++) {
    const t = (i / (numSamples - 1)) * total;
    let pt;
    try {
      pt = el.getPointAtLength(t);
    } catch {
      break;
    }
    // Transform from 0..200 local space to canvas space
    const cx = artItem.x + (pt.x * artItem.w / 200);
    const cy = artItem.y + (pt.y * artItem.h / 200);
    points.push([cx, cy]);
  }
  return points.length > 0 ? points : null;
}

// ─── BUILD SIGMA NODE FROM POINTS ────────────────────────────────────────────

function pointsToNode(points, closed, fillColor, strokeColor, strokeWidth, name) {
  const bb = bbox(points);
  const relPoints = points.map(([x, y]) => [x - bb.x, y - bb.y]);
  return {
    id: uid(),
    type: 'path',
    name,
    x: bb.x,
    y: bb.y,
    w: bb.w,
    h: bb.h,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    groupId: null,
    closed,
    fill: fillColor,
    stroke: strokeColor,
    strokeWidth,
    points: relPoints,
  };
}

// ─── EXPORT TO SIGMA ─────────────────────────────────────────────────────────

export async function exportToSigma() {
  const { canvas, items } = getDoc();
  const name = getName();

  let proj;
  try {
    proj = await api('/api/projects', {
      method: 'POST',
      body: { name: name + ' (from Pigment)' },
    });
  } catch (err) {
    if (redirectIfSignedOut(err)) return;
    setStatus('Send failed', 'error');
    return;
  }

  const projectId = (proj.project && proj.project.id) || proj.id;
  const nodes = [];
  const MAX_NODES = 900;

  // Offscreen svg for sampling art regions
  const offscreen = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  offscreen.setAttribute('width', '200');
  offscreen.setAttribute('height', '200');
  offscreen.setAttribute('viewBox', '0 0 200 200');
  offscreen.style.visibility = 'hidden';
  offscreen.style.position = 'absolute';
  offscreen.style.top = '-9999px';
  offscreen.style.left = '-9999px';
  document.body.appendChild(offscreen);

  for (const item of items) {
    if (nodes.length >= MAX_NODES) break;

    if (item.kind === 'stroke') {
      const b = bbox(item.points);
      nodes.push({
        id: uid(),
        type: 'path',
        name: 'Brush',
        x: b.x, y: b.y, w: b.w, h: b.h,
        rotation: 0, opacity: 1, visible: true, locked: false, groupId: null,
        closed: false,
        fill: 'none',
        stroke: flattenPaint(item.color),
        strokeWidth: item.size,
        points: item.points.map(([px, py]) => [px - b.x, py - b.y]),
      });

    } else if (item.kind === 'region') {
      const b = bbox(item.points);
      nodes.push({
        id: uid(),
        type: 'path',
        name: 'Shape',
        x: b.x, y: b.y, w: b.w, h: b.h,
        rotation: 0, opacity: 1, visible: true, locked: false, groupId: null,
        closed: true,
        fill: flattenPaint(item.fill),
        stroke: item.stroke || '#1e1e1e',
        strokeWidth: item.strokeWidth || 2,
        points: item.points.map(([px, py]) => [px - b.x, py - b.y]),
      });

    } else if (item.kind === 'art') {
      const piece = getColoring(item.artId);
      if (!piece) continue;
      const scale = item.w / 200;

      // Render markup into offscreen svg
      offscreen.innerHTML = piece.markup;
      const fills = item.fills || {};

      const allEls = Array.from(offscreen.querySelectorAll('*'));
      for (const el of allEls) {
        if (nodes.length >= MAX_NODES) break;
        const regionId = el.getAttribute('data-region');
        const isDetail = el.classList && el.classList.contains('detail');

        if (regionId) {
          const pts = sampleElement(el, item, scale);
          if (pts && pts.length > 0) {
            const fillColor = flattenPaint(fills[regionId] || '#ffffff');
            const sw = Math.max(1, 3 * scale);
            nodes.push(pointsToNode(pts, true, fillColor, '#1e1e1e', sw, 'Region'));
          }
        } else if (isDetail) {
          const pts = sampleElement(el, item, scale);
          if (pts && pts.length > 0) {
            const sw = Math.max(1, 2 * scale);
            nodes.push(pointsToNode(pts, false, 'none', '#1e1e1e', sw, 'Detail'));
          }
        }
      }

      offscreen.innerHTML = '';
    }
  }

  document.body.removeChild(offscreen);

  try {
    await api(`/api/projects/${projectId}`, {
      method: 'PUT',
      body: {
        document: {
          version: 1,
          artboard: {
            name: 'Artboard',
            w: canvas.w,
            h: canvas.h,
            bg: canvas.bg,
          },
          nodes,
        },
      },
    });
    setStatus('Sent to Sigma ✓', '');
    setTimeout(() => setStatus('Saved', ''), 3000);
  } catch (err) {
    if (redirectIfSignedOut(err)) return;
    setStatus('Send failed', 'error');
  }
}

// ─── OPEN IMPORT ──────────────────────────────────────────────────────────────

export async function openImport() {
  const grid = document.getElementById('import-grid');
  grid.innerHTML = '<p style="opacity:.6;padding:1rem;">Loading…</p>';

  let projects = [];
  try {
    const data = await api('/api/projects');
    projects = Array.isArray(data) ? data : (data.projects || []);
  } catch (err) {
    if (redirectIfSignedOut(err)) return;
    grid.innerHTML = '<p style="color:var(--c-err,red);padding:1rem;">Failed to load projects.</p>';
    return;
  }

  grid.innerHTML = '';
  if (projects.length === 0) {
    grid.innerHTML = '<p style="opacity:.6;padding:1rem;">No Sigma projects found.</p>';
    return;
  }

  for (const p of projects) {
    const row = document.createElement('div');
    row.className = 'import-item';
    const thumb = p.thumbnail ? `<img src="${p.thumbnail}" alt="">` : '';
    row.innerHTML = `${thumb}<span>${p.name || 'Untitled'}</span>`;
    row.addEventListener('click', async () => {
      try {
        const full = await api(`/api/projects/${p.id}`);
        const proj = full.project || full;
        const docData = proj.document || {};
        const rawNodes = docData.nodes || [];

        // Sigma clipart needs its source library + an offscreen SVG so we can
        // sample each piece's geometry into colourable Pigment shapes.
        let getClipart = null;
        let offscreen = null;
        if (rawNodes.some(n => n.type === 'clipart' && n.visible !== false)) {
          try {
            const mod = await import('/sigma/js/editor/clipart.js');
            getClipart = mod.getClipart;
          } catch { getClipart = null; }
          if (getClipart) {
            offscreen = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            offscreen.setAttribute('width', '100');
            offscreen.setAttribute('height', '100');
            offscreen.setAttribute('viewBox', '0 0 100 100');
            offscreen.style.cssText = 'visibility:hidden;position:absolute;left:-9999px;top:-9999px';
            document.body.appendChild(offscreen);
          }
        }

        const newItems = [];
        let skipped = 0;

        for (const node of rawNodes) {
          if (node.visible === false) { skipped++; continue; }
          if (node.type === 'text') { skipped++; continue; }

          if (node.type === 'clipart') {
            if (getClipart && offscreen) {
              const pieces = clipartToItems(node, getClipart, offscreen);
              if (pieces.length) newItems.push(...pieces);
              else skipped++;
            } else {
              skipped++;
            }
            continue;
          }

          const converted = convertNode(node);
          if (converted) newItems.push(converted);
          else skipped++;
        }

        if (offscreen) document.body.removeChild(offscreen);

        pushHistory();
        // Mutate the live items array (reRenderAndSave reads getDoc().items).
        const currentItems = getDoc().items;
        for (const it of newItems) {
          currentItems.push(it);
        }
        reRenderAndSave();

        // Close modal
        const modal = document.getElementById('import-modal');
        if (modal) modal.classList.remove('show');

        setStatus(`Imported ${newItems.length} shapes (${skipped} skipped)`, '');
        setTimeout(() => setStatus('Saved', ''), 4000);
      } catch (err) {
        if (!redirectIfSignedOut(err)) {
          setStatus('Import failed', 'error');
        }
      }
    });
    grid.appendChild(row);
  }
}

function convertNode(node) {
  const x = node.x || 0;
  const y = node.y || 0;
  const w = node.w || 0;
  const h = node.h || 0;
  const type = node.type;

  let points = null;
  let isRegion = false;

  if (type === 'rect') {
    points = [
      [x, y], [x + w, y], [x + w, y + h], [x, y + h],
    ];
    isRegion = true;
  } else if (type === 'ellipse') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    points = [];
    for (let i = 0; i < 48; i++) {
      const t = (i / 48) * 2 * Math.PI;
      points.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
    }
    isRegion = true;
  } else if (type === 'polygon' || type === 'star') {
    const cx2 = w / 2;
    const cy2 = h / 2;
    const sides = Math.max(3, node.sides || 3);
    const isStar = type === 'star';
    const steps = isStar ? sides * 2 : sides;
    points = [];
    for (let i = 0; i < steps; i++) {
      const angle = -Math.PI / 2 + i * 2 * Math.PI / steps;
      const ratio = (isStar && i % 2 === 1) ? (node.innerRatio != null ? node.innerRatio : 0.45) : 1;
      points.push([
        x + cx2 + cx2 * ratio * Math.cos(angle),
        y + cy2 + cy2 * ratio * Math.sin(angle),
      ]);
    }
    isRegion = true;
  } else if (type === 'path') {
    const rawPts = node.points || [];
    points = rawPts.map(p => [x + p[0], y + p[1]]);
    isRegion = !!node.closed;
  } else if (type === 'line') {
    const rawPts = node.points || [];
    points = rawPts.map(p => [x + p[0], y + p[1]]);
    isRegion = false;
  } else {
    return null;
  }

  if (!points || points.length === 0) return null;

  // Apply rotation
  points = applyRotation(points, node);

  if (isRegion) {
    const fill = (node.fill && node.fill !== 'none') ? node.fill : '#ffffff';
    return {
      kind: 'region',
      points,
      fill,
      stroke: '#1e1e1e',
      strokeWidth: 2,
    };
  } else {
    const color = (node.stroke && node.stroke !== 'none') ? node.stroke : '#1e1e1e';
    return {
      kind: 'stroke',
      points,
      color,
      size: node.strokeWidth || 3,
    };
  }
}

// ─── SIGMA CLIPART → PIGMENT ITEMS ───────────────────────────────────────────

// Normalise a CSS colour (rgb()/rgba()/hex/named) to a hex string, or null
// for no-paint values ('none', transparent).
function normalizeColor(c) {
  if (!c) return null;
  c = c.trim();
  if (c === 'none' || c === 'transparent') return null;
  const m = c.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = m[1].split(',').map(s => parseFloat(s.trim()));
    const [r, g, b, a] = parts;
    if (a === 0) return null;
    const hex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return '#' + hex(r) + hex(g) + hex(b);
  }
  if (c === 'currentColor') return null;
  return c; // already a hex or named colour
}

// Sample one clipart element's outline into canvas-space points. Uses the
// element's CTM so nested group transforms inside the markup are respected.
function sampleClipartElement(el, node, svgRoot) {
  let total;
  try { total = el.getTotalLength(); } catch { return null; }
  if (!(total > 0)) return null;
  const ctm = el.getCTM();
  const sp = svgRoot.createSVGPoint();
  const numSamples = Math.min(400, Math.max(2, Math.ceil(total / 2.5) + 1));
  const sx = node.w / 100, sy = node.h / 100;   // clipart markup is a 100×100 viewBox
  const pts = [];
  for (let i = 0; i < numSamples; i++) {
    const t = (i / (numSamples - 1)) * total;
    let p;
    try { p = el.getPointAtLength(t); } catch { break; }
    let vx = p.x, vy = p.y;
    if (ctm) { sp.x = p.x; sp.y = p.y; const tp = sp.matrixTransform(ctm); vx = tp.x; vy = tp.y; }
    pts.push([node.x + vx * sx, node.y + vy * sy]);
  }
  return pts.length >= 2 ? pts : null;
}

// Flatten a Sigma clipart node into colourable Pigment region/stroke items.
function clipartToItems(node, getClipart, offscreen) {
  const piece = getClipart(node.clipartId);
  if (!piece) return [];
  const tint = node.tint || '#c96f2e';
  let markup = piece.markup;
  // Tintable clipart paints with currentColor; bake the node's tint in so the
  // resolved fill is correct regardless of the host page's colour.
  if (piece.tintable) markup = markup.replace(/currentColor/g, tint);
  offscreen.innerHTML = markup;

  const scale = node.w / 100;
  const items = [];
  const els = offscreen.querySelectorAll('path, circle, ellipse, rect, polygon, polyline, line');
  for (const el of els) {
    const pts = sampleClipartElement(el, node, offscreen);
    if (!pts) continue;
    const rotated = applyRotation(pts, node);
    const cs = window.getComputedStyle(el);
    const strokeCol = normalizeColor(cs.stroke);
    const strokeW = Math.max(1, (parseFloat(cs.strokeWidth) || 1) * scale);

    if (el.tagName.toLowerCase() === 'line') {
      // A bare line is never filled → a brush stroke.
      items.push({ kind: 'stroke', points: rotated, color: strokeCol || '#1e1e1e', size: strokeW });
      continue;
    }
    const fill = normalizeColor(cs.fill);
    if (fill) {
      items.push({
        kind: 'region',
        points: rotated,
        fill,
        stroke: strokeCol || 'none',
        strokeWidth: strokeCol ? strokeW : 0,
      });
    } else if (strokeCol) {
      items.push({ kind: 'stroke', points: rotated, color: strokeCol, size: strokeW });
    }
  }
  offscreen.innerHTML = '';
  return items;
}

// ─── DOWNLOAD SVG ────────────────────────────────────────────────────────────

export function downloadSVG() {
  const svgStr = buildSheetSVG();
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const filename = (getName() || 'painting') + '.svg';
  triggerDownload(blob, filename);
}

// ─── DOWNLOAD PNG ────────────────────────────────────────────────────────────

export async function downloadPNG() {
  const { canvas } = getDoc();
  const svgStr = buildSheetSVG();
  try {
    const cv = await svgImageToCanvas(svgStr, canvas.w, canvas.h);
    cv.toBlob((blob) => {
      if (!blob) { alert('PNG export failed.'); return; }
      const filename = (getName() || 'painting') + '.png';
      triggerDownload(blob, filename);
    }, 'image/png');
  } catch (e) {
    alert('PNG export failed: ' + e.message);
  }
}
