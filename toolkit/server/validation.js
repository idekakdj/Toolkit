// Validate shared document primitives before they reach browser renderers.
//
// Raster payloads arrive as base64 data URLs. A declared MIME type is only a
// claim, so the first bytes are decoded and checked against the real file
// signature (and, for PNG, the declared pixel dimensions are bounded to refuse
// decompression-bomb images). Everything is checked before anything is stored.
const raster = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_SIDE = 16384;                  // longest accepted image edge, in pixels
const MAX_PIXELS = 100 * 1000 * 1000;    // 100 megapixels
const MAX_NAME = 200;

function dimensions(c) {
  return !!c && Number.isInteger(c.w) && Number.isInteger(c.h) && c.w >= 1 && c.h >= 1 && c.w <= 8000 && c.h <= 8000;
}

// Returns { mime, w?, h? } when the data URL really is the image type it claims, else null.
function sniffRaster(url, allowed = ['png', 'jpeg', 'webp']) {
  if (typeof url !== 'string') return null;
  const m = /^data:image\/(png|jpeg|webp);base64,/.exec(url);
  if (!m || !allowed.includes(m[1])) return null;
  const b64 = url.slice(m[0].length);
  // Browsers always emit padded base64; anything else is hand-built input.
  if (b64.length < 32 || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64.slice(0, 64))) return null;
  const head = Buffer.from(b64.slice(0, 64), 'base64');       // 48 bytes
  if (m[1] === 'png') {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (!sig.every((b, i) => head[i] === b)) return null;
    if (head.toString('latin1', 12, 16) !== 'IHDR') return null;   // first chunk must be IHDR
    const w = head.readUInt32BE(16), h = head.readUInt32BE(20);
    if (w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS) return null;
    return { mime: 'png', w, h };
  }
  if (m[1] === 'jpeg') {
    return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff ? { mime: 'jpeg' } : null;
  }
  return head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP' ? { mime: 'webp' } : null;
}

function safeTree(value, depth = 0) {
  if (depth > 30) return false;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1e8;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return true;
  if (Array.isArray(value)) return value.length <= 200000 && value.every(v => safeTree(v, depth + 1));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).every(([key, v]) => {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) return false;
    if ((key === 'src' || key === 'data') && typeof v === 'string' && v !== '' && (!raster.test(v) || !sniffRaster(v))) return false;
    return safeTree(v, depth + 1);
  });
}

function validLayers(layers) {
  const ids = new Set();
  return layers.every(l => {
    if (!l || typeof l.id !== 'string' || !l.id || l.id.length > 100 || ids.has(l.id)) return false;
    ids.add(l.id);
    return typeof l.name === 'string' && l.name.length <= MAX_NAME &&
      typeof l.data === 'string' && (l.data === '' || (raster.test(l.data) && !!sniffRaster(l.data))) &&
      typeof l.opacity === 'number' && l.opacity >= 0 && l.opacity <= 1 && typeof l.visible === 'boolean';
  });
}

// Thumbnails are small previews shown on dashboards: PNG or JPEG only.
function validThumbnail(t, maxChars = 300 * 1024) {
  return typeof t === 'string' && t.length <= maxChars &&
    /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(t) && !!sniffRaster(t, ['png', 'jpeg']);
}

// Names are rendered by several apps; control and bidirectional-override characters
// are refused so a name can never visually spoof or break a layout.
function cleanName(v, max = 80) {
  if (typeof v !== 'string') return null;
  const s = v.normalize('NFC').trim();
  if (s.length < 1 || s.length > max) return null;
  if (/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(s)) return null;
  return s;
}

module.exports = { dimensions, safeTree, validLayers, validThumbnail, sniffRaster, cleanName, MAX_SIDE, MAX_PIXELS };
