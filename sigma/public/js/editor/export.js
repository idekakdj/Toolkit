// Export: build a standalone SVG from the document, rasterize to PNG/JPEG.
import { state, getSelectedNodes, selectionBBox, nodeAABB } from './state.js';
import { polygonPoints, pathD, textLines } from './render.js';
import { getClipart } from './clipart.js';

function esc(s) {
  return String(s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function paint(n) {
  let s = ` fill="${esc(n.fill && n.fill !== 'none' ? n.fill : 'none')}"`;
  if (n.stroke && n.stroke !== 'none' && (n.strokeWidth || 0) > 0) {
    s += ` stroke="${esc(n.stroke)}" stroke-width="${Number(n.strokeWidth) || 1}"`;
  }
  return s;
}

function nodeSVG(n) {
  if (!n.visible) return '';
  const rot = n.rotation
    ? ` transform="rotate(${n.rotation} ${n.x + n.w / 2} ${n.y + n.h / 2})"` : '';
  const op = (n.opacity ?? 1) < 1 ? ` opacity="${n.opacity}"` : '';

  if (n.type === 'rect') {
    return `<rect x="${n.x}" y="${n.y}" width="${Math.max(0.01, n.w)}" height="${Math.max(0.01, n.h)}" rx="${n.rx || 0}"${paint(n)}${op}${rot}/>`;
  }
  if (n.type === 'ellipse') {
    return `<ellipse cx="${n.x + n.w / 2}" cy="${n.y + n.h / 2}" rx="${Math.max(0.01, n.w / 2)}" ry="${Math.max(0.01, n.h / 2)}"${paint(n)}${op}${rot}/>`;
  }
  if (n.type === 'polygon' || n.type === 'star') {
    return `<polygon points="${polygonPoints(n)}"${paint(n)}${op}${rot}/>`;
  }
  if (n.type === 'path' || n.type === 'line') {
    const fill = n.closed && n.fill && n.fill !== 'none' ? esc(n.fill) : 'none';
    let s = `<path d="${pathD(n)}" fill="${fill}"`;
    if (n.stroke && n.stroke !== 'none' && (n.strokeWidth || 0) > 0) {
      s += ` stroke="${esc(n.stroke)}" stroke-width="${Number(n.strokeWidth) || 1}" stroke-linecap="round" stroke-linejoin="round"`;
    }
    return s + `${op}${rot}/>`;
  }
  if (n.type === 'text') {
    const fs = n.fontSize || 24;
    const lh = fs * 1.25;
    let anchor = '', tx = n.x;
    if (n.align === 'center') { anchor = ' text-anchor="middle"'; tx = n.x + (n.w || 0) / 2; }
    if (n.align === 'right') { anchor = ' text-anchor="end"'; tx = n.x + (n.w || 0); }
    const spans = textLines(n).map((line, i) =>
      `<tspan x="${tx}" y="${n.y + fs * 0.9 + i * lh}">${esc(line) || ' '}</tspan>`).join('');
    return `<text font-family="${esc(n.fontFamily || 'Arial')}" font-size="${fs}" font-weight="${n.fontWeight || 400}" fill="${esc(n.fill || '#1e1e1e')}"${anchor}${op}${rot} xml:space="preserve">${spans}</text>`;
  }
  if (n.type === 'clipart') {
    const art = getClipart(n.clipartId);
    if (!art) return '';
    const tint = art.tintable ? ` color="${esc(n.tint || '#c96f2e')}"` : '';
    return `<g${op}${rot}><g transform="translate(${n.x} ${n.y}) scale(${n.w / 100} ${n.h / 100})"${tint}>${art.markup}</g></g>`;
  }
  return '';
}

// scope: 'artboard' | 'selection'
export function buildSVG(scope) {
  const ab = state.doc.artboard;
  let view, includeBg, nodes;
  if (scope === 'selection' && state.selection.length) {
    const sel = getSelectedNodes();
    let b = selectionBBox();
    // Pad for strokes.
    const pad = Math.max(2, ...sel.map(n => (n.strokeWidth || 0)));
    b = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
    view = b;
    includeBg = false;
    nodes = sel;
  } else {
    view = { x: 0, y: 0, w: ab.w, h: ab.h };
    includeBg = true;
    // Only nodes that intersect the artboard.
    nodes = state.doc.nodes.filter(n => {
      const b = nodeAABB(n);
      return b.x < ab.w && b.x + b.w > 0 && b.y < ab.h && b.y + b.h > 0;
    });
  }
  const body = nodes.map(nodeSVG).join('\n  ');
  const bg = includeBg
    ? `<rect x="0" y="0" width="${ab.w}" height="${ab.h}" fill="${esc(ab.bg)}"/>\n  ` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${view.w}" height="${view.h}" viewBox="${view.x} ${view.y} ${view.w} ${view.h}">\n  ${bg}${body}\n</svg>`;
}

function svgToImage(svgString) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not render image')); };
    img.src = url;
  });
}

export async function rasterize(scope, scale, format, quality = 0.92) {
  const svgString = buildSVG(scope);
  const dims = svgString.match(/width="([\d.]+)" height="([\d.]+)"/);
  const w = Math.max(1, Math.round(parseFloat(dims[1]) * scale));
  const h = Math.max(1, Math.round(parseFloat(dims[2]) * scale));
  const img = await svgToImage(svgString);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (format === 'image/jpeg') {
    ctx.fillStyle = state.doc.artboard.bg || '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob(resolve, format, quality));
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function safeName(name) {
  return (name || 'sigma-design').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'sigma-design';
}

export async function exportFile({ format, scale, scope }) {
  const base = safeName(state.projectName);
  if (format === 'svg') {
    const blob = new Blob([buildSVG(scope)], { type: 'image/svg+xml' });
    download(blob, `${base}.svg`);
    return;
  }
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await rasterize(scope, scale, mime);
  if (!blob) throw new Error('Export failed');
  download(blob, `${base}${scale > 1 ? '@' + scale + 'x' : ''}.${format === 'jpeg' ? 'jpg' : 'png'}`);
}

// Small JPEG thumbnail for the dashboard cards.
export async function makeThumbnail() {
  try {
    const ab = state.doc.artboard;
    const scale = Math.min(1, 280 / Math.max(1, ab.w));
    const blob = await rasterize('artboard', scale, 'image/jpeg', 0.7);
    if (!blob || blob.size > 200 * 1024) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
