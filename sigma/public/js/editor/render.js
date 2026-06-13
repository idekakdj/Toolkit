// Rendering: document nodes -> SVG, view transforms, selection overlay.
import { state, getSelectedNodes, selectionBBox, nodeCorners, rotatePoint } from './state.js';
import { getClipart } from './clipart.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

let svg, worldGroup, artboardGroup, nodesGroup, overlayGroup;
let marqueeRect = null;   // {x,y,w,h} in world space, or null
let penPreview = null;    // {points: [...], cursor: {x,y}, closed} in world space

export function initRender(svgEl) {
  svg = svgEl;
  worldGroup = el('g');
  artboardGroup = el('g');
  nodesGroup = el('g');
  overlayGroup = el('g');
  worldGroup.append(artboardGroup, nodesGroup);
  svg.append(worldGroup, overlayGroup);
  applyView();
}

function el(tag, attrs = {}) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// ---------- coordinate transforms ----------
export function screenToWorld(p) {
  return { x: (p.x - state.pan.x) / state.zoom, y: (p.y - state.pan.y) / state.zoom };
}
export function worldToScreen(p) {
  return { x: p.x * state.zoom + state.pan.x, y: p.y * state.zoom + state.pan.y };
}
export function eventPoint(e) {
  const r = svg.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

export function applyView() {
  worldGroup.setAttribute('transform',
    `translate(${state.pan.x} ${state.pan.y}) scale(${state.zoom})`);
  renderOverlay();
}

// ---------- document rendering ----------
export function renderDoc() {
  const ab = state.doc.artboard;
  artboardGroup.replaceChildren(
    el('rect', {
      x: -4 / state.zoom, y: -4 / state.zoom,
      width: ab.w + 8 / state.zoom, height: ab.h + 8 / state.zoom,
      fill: 'rgba(0,0,0,0.25)', rx: 4 / state.zoom,
    }),
    el('rect', { x: 0, y: 0, width: ab.w, height: ab.h, fill: ab.bg, 'data-artboard': '1' }),
  );

  nodesGroup.replaceChildren();
  for (const n of state.doc.nodes) {
    if (!n.visible) continue;
    const e = renderNode(n);
    if (e) nodesGroup.appendChild(e);
  }
  measureTextNodes();
  renderOverlay();
}

function rotationTransform(n) {
  const r = n.rotation || 0;
  if (!r) return '';
  return `rotate(${r} ${n.x + n.w / 2} ${n.y + n.h / 2})`;
}

function paintAttrs(n) {
  const attrs = {};
  attrs.fill = n.fill && n.fill !== 'none' ? n.fill : 'none';
  if (n.stroke && n.stroke !== 'none' && (n.strokeWidth || 0) > 0) {
    attrs.stroke = n.stroke;
    attrs['stroke-width'] = n.strokeWidth;
  }
  return attrs;
}

export function polygonPoints(n) {
  const cx = n.w / 2, cy = n.h / 2;
  const sides = Math.max(3, n.sides || 3);
  const pts = [];
  const star = n.type === 'star';
  const steps = star ? sides * 2 : sides;
  for (let i = 0; i < steps; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / steps;
    const ratio = star && i % 2 === 1 ? (n.innerRatio ?? 0.45) : 1;
    pts.push([
      n.x + cx + cx * ratio * Math.cos(angle),
      n.y + cy + cy * ratio * Math.sin(angle),
    ]);
  }
  return pts.map(p => `${round2(p[0])},${round2(p[1])}`).join(' ');
}

export function pathD(n) {
  if (!n.points || n.points.length < 2) return '';
  const d = n.points.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${round2(n.x + p[0])} ${round2(n.y + p[1])}`).join(' ');
  return n.closed ? d + ' Z' : d;
}

function round2(v) { return Math.round(v * 100) / 100; }

export function textLines(n) {
  return String(n.text || '').split('\n');
}

function renderNode(n) {
  let e = null;
  const common = { 'data-node-id': n.id, opacity: n.opacity ?? 1 };

  if (n.type === 'rect') {
    e = el('rect', {
      ...common, ...paintAttrs(n),
      x: n.x, y: n.y, width: Math.max(0.01, n.w), height: Math.max(0.01, n.h),
      rx: n.rx || 0,
    });
  } else if (n.type === 'ellipse') {
    e = el('ellipse', {
      ...common, ...paintAttrs(n),
      cx: n.x + n.w / 2, cy: n.y + n.h / 2,
      rx: Math.max(0.01, n.w / 2), ry: Math.max(0.01, n.h / 2),
    });
  } else if (n.type === 'polygon' || n.type === 'star') {
    e = el('polygon', { ...common, ...paintAttrs(n), points: polygonPoints(n) });
  } else if (n.type === 'path' || n.type === 'line') {
    e = el('path', {
      ...common, ...paintAttrs(n), d: pathD(n),
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    });
    if (!n.closed) e.setAttribute('fill', 'none');
    // Make thin lines easy to click.
    e.style.pointerEvents = 'stroke';
    if (n.closed && n.fill !== 'none') e.style.pointerEvents = 'auto';
  } else if (n.type === 'text') {
    e = el('text', {
      ...common,
      fill: n.fill || '#1e1e1e',
      'font-family': n.fontFamily || 'Arial',
      'font-size': n.fontSize || 24,
      'font-weight': n.fontWeight || 400,
    });
    const lines = textLines(n);
    const lh = (n.fontSize || 24) * 1.25;
    lines.forEach((line, i) => {
      const tspan = el('tspan', { y: n.y + (n.fontSize || 24) * 0.9 + i * lh });
      if (n.align === 'center') {
        tspan.setAttribute('x', n.x + (n.w || 0) / 2);
        tspan.setAttribute('text-anchor', 'middle');
      } else if (n.align === 'right') {
        tspan.setAttribute('x', n.x + (n.w || 0));
        tspan.setAttribute('text-anchor', 'end');
      } else {
        tspan.setAttribute('x', n.x);
      }
      tspan.textContent = line || ' ';
      e.appendChild(tspan);
    });
    e.style.userSelect = 'none';
    e.style.whiteSpace = 'pre';
  } else if (n.type === 'clipart') {
    const art = getClipart(n.clipartId);
    if (!art) return null;
    e = el('g', { ...common });
    const inner = el('g', {
      transform: `translate(${n.x} ${n.y}) scale(${n.w / 100} ${n.h / 100})`,
    });
    // Trusted markup: comes only from our own clipart library, never user input.
    inner.innerHTML = art.markup;
    if (art.tintable) inner.style.color = n.tint || '#c96f2e';
    e.appendChild(inner);
    // Invisible hit area so sparse art is still easy to select.
    e.appendChild(el('rect', {
      x: n.x, y: n.y, width: n.w, height: n.h, fill: 'transparent',
    }));
  }

  if (!e) return null;
  const rt = rotationTransform(n);
  if (rt) e.setAttribute('transform', rt);
  if (n.locked) e.style.pointerEvents = 'none';
  return e;
}

// Text nodes auto-size from their rendered glyphs.
function measureTextNodes() {
  let changed = false;
  for (const n of state.doc.nodes) {
    if (n.type !== 'text' || !n.visible) continue;
    const e = nodesGroup.querySelector(`text[data-node-id="${n.id}"]`);
    if (!e) continue;
    let maxW = 0;
    for (const tspan of e.children) {
      try { maxW = Math.max(maxW, tspan.getComputedTextLength()); } catch { /* detached */ }
    }
    const lines = textLines(n).length;
    const h = lines * (n.fontSize || 24) * 1.25;
    const w = Math.max(maxW, 4);
    if (Math.abs((n.w || 0) - w) > 0.5 || Math.abs((n.h || 0) - h) > 0.5) {
      n.w = w; n.h = h;
      changed = true;
    }
  }
  // Re-render anchored tspans once sizes settle (center/right alignment).
  if (changed) {
    for (const n of state.doc.nodes) {
      if (n.type !== 'text' || !n.visible || !n.align || n.align === 'left') continue;
      const old = nodesGroup.querySelector(`text[data-node-id="${n.id}"]`);
      if (old) old.replaceWith(renderNode(n));
    }
  }
}

// ---------- overlay (screen space) ----------
export function setMarquee(rect) { marqueeRect = rect; renderOverlay(); }
export function setPenPreview(p) { penPreview = p; renderOverlay(); }

const HANDLES = [
  ['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5],
  ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5],
];
const HANDLE_CURSORS = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
};

export function renderOverlay() {
  if (!overlayGroup) return;
  overlayGroup.replaceChildren();

  const nodes = getSelectedNodes();
  if (nodes.length && !state.editingTextId) {
    // Thin outline around each selected node (its true rotated shape).
    for (const n of nodes) {
      const pts = nodeCorners(n).map(worldToScreen);
      overlayGroup.appendChild(el('polygon', {
        points: pts.map(p => `${p.x},${p.y}`).join(' '),
        fill: 'none', stroke: '#3aa79c', 'stroke-width': 1,
      }));
    }

    const single = nodes.length === 1 ? nodes[0] : null;
    let cornerPts; // [nw, ne, se, sw] in screen space
    if (single) {
      cornerPts = nodeCorners(single).map(worldToScreen);
    } else {
      const b = selectionBBox();
      cornerPts = [
        { x: b.x, y: b.y }, { x: b.x + b.w, y: b.y },
        { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h },
      ].map(worldToScreen);
      overlayGroup.appendChild(el('polygon', {
        points: cornerPts.map(p => `${p.x},${p.y}`).join(' '),
        fill: 'none', stroke: '#3aa79c', 'stroke-width': 1.5,
      }));
    }

    const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    const at = (u, v) => lerp(lerp(cornerPts[0], cornerPts[1], u), lerp(cornerPts[3], cornerPts[2], u), v);

    // Rotation handle floats above the top edge.
    if (!getSelectedNodes().some(n => n.locked)) {
      const topMid = at(0.5, 0);
      const center = at(0.5, 0.5);
      const len = Math.hypot(topMid.x - center.x, topMid.y - center.y) || 1;
      const ux = (topMid.x - center.x) / len, uy = (topMid.y - center.y) / len;
      const rp = { x: topMid.x + ux * 22, y: topMid.y + uy * 22 };
      overlayGroup.appendChild(el('line', {
        x1: topMid.x, y1: topMid.y, x2: rp.x, y2: rp.y,
        stroke: '#3aa79c', 'stroke-width': 1,
      }));
      const rot = el('circle', {
        cx: rp.x, cy: rp.y, r: 5.5, fill: '#fdf9f0', stroke: '#3aa79c',
        'stroke-width': 1.5, 'data-handle': 'rotate',
      });
      rot.style.cursor = 'grab';
      overlayGroup.appendChild(rot);

      for (const [name, u, v] of HANDLES) {
        const p = at(u, v);
        const h = el('rect', {
          x: p.x - 4, y: p.y - 4, width: 8, height: 8,
          fill: '#fdf9f0', stroke: '#3aa79c', 'stroke-width': 1.5,
          'data-handle': name,
        });
        h.style.cursor = HANDLE_CURSORS[name];
        overlayGroup.appendChild(h);
      }
    }
  }

  if (marqueeRect) {
    const a = worldToScreen({ x: marqueeRect.x, y: marqueeRect.y });
    overlayGroup.appendChild(el('rect', {
      x: a.x, y: a.y,
      width: marqueeRect.w * state.zoom, height: marqueeRect.h * state.zoom,
      fill: 'rgba(58,167,156,0.12)', stroke: '#3aa79c', 'stroke-width': 1,
      'stroke-dasharray': '4 3',
    }));
  }

  if (penPreview && penPreview.points.length) {
    const pts = penPreview.points.map(worldToScreen);
    let d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
    if (penPreview.cursor) {
      const c = worldToScreen(penPreview.cursor);
      d += ` L${c.x} ${c.y}`;
    }
    overlayGroup.appendChild(el('path', {
      d, fill: 'none', stroke: '#c96f2e', 'stroke-width': 1.5,
    }));
    pts.forEach((p, i) => {
      overlayGroup.appendChild(el('circle', {
        cx: p.x, cy: p.y, r: i === 0 ? 5 : 3.5,
        fill: i === 0 ? '#c96f2e' : '#fdf9f0',
        stroke: '#c96f2e', 'stroke-width': 1.5,
      }));
    });
  }
}
