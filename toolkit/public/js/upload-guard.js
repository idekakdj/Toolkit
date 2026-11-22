// Shared upload guard for every Toolkit app. Loaded as a classic script so both
// ES-module apps and the classic-script converter can use it:  window.ToolkitUploadGuard
//
// A file's name and declared MIME type are claims made by whoever chose the file.
// This reads the first bytes, identifies the real format from its signature, reads the
// pixel dimensions from the header WITHOUT decoding the image, and refuses anything
// outside the limits before a decoder (or a canvas allocation) ever sees it.
(function () {
  'use strict';

  var DEFAULTS = {
    maxBytes: 25 * 1024 * 1024,          // 25 MB per file
    maxSide: 16384,                       // longest edge in pixels
    maxPixels: 100 * 1000 * 1000,         // 100 megapixels
    allow: ['png', 'jpeg', 'webp', 'gif', 'bmp'],
    headBytes: 2 * 1024 * 1024,           // enough to find a JPEG frame header behind large EXIF/ICC blocks
  };

  function u16be(b, i) { return (b[i] << 8) | b[i + 1]; }
  function u16le(b, i) { return b[i] | (b[i + 1] << 8); }
  function u32be(b, i) { return ((b[i] * 0x1000000) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3])); }
  function u32le(b, i) { return ((b[i + 3] * 0x1000000) + ((b[i + 2] << 16) | (b[i + 1] << 8) | b[i])); }
  function ascii(b, start, end) { var s = ''; for (var i = start; i < end && i < b.length; i++) s += String.fromCharCode(b[i]); return s; }

  // Returns { type, width, height } or null when the bytes are not a recognised raster image.
  function sniff(b) {
    if (b.length < 12) return null;
    // PNG: signature, then the IHDR chunk carries the dimensions.
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
      if (b.length < 24 || ascii(b, 12, 16) !== 'IHDR') return null;
      return { type: 'png', width: u32be(b, 16), height: u32be(b, 20) };
    }
    // GIF
    if (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a') {
      return { type: 'gif', width: u16le(b, 6), height: u16le(b, 8) };
    }
    // BMP
    if (b[0] === 0x42 && b[1] === 0x4d && b.length >= 26) {
      var dib = u32le(b, 14);
      if (dib === 12) return { type: 'bmp', width: u16le(b, 18), height: u16le(b, 20) };
      var h = u32le(b, 22); if (h > 0x7fffffff) h = 0x100000000 - h;   // negative height = top-down
      return { type: 'bmp', width: u32le(b, 18), height: h };
    }
    // WebP (VP8, VP8L, VP8X)
    if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' && b.length >= 30) {
      var chunk = ascii(b, 12, 16);
      if (chunk === 'VP8 ') return { type: 'webp', width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
      if (chunk === 'VP8L') {
        var b0 = b[21], b1 = b[22], b2 = b[23], b3 = b[24];
        return { type: 'webp', width: 1 + (b0 | ((b1 & 0x3f) << 8)), height: 1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) };
      }
      if (chunk === 'VP8X') return { type: 'webp', width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
      return null;
    }
    // JPEG: walk the marker segments until a start-of-frame header.
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
      var i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        var marker = b[i + 1];
        if (marker === 0xff) { i++; continue; }                       // fill bytes
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }   // no payload
        var isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSof) return { type: 'jpeg', width: u16be(b, i + 7), height: u16be(b, i + 5) };
        var len = u16be(b, i + 2);
        if (len < 2) return null;
        i += 2 + len;
      }
      return null;
    }
    return null;
  }

  function mb(n) { return (n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB'; }

  // Resolves { ok: true, type, width, height } or { ok: false, message }. Never rejects.
  function checkImage(file, options) {
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k];
    if (options) for (var j in options) o[j] = options[j];
    if (!file || typeof file.size !== 'number' || typeof file.slice !== 'function') {
      return Promise.resolve({ ok: false, message: 'No file was selected.' });
    }
    if (file.size === 0) return Promise.resolve({ ok: false, message: 'That file is empty.' });
    if (file.size > o.maxBytes) {
      return Promise.resolve({ ok: false, message: 'That file is too large (' + mb(file.size) + '). The limit is ' + mb(o.maxBytes) + '.' });
    }
    var reading;
    try { reading = file.slice(0, o.headBytes).arrayBuffer(); } catch (e) { reading = Promise.reject(e); }
    return reading.then(function (buf) {
      var info = sniff(new Uint8Array(buf));
      if (!info) {
        return { ok: false, message: 'Unsupported or damaged file. Use a PNG, JPEG, WebP, GIF or BMP image.' };
      }
      if (o.allow.indexOf(info.type) === -1) {
        return { ok: false, message: info.type.toUpperCase() + ' images are not accepted here.' };
      }
      if (!(info.width >= 1 && info.height >= 1)) return { ok: false, message: 'That image has invalid dimensions.' };
      if (info.width > o.maxSide || info.height > o.maxSide || info.width * info.height > o.maxPixels) {
        return { ok: false, message: 'That image is too large (' + info.width + ' x ' + info.height + ' px). Maximum is ' + o.maxSide + ' px on a side and ' + Math.round(o.maxPixels / 1e6) + ' megapixels.' };
      }
      return { ok: true, type: info.type, width: info.width, height: info.height };
    }, function () {
      return { ok: false, message: 'That file could not be read.' };
    });
  }

  window.ToolkitUploadGuard = { checkImage: checkImage, sniff: sniff, DEFAULTS: DEFAULTS };
})();
