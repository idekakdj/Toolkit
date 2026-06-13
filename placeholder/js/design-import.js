/* ============================================================
   Placeholder — import designs from other Toolkit apps
   Pulls a Sigma project or a Pigment painting (over the shared
   Toolkit session), serialises it to a standalone SVG, and feeds
   it into the converter as if the user had dropped that SVG.
   100% client-side; the design libraries are loaded on demand
   from each app so artwork stays pixel-faithful.
   ============================================================ */

(function () {
  'use strict';

  /* ---------------- tiny helpers ---------------- */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function apiGet(path) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'placeholder' },
    });
    if (!res.ok) {
      const err = new Error(res.status === 401
        ? 'Please sign in to Toolkit first.'
        : 'Could not reach the server (' + res.status + ').');
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  function safeName(name) {
    return (String(name || 'design').replace(/[^\w\- ]+/g, '').trim()
      .replace(/\s+/g, '-')) || 'design';
  }

  // Stroke / region path data from an array of [x,y] points.
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

  /* ---------------- gradients (Pigment paints can be gradient objects) ---------------- */

  function isGradient(p) { return !!(p && typeof p === 'object' && p.grad); }

  function gradKey(p) {
    let s = JSON.stringify(p), h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  // Returns resolver(paint) -> attribute string, registering gradient defs.
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

  /* ============================================================
     SIGMA  (artboard + nodes)  ->  SVG
     Mirrors sigma/public/js/editor/export.js exactly.
     ============================================================ */

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
      pts.push((n.x + cx + cx * ratio * Math.cos(a)).toFixed(2) + ','
        + (n.y + cy + cy * ratio * Math.sin(a)).toFixed(2));
    }
    return pts.join(' ');
  }

  function sigmaPathD(n) {
    if (!n.points || n.points.length < 2) return '';
    let d = n.points.map((p, i) => (i === 0 ? 'M' : 'L')
      + (n.x + p[0]).toFixed(2) + ' ' + (n.y + p[1]).toFixed(2)).join(' ');
    if (n.closed) d += ' Z';
    return d;
  }

  function sigmaNodeSVG(n, clipart) {
    const rot = n.rotation
      ? ' transform="rotate(' + n.rotation + ' ' + (n.x + n.w / 2) + ' ' + (n.y + n.h / 2) + ')"' : '';
    const op = (n.opacity != null && n.opacity < 1) ? ' opacity="' + n.opacity + '"' : '';

    if (n.type === 'rect') {
      return '<rect x="' + n.x + '" y="' + n.y + '" width="' + Math.max(0.01, n.w)
        + '" height="' + Math.max(0.01, n.h) + '" rx="' + (n.rx || 0) + '"' + sigmaPaint(n) + op + rot + '/>';
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
        '<tspan x="' + tx + '" y="' + (n.y + fs * 0.9 + i * lh) + '">' + (esc(line) || ' ') + '</tspan>').join('');
      return '<text font-family="' + esc(n.fontFamily || 'Arial') + '" font-size="' + fs
        + '" font-weight="' + (n.fontWeight || 400) + '" fill="' + esc(n.fill || '#1e1e1e') + '"'
        + anchor + op + rot + ' xml:space="preserve">' + spans + '</text>';
    }
    if (n.type === 'clipart') {
      if (!clipart || !clipart.getClipart) return '';
      const art = clipart.getClipart(n.clipartId);
      if (!art) return '';
      const tint = art.tintable ? ' color="' + esc(n.tint || '#c96f2e') + '"' : '';
      return '<g' + op + rot + '><g transform="translate(' + n.x + ' ' + n.y + ') scale('
        + (n.w / 100) + ' ' + (n.h / 100) + ')"' + tint + '>' + art.markup + '</g></g>';
    }
    return '';
  }

  async function sigmaToSVG(docObj) {
    const ab = docObj.artboard || { w: 1280, h: 800, bg: '#ffffff' };
    const nodes = Array.isArray(docObj.nodes) ? docObj.nodes : [];
    const visible = nodes.filter(n => n.visible !== false);

    let clipart = null;
    if (visible.some(n => n.type === 'clipart')) {
      try { clipart = await import('/sigma/js/editor/clipart.js'); } catch (e) { clipart = null; }
    }
    const body = visible.map(n => sigmaNodeSVG(n, clipart)).join('');
    const w = ab.w, h = ab.h;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h
      + '" viewBox="0 0 ' + w + ' ' + h + '">'
      + '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="' + esc(ab.bg || '#ffffff') + '"/>'
      + body + '</svg>';
  }

  /* ============================================================
     PIGMENT  (canvas + items)  ->  SVG
     Mirrors pigment/js/app.js buildSheetSVG (incl. gradients).
     ============================================================ */

  // Apply per-region fills to a coloring piece's markup, returning inner SVG.
  function applyArtFills(markup, fills, resolve) {
    let parsed;
    try {
      parsed = new DOMParser().parseFromString(
        '<svg xmlns="http://www.w3.org/2000/svg">' + markup + '</svg>', 'image/svg+xml');
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
      try { lib = await import('/pigment/js/library.js'); } catch (e) { lib = null; }
    }

    const defsMap = new Map();
    const resolve = paintResolver(defsMap);
    const parts = [];

    for (const item of items) {
      if (item.kind === 'stroke') {
        parts.push('<path fill="none" stroke="' + esc(resolve(item.color))
          + '" stroke-width="' + (item.size || 4)
          + '" stroke-linecap="round" stroke-linejoin="round" d="' + pathD(item.points, false) + '"/>');
      } else if (item.kind === 'region') {
        parts.push('<path fill="' + esc(resolve(item.fill))
          + '" stroke="' + esc(item.stroke || '#1e1e1e')
          + '" stroke-width="' + (item.strokeWidth || 2)
          + '" stroke-linejoin="round" d="' + pathD(item.points, true) + '"/>');
      } else if (item.kind === 'art') {
        const piece = lib && lib.getColoring ? lib.getColoring(item.artId) : null;
        if (!piece) continue;
        const sx = item.w / 200, sy = item.h / 200;
        const inner = applyArtFills(piece.markup, item.fills || {}, resolve);
        parts.push('<g transform="translate(' + item.x + ' ' + item.y + ') scale('
          + sx + ' ' + sy + ')">' + inner + '</g>');
      }
    }

    const w = c.w, h = c.h;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h
      + '" viewBox="0 0 ' + w + ' ' + h + '">'
      + gradientDefsSVG(defsMap)
      + '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="' + esc(c.bg || '#ffffff') + '"/>'
      + parts.join('') + '</svg>';
  }

  /* ============================================================
     PICKER OVERLAY
     ============================================================ */

  const APPS = {
    sigma: {
      label: 'Sigma', listPath: '/api/projects', listKey: 'projects',
      itemPath: (id) => '/api/projects/' + id, docOf: (full) => full.project.document,
      serialize: sigmaToSVG, empty: 'No Sigma projects yet — design one first.',
    },
    pigment: {
      label: 'Pigment', listPath: '/api/paintings', listKey: 'paintings',
      itemPath: (id) => '/api/paintings/' + id, docOf: (full) => full.painting.document,
      serialize: pigmentToSVG, empty: 'No Pigment paintings yet — paint one first.',
    },
  };

  let overlay = null;

  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'di-overlay';
    overlay.innerHTML =
      '<div class="di-panel" role="dialog" aria-modal="true" aria-labelledby="diTitle">'
      + '<div class="di-head"><h3 id="diTitle">Import a design</h3>'
      + '<button class="di-close" type="button" aria-label="Close">✕</button></div>'
      + '<div class="di-body"></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
    overlay.querySelector('.di-close').addEventListener('click', closeOverlay);
    document.addEventListener('keydown', onEsc);
  }

  function onEsc(e) { if (e.key === 'Escape') closeOverlay(); }

  function closeOverlay() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.removeEventListener('keydown', onEsc);
  }

  function setBody(html) {
    if (overlay) overlay.querySelector('.di-body').innerHTML = html;
  }

  async function openPicker(appKey) {
    const app = APPS[appKey];
    if (!overlay) buildOverlay();
    overlay.querySelector('#diTitle').textContent = 'Import from ' + app.label;
    setBody('<div class="di-loading"><span class="di-spin"></span> Loading your ' + app.label + ' designs…</div>');

    let list;
    try {
      const data = await apiGet(app.listPath);
      list = data[app.listKey] || [];
    } catch (err) {
      setBody('<p class="di-msg">' + esc(err.message) + '</p>');
      return;
    }

    if (!list.length) {
      setBody('<p class="di-msg">' + esc(app.empty) + '</p>');
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'di-list';
    for (const it of list) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'di-item';
      card.title = it.name;
      const thumb = it.thumbnail
        ? '<img class="di-thumb" alt="" src="' + esc(it.thumbnail) + '">'
        : '<span class="di-thumb di-thumb-empty" aria-hidden="true">▦</span>';
      card.innerHTML = thumb + '<span class="di-name"></span>';
      card.querySelector('.di-name').textContent = it.name;
      card.addEventListener('click', () => chooseItem(appKey, it.id, it.name));
      grid.appendChild(card);
    }
    setBody('');
    overlay.querySelector('.di-body').appendChild(grid);
  }

  async function chooseItem(appKey, id, name) {
    const app = APPS[appKey];
    setBody('<div class="di-loading"><span class="di-spin"></span> Preparing “'
      + esc(name) + '” for conversion…</div>');
    try {
      const full = await apiGet(app.itemPath(id));
      const docObj = app.docOf(full);
      const svg = await app.serialize(docObj);
      const file = new File([svg], safeName(name) + '.svg', { type: 'image/svg+xml' });
      closeOverlay();
      if (window.PlaceholderConvert && window.PlaceholderConvert.acceptFile) {
        window.PlaceholderConvert.acceptFile(file);
      }
    } catch (err) {
      setBody('<p class="di-msg">Could not import this design: ' + esc(err.message) + '</p>'
        + '<button type="button" class="btn btn-ghost btn-sm di-retry">Back</button>');
      const retry = overlay && overlay.querySelector('.di-retry');
      if (retry) retry.addEventListener('click', () => openPicker(appKey));
    }
  }

  /* ---------------- wire the dropzone buttons ---------------- */

  function init() {
    const wrap = document.getElementById('dzImport');
    const sigmaBtn = document.getElementById('importSigmaBtn');
    const pigmentBtn = document.getElementById('importPigmentBtn');
    if (!sigmaBtn || !pigmentBtn) return;

    // The buttons live inside the click-to-browse dropzone — stop their
    // clicks/keys from opening the file dialog.
    if (wrap) {
      wrap.addEventListener('click', (e) => e.stopPropagation());
      wrap.addEventListener('keydown', (e) => e.stopPropagation());
    }
    sigmaBtn.addEventListener('click', (e) => { e.stopPropagation(); openPicker('sigma'); });
    pigmentBtn.addEventListener('click', (e) => { e.stopPropagation(); openPicker('pigment'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
