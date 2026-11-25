// Loads Pigment's coloring-book library (pigment/js/library*.js, browser ES modules) into
// Node without copying it, and describes each piece's fillable regions so an AI assistant
// can tell which region is which: every region gets its shape, bounding box, a rough
// position in words and the region it sits inside.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FILES = ['library-animals.js', 'library-nature.js', 'library-food.js', 'library-travel.js', 'library-fun.js', 'library.js'];
const VIEWBOX = 200;

function libraryDir() {
  const root = process.env.TOOLKIT_ASSET_ROOT || path.join(__dirname, '..', '..', '..');
  return path.join(root, 'pigment', 'js');
}

// The files are trusted repository sources: strip the module syntax and evaluate them
// together in an empty context (no require, no process, no globals of ours).
function loadLibrary(dir = libraryDir()) {
  let source = '';
  for (const f of FILES) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    source += '\n' + text
      .replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
      .replace(/^export\s+(const|let|function)\s/gm, '$1 ');
  }
  source += '\n;({ COLORING, CATEGORIES });';
  const { COLORING, CATEGORIES } = vm.runInNewContext(source, Object.create(null), { filename: 'pigment-library.js', timeout: 5000 });
  const pieces = new Map();
  for (const piece of COLORING) pieces.set(piece.id, { id: piece.id, name: piece.name, category: piece.category, markup: piece.markup, regions: describeRegions(piece.markup) });
  return { pieces, categories: CATEGORIES.map(c => ({ key: c.key, label: c.label })) };
}

function attrs(text) {
  const out = {};
  for (const m of text.matchAll(/([a-zA-Z][\w:-]*)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function numbers(text) { return (String(text).match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number); }

// Bounding box of a path from its end and control points (good enough for a description).
function pathPoints(d) {
  const pts = [];
  for (const m of String(d).matchAll(/([MLCQSTAHVZmlcqstahvz])([^MLCQSTAHVZmlcqstahvz]*)/g)) {
    const cmd = m[1].toUpperCase(), n = numbers(m[2]);
    if (cmd === 'A') { for (let i = 0; i + 6 < n.length; i += 7) pts.push([n[i + 5], n[i + 6]]); }
    else if (cmd === 'H' || cmd === 'V') { /* rare in the library; neighbours bound the box */ }
    else for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
  }
  return pts;
}

function bbox(tag, a) {
  const n = k => Number(a[k]) || 0;
  if (tag === 'circle') return [n('cx') - n('r'), n('cy') - n('r'), 2 * n('r'), 2 * n('r')];
  if (tag === 'ellipse') return [n('cx') - n('rx'), n('cy') - n('ry'), 2 * n('rx'), 2 * n('ry')];
  if (tag === 'rect') return [n('x'), n('y'), n('width'), n('height')];
  let pts = [];
  if (tag === 'polygon' || tag === 'polyline') { const v = numbers(a.points); for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]); }
  if (tag === 'path') pts = pathPoints(a.d);
  if (!pts.length) return [0, 0, 0, 0];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
}

function where(cx, cy) {
  const v = cy < VIEWBOX / 3 ? 'top' : cy > (2 * VIEWBOX) / 3 ? 'bottom' : 'middle';
  const h = cx < VIEWBOX / 3 ? 'left' : cx > (2 * VIEWBOX) / 3 ? 'right' : 'center';
  return v === 'middle' && h === 'center' ? 'center' : `${v} ${h}`;
}

const r1 = v => Math.round(v * 10) / 10;

function describeRegions(markup) {
  const regions = [];
  for (const m of markup.matchAll(/<(path|circle|ellipse|rect|polygon|polyline)\s([^>]*?)\/?>/g)) {
    const a = attrs(m[2]);
    if (!a['data-region']) continue;
    const [x, y, w, h] = bbox(m[1], a);
    regions.push({ id: a['data-region'], shape: m[1], bbox: [r1(x), r1(y), r1(w), r1(h)], center: [r1(x + w / 2), r1(y + h / 2)], position: where(x + w / 2, y + h / 2), area: Math.round(w * h) });
  }
  // The smallest other region whose box contains this one: eyes "inside" a head, and so on.
  for (const r of regions) {
    let best = null;
    for (const o of regions) {
      if (o === r || o.area <= r.area) continue;
      const [x, y, w, h] = r.bbox, [ox, oy, ow, oh] = o.bbox;
      if (x >= ox - 0.5 && y >= oy - 0.5 && x + w <= ox + ow + 0.5 && y + h <= oy + oh + 0.5 && (!best || o.area < best.area)) best = o;
    }
    r.inside = best ? best.id : null;
  }
  return regions;
}

module.exports = { loadLibrary, describeRegions, VIEWBOX };
