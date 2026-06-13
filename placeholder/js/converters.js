/* ============================================================
   Placeholder — client-side conversion engine
   Detection by magic bytes + content sniffing, conversions via
   browser-native APIs (Canvas, Web Audio, DOMParser) and free
   CDN libraries (jsPDF, js-yaml, marked, turndown, SheetJS,
   lamejs, fflate). Everything runs on-device.
   ============================================================ */

(function () {
  'use strict';

  /* ---------------- library handles (may be absent if a CDN failed) ---------------- */
  const libs = {
    jspdf: () => (window.jspdf && window.jspdf.jsPDF) || null,
    yaml: () => window.jsyaml || null,
    marked: () => window.marked || null,
    turndown: () => window.TurndownService || null,
    xlsx: () => window.XLSX || null,
    lame: () => window.lamejs || null,
    fflate: () => window.fflate || null,
  };
  const hasLib = (name) => !!libs[name]();

  /* ---------------- small helpers ---------------- */

  const canEncodeCache = {};
  function canvasCanEncode(mime) {
    if (!(mime in canEncodeCache)) {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      canEncodeCache[mime] = c.toDataURL(mime).indexOf('data:' + mime) === 0;
    }
    return canEncodeCache[mime];
  }

  function baseName(name) {
    const i = name.lastIndexOf('.');
    return i > 0 ? name.slice(0, i) : name;
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function escapeXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function bufToBase64(buf) {
    const u8 = new Uint8Array(buf);
    let out = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < u8.length; i += CHUNK) {
      out += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
    }
    return btoa(out);
  }

  /* ============================================================
     FILE TYPE DETECTION
     ============================================================ */

  const TYPE_LABELS = {
    png: 'PNG image', jpeg: 'JPEG image', webp: 'WebP image', gif: 'GIF image',
    bmp: 'BMP image', ico: 'ICO icon', avif: 'AVIF image', svg: 'SVG vector image',
    mp3: 'MP3 audio', wav: 'WAV audio', ogg: 'OGG audio', flac: 'FLAC audio',
    m4a: 'M4A audio', aac: 'AAC audio',
    mp4: 'MP4 video', webm: 'WebM video', mov: 'QuickTime video', mkv: 'Matroska video',
    ogv: 'OGG video',
    json: 'JSON data', csv: 'CSV data', tsv: 'TSV data', yaml: 'YAML data',
    xml: 'XML document', xlsx: 'Excel workbook',
    md: 'Markdown document', html: 'HTML document', txt: 'Plain text',
    pdf: 'PDF document', zip: 'ZIP archive', binary: 'File',
  };

  async function detectFile(file) {
    const head = new Uint8Array(await file.slice(0, 4100).arrayBuffer());
    const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1]
      ? file.name.match(/\.([a-z0-9]+)$/i)[1].toLowerCase() : '';
    const ascii = (start, len) => {
      let s = '';
      for (let i = start; i < Math.min(start + len, head.length); i++) s += String.fromCharCode(head[i]);
      return s;
    };
    const make = (id, category, isText) => ({
      id, category, isText: !!isText,
      label: TYPE_LABELS[id] || (ext ? ext.toUpperCase() + ' file' : 'File'),
      ext,
    });

    if (head.length >= 8 && head[0] === 0x89 && ascii(1, 3) === 'PNG') return make('png', 'image');
    if (head.length >= 3 && head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) return make('jpeg', 'image');
    if (ascii(0, 4) === 'GIF8') return make('gif', 'image');
    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return make('webp', 'image');
    if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return make('wav', 'audio');
    if (ascii(0, 2) === 'BM') return make('bmp', 'image');
    if (head.length >= 4 && head[0] === 0 && head[1] === 0 && head[2] === 1 && head[3] === 0) return make('ico', 'image');
    if (ascii(0, 4) === '%PDF') return make('pdf', 'pdf');
    if (ascii(0, 4) === 'fLaC') return make('flac', 'audio');
    if (ascii(0, 4) === 'OggS') return make(ext === 'ogv' ? 'ogv' : 'ogg', ext === 'ogv' ? 'video' : 'audio');
    if (ascii(0, 3) === 'ID3') return make('mp3', 'audio');
    if (head.length >= 2 && head[0] === 0xFF && (head[1] & 0xE0) === 0xE0 && (ext === 'mp3' || ext === '')) {
      return make('mp3', 'audio');
    }
    if (head.length >= 4 && head[0] === 0x1A && head[1] === 0x45 && head[2] === 0xDF && head[3] === 0xA3) {
      return make(ext === 'mkv' ? 'mkv' : 'webm', 'video');
    }
    if (ascii(4, 4) === 'ftyp') {
      const brand = ascii(8, 4);
      if (brand.indexOf('avif') === 0 || brand.indexOf('avis') === 0) return make('avif', 'image');
      if (brand.indexOf('M4A') === 0 || ext === 'm4a') return make('m4a', 'audio');
      if (brand.indexOf('qt') === 0 || ext === 'mov') return make('mov', 'video');
      return make('mp4', 'video');
    }
    if (ascii(0, 2) === 'PK') {
      if (ext === 'xlsx') return make('xlsx', 'data');
      return make('zip', 'archive');
    }
    if (ext === 'aac') return make('aac', 'audio');

    // ---- text sniffing ----
    let text = null;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(head); } catch (e) { /* not utf-8 */ }
    if (text === null) {
      // try without fatal — allow latin-ish text, but reject if many control bytes
      const loose = new TextDecoder('utf-8').decode(head);
      let bad = 0;
      for (let i = 0; i < head.length; i++) {
        const b = head[i];
        if (b === 0 || (b < 9) || (b > 13 && b < 32)) bad++;
      }
      if (head.length > 0 && bad / head.length < 0.02) text = loose;
    }
    if (text !== null) {
      const t = text.replace(/^﻿/, '').trimStart();
      if (ext === 'svg' || /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)?(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(t)) return make('svg', 'image', true);
      if (ext === 'json' || ((t[0] === '{' || t[0] === '[') && ext !== 'js')) {
        if (ext === 'json') return make('json', 'data', true);
        try { JSON.parse(t); return make('json', 'data', true); } catch (e) { /* fall through */ }
      }
      if (ext === 'html' || ext === 'htm' || /^(<!DOCTYPE html|<html)/i.test(t)) return make('html', 'doc', true);
      if (ext === 'xml' || /^<\?xml/i.test(t)) return make('xml', 'data', true);
      if (ext === 'md' || ext === 'markdown') return make('md', 'doc', true);
      if (ext === 'yml' || ext === 'yaml') return make('yaml', 'data', true);
      if (ext === 'csv') return make('csv', 'data', true);
      if (ext === 'tsv') return make('tsv', 'data', true);
      return make('txt', 'doc', true);
    }

    // ---- extension fallback for binary types we couldn't fingerprint ----
    const extMap = {
      mp3: ['mp3', 'audio'], m4a: ['m4a', 'audio'], aac: ['aac', 'audio'],
      mp4: ['mp4', 'video'], mov: ['mov', 'video'], avi: ['binary', 'binary'],
      xlsx: ['xlsx', 'data'],
    };
    if (extMap[ext]) return make(extMap[ext][0], extMap[ext][1]);
    return make('binary', 'binary');
  }

  /* ============================================================
     IMAGE HELPERS
     ============================================================ */

  async function fileToCanvas(file, det, opts) {
    let blob = file;
    if (det.id === 'svg') {
      // ensure the SVG has explicit dimensions so it rasterises predictably
      let text = await file.text();
      try {
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        const svg = doc.documentElement;
        if (svg && svg.tagName.toLowerCase() === 'svg' && (!svg.getAttribute('width') || !svg.getAttribute('height'))) {
          const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
          const w = vb.length === 4 && vb[2] > 0 ? vb[2] : 1024;
          const h = vb.length === 4 && vb[3] > 0 ? vb[3] : 1024;
          svg.setAttribute('width', String(w));
          svg.setAttribute('height', String(h));
          text = new XMLSerializer().serializeToString(svg);
        }
      } catch (e) { /* use original text */ }
      blob = new Blob([text], { type: 'image/svg+xml' });
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      const w = img.naturalWidth || 1024;
      const h = img.naturalHeight || 1024;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (opts && opts.flatten) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0);
      return canvas;
    } catch (e) {
      throw new Error('This browser could not decode the image. (' + (det.label || 'unknown type') + ')');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('The browser refused to encode ' + mime + '.'));
      }, mime, quality);
    });
  }

  function canvasToBMP(canvas) {
    const w = canvas.width, h = canvas.height;
    const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const rowSize = Math.floor((24 * w + 31) / 32) * 4;
    const imageSize = rowSize * h;
    const buf = new ArrayBuffer(54 + imageSize);
    const dv = new DataView(buf);
    // BITMAPFILEHEADER
    dv.setUint8(0, 0x42); dv.setUint8(1, 0x4D);       // 'BM'
    dv.setUint32(2, 54 + imageSize, true);
    dv.setUint32(6, 0, true);
    dv.setUint32(10, 54, true);
    // BITMAPINFOHEADER
    dv.setUint32(14, 40, true);
    dv.setInt32(18, w, true);
    dv.setInt32(22, h, true);
    dv.setUint16(26, 1, true);
    dv.setUint16(28, 24, true);
    dv.setUint32(30, 0, true);
    dv.setUint32(34, imageSize, true);
    dv.setInt32(38, 2835, true);
    dv.setInt32(42, 2835, true);
    dv.setUint32(46, 0, true);
    dv.setUint32(50, 0, true);
    // pixel rows, bottom-up, BGR, padded to 4 bytes
    let off = 54;
    for (let y = h - 1; y >= 0; y--) {
      const rowStart = off;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        dv.setUint8(off++, data[i + 2]); // B
        dv.setUint8(off++, data[i + 1]); // G
        dv.setUint8(off++, data[i]);     // R
      }
      off = rowStart + rowSize;
    }
    return new Blob([buf], { type: 'image/bmp' });
  }

  async function canvasToICO(canvas) {
    // ICO with an embedded PNG (supported by Windows Vista+ and all browsers)
    let src = canvas;
    if (canvas.width > 256 || canvas.height > 256) {
      const scale = Math.min(256 / canvas.width, 256 / canvas.height);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(canvas.width * scale));
      c.height = Math.max(1, Math.round(canvas.height * scale));
      c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
      src = c;
    }
    const pngBuf = await (await canvasToBlob(src, 'image/png')).arrayBuffer();
    const png = new Uint8Array(pngBuf);
    const buf = new ArrayBuffer(22 + png.length);
    const dv = new DataView(buf);
    dv.setUint16(0, 0, true);                  // reserved
    dv.setUint16(2, 1, true);                  // type: icon
    dv.setUint16(4, 1, true);                  // count
    dv.setUint8(6, src.width >= 256 ? 0 : src.width);
    dv.setUint8(7, src.height >= 256 ? 0 : src.height);
    dv.setUint8(8, 0);                         // palette
    dv.setUint8(9, 0);                         // reserved
    dv.setUint16(10, 1, true);                 // planes
    dv.setUint16(12, 32, true);                // bpp
    dv.setUint32(14, png.length, true);        // bytes in resource
    dv.setUint32(18, 22, true);                // offset
    new Uint8Array(buf).set(png, 22);
    return new Blob([buf], { type: 'image/x-icon' });
  }

  async function imageToPDF(file, det) {
    const jsPDF = libs.jspdf();
    const canvas = await fileToCanvas(file, det, { flatten: true });
    const wPt = canvas.width * 0.75;   // 96dpi px → pt
    const hPt = canvas.height * 0.75;
    const pdf = new jsPDF({
      unit: 'pt',
      orientation: wPt >= hPt ? 'landscape' : 'portrait',
      format: [wPt, hPt],
    });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, wPt, hPt);
    return pdf.output('blob');
  }

  /* ============================================================
     AUDIO HELPERS
     ============================================================ */

  async function decodeAudio(file) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('This browser does not support audio decoding.');
    const ctx = new AC();
    try {
      return await ctx.decodeAudioData(await file.arrayBuffer());
    } catch (e) {
      throw new Error('This browser could not decode the audio track in this file.');
    } finally {
      ctx.close();
    }
  }

  function audioBufferToWav(ab) {
    const numCh = ab.numberOfChannels;
    const sampleRate = ab.sampleRate;
    const numFrames = ab.length;
    const bytesPerSample = 2;
    const blockAlign = numCh * bytesPerSample;
    const dataSize = numFrames * blockAlign;
    const buf = new ArrayBuffer(44 + dataSize);
    const dv = new DataView(buf);
    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF');
    dv.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);                       // PCM
    dv.setUint16(22, numCh, true);
    dv.setUint32(24, sampleRate, true);
    dv.setUint32(28, sampleRate * blockAlign, true);
    dv.setUint16(32, blockAlign, true);
    dv.setUint16(34, 16, true);
    writeStr(36, 'data');
    dv.setUint32(40, dataSize, true);
    const channels = [];
    for (let c = 0; c < numCh; c++) channels.push(ab.getChannelData(c));
    let off = 44;
    for (let i = 0; i < numFrames; i++) {
      for (let c = 0; c < numCh; c++) {
        let s = Math.max(-1, Math.min(1, channels[c][i]));
        dv.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        off += 2;
      }
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  function floatTo16(f32) {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return out;
  }

  function audioBufferToMp3(ab, kbps) {
    const lame = libs.lame();
    const channels = Math.min(2, ab.numberOfChannels);
    const enc = new lame.Mp3Encoder(channels, ab.sampleRate, kbps || 192);
    const left = floatTo16(ab.getChannelData(0));
    const right = channels === 2 ? floatTo16(ab.getChannelData(1)) : null;
    const parts = [];
    const BLOCK = 1152;
    for (let i = 0; i < left.length; i += BLOCK) {
      const l = left.subarray(i, i + BLOCK);
      const chunk = channels === 2
        ? enc.encodeBuffer(l, right.subarray(i, i + BLOCK))
        : enc.encodeBuffer(l);
      if (chunk.length) parts.push(new Uint8Array(chunk));
    }
    const end = enc.flush();
    if (end.length) parts.push(new Uint8Array(end));
    return new Blob(parts, { type: 'audio/mpeg' });
  }

  /* ============================================================
     VIDEO HELPERS
     ============================================================ */

  function videoToFrameCanvas(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      let settled = false;
      const fail = (msg) => {
        if (settled) return; settled = true;
        URL.revokeObjectURL(url);
        reject(new Error(msg));
      };
      const timer = setTimeout(() => fail('Timed out reading the video. The codec may not be supported by this browser.'), 20000);
      v.muted = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.addEventListener('error', () => { clearTimeout(timer); fail('This browser could not decode the video.'); });
      v.addEventListener('loadeddata', () => {
        try { v.currentTime = Math.min(0.1, (v.duration || 0.2) / 2); } catch (e) { /* ignore */ }
      });
      v.addEventListener('seeked', () => {
        if (settled) return; settled = true;
        clearTimeout(timer);
        try {
          const c = document.createElement('canvas');
          c.width = v.videoWidth || 1;
          c.height = v.videoHeight || 1;
          c.getContext('2d').drawImage(v, 0, 0);
          URL.revokeObjectURL(url);
          resolve(c);
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(new Error('Could not capture a frame from the video.'));
        }
      }, { once: true });
      v.src = url;
    });
  }

  /* ============================================================
     DATA / TEXT HELPERS
     ============================================================ */

  function parseDSV(text, delim) {
    const rows = [];
    let row = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === delim) {
        row.push(cur); cur = '';
      } else if (ch === '\n') {
        row.push(cur); rows.push(row); row = []; cur = '';
      } else if (ch === '\r') {
        if (text[i + 1] !== '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      } else {
        cur += ch;
      }
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
  }

  function toDSV(rows, delim) {
    return rows.map((row) => row.map((cell) => {
      const s = cell === null || cell === undefined ? '' : String(cell);
      return (s.indexOf(delim) >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0)
        ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(delim)).join('\r\n');
  }

  function rowsToObjects(rows) {
    if (rows.length < 1) throw new Error('The file appears to be empty.');
    const headers = rows[0].map((h, i) => (h && h.trim()) || 'column_' + (i + 1));
    return rows.slice(1).map((row) => {
      const o = {};
      headers.forEach((h, i) => { o[h] = row[i] !== undefined ? row[i] : ''; });
      return o;
    });
  }

  function jsonToRows(data) {
    if (!Array.isArray(data)) throw new Error('To make a table, the JSON must be an array (of objects or arrays).');
    if (data.length === 0) throw new Error('The JSON array is empty — nothing to convert.');
    if (Array.isArray(data[0])) {
      return data.map((r) => (Array.isArray(r) ? r : [r]));
    }
    if (typeof data[0] === 'object' && data[0] !== null) {
      const headers = [];
      for (const item of data) {
        for (const k of Object.keys(item)) if (headers.indexOf(k) < 0) headers.push(k);
      }
      const rows = [headers];
      for (const item of data) {
        rows.push(headers.map((h) => {
          const v = item[h];
          if (v === null || v === undefined) return '';
          return typeof v === 'object' ? JSON.stringify(v) : String(v);
        }));
      }
      return rows;
    }
    // array of primitives → single column
    return [['value']].concat(data.map((v) => [String(v)]));
  }

  function xmlToJson(node) {
    // elements → objects; repeated tags → arrays; attributes → "@attr"; text → "#text"
    const obj = {};
    if (node.attributes) {
      for (const attr of node.attributes) obj['@' + attr.name] = attr.value;
    }
    let textContent = '';
    let hasElements = false;
    for (const child of node.childNodes) {
      if (child.nodeType === 1) {
        hasElements = true;
        const childObj = xmlToJson(child);
        const name = child.nodeName;
        if (obj[name] === undefined) obj[name] = childObj;
        else if (Array.isArray(obj[name])) obj[name].push(childObj);
        else obj[name] = [obj[name], childObj];
      } else if (child.nodeType === 3 || child.nodeType === 4) {
        textContent += child.nodeValue;
      }
    }
    textContent = textContent.trim();
    const hasAttrs = Object.keys(obj).some((k) => k[0] === '@');
    if (!hasElements && !hasAttrs) return textContent;
    if (textContent) obj['#text'] = textContent;
    return obj;
  }

  function jsonToXmlNode(value, tag, indent) {
    const pad = '  '.repeat(indent);
    const safeTag = /^[A-Za-z_][\w.-]*$/.test(tag) ? tag : 'item';
    if (value === null || value === undefined) return pad + '<' + safeTag + '/>';
    if (Array.isArray(value)) {
      return value.map((v) => jsonToXmlNode(v, safeTag, indent)).join('\n');
    }
    if (typeof value === 'object') {
      const inner = Object.keys(value).map((k) => jsonToXmlNode(value[k], k, indent + 1)).join('\n');
      return pad + '<' + safeTag + '>\n' + inner + '\n' + pad + '</' + safeTag + '>';
    }
    return pad + '<' + safeTag + '>' + escapeXml(value) + '</' + safeTag + '>';
  }

  function wrapHtmlDoc(title, bodyHtml) {
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
      '<title>' + escapeHtml(title) + '</title>\n<style>\n' +
      'body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;max-width:760px;' +
      'margin:48px auto;padding:0 20px;line-height:1.65;color:#1f2330}\n' +
      'h1,h2,h3{line-height:1.25}\ncode{background:#f1f2f6;padding:2px 6px;border-radius:4px;font-size:.92em}\n' +
      'pre{background:#f6f7fa;padding:14px;border-radius:8px;overflow:auto}\npre code{background:none;padding:0}\n' +
      'table{border-collapse:collapse;width:100%}\nth,td{border:1px solid #d8dbe4;padding:8px 10px;text-align:left}\n' +
      'th{background:#f1f2f6}\nblockquote{border-left:4px solid #c3c9da;margin:0;padding:4px 18px;color:#555c70}\n' +
      'img{max-width:100%}\n</style>\n</head>\n<body>\n' + bodyHtml + '\n</body>\n</html>\n';
  }

  function textToPDF(text, title) {
    const jsPDF = libs.jspdf();
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 56;
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const usable = pageW - margin * 2;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    const lineH = 15.5;
    const lines = pdf.splitTextToSize(text.replace(/\t/g, '    '), usable);
    let y = margin;
    for (const line of lines) {
      if (y > pageH - margin) { pdf.addPage(); y = margin; }
      pdf.text(line, margin, y);
      y += lineH;
    }
    return pdf.output('blob');
  }

  /* ============================================================
     CONVERSION REGISTRY
     getConversions(det) → [{ id, label, ext, mimeHint, needsQuality, hint, run }]
     run(file, det, opts) → Blob   (opts.quality ∈ [0.1, 1])
     ============================================================ */

  function getConversions(det) {
    const list = [];
    const add = (o) => list.push(o);
    const id = det.id;
    const cat = det.category;
    const gifHint = id === 'gif' ? 'Animated GIFs are converted using their first frame.' : null;

    /* ---------- images ---------- */
    if (cat === 'image') {
      if (id !== 'png') add({
        id: 'png', label: 'PNG image (.png)', ext: 'png', hint: gifHint,
        run: async (f, d) => canvasToBlob(await fileToCanvas(f, d), 'image/png'),
      });
      if (id !== 'jpeg') add({
        id: 'jpeg', label: 'JPEG image (.jpg)', ext: 'jpg', needsQuality: true,
        hint: gifHint || 'Transparency is flattened onto a white background.',
        run: async (f, d, o) => canvasToBlob(await fileToCanvas(f, d, { flatten: true }), 'image/jpeg', o.quality),
      });
      if (id !== 'webp' && canvasCanEncode('image/webp')) add({
        id: 'webp', label: 'WebP image (.webp)', ext: 'webp', needsQuality: true, hint: gifHint,
        run: async (f, d, o) => canvasToBlob(await fileToCanvas(f, d), 'image/webp', o.quality),
      });
      if (id !== 'bmp') add({
        id: 'bmp', label: 'BMP image (.bmp)', ext: 'bmp',
        hint: gifHint || 'Transparency is flattened onto a white background.',
        run: async (f, d) => canvasToBMP(await fileToCanvas(f, d, { flatten: true })),
      });
      if (id !== 'ico') add({
        id: 'ico', label: 'ICO icon (.ico)', ext: 'ico',
        hint: 'Icons larger than 256×256 are scaled down to fit.',
        run: async (f, d) => canvasToICO(await fileToCanvas(f, d)),
      });
      if (hasLib('jspdf')) add({
        id: 'pdf', label: 'PDF document (.pdf)', ext: 'pdf',
        hint: gifHint || 'Creates a single-page PDF sized to the image.',
        run: (f, d) => imageToPDF(f, d),
      });
    }

    /* ---------- audio ---------- */
    if (cat === 'audio') {
      if (id !== 'wav') add({
        id: 'wav', label: 'WAV audio (.wav)', ext: 'wav',
        hint: 'Uncompressed 16-bit PCM — larger file, perfect quality.',
        run: async (f) => audioBufferToWav(await decodeAudio(f)),
      });
      if (id !== 'mp3' && hasLib('lame')) add({
        id: 'mp3', label: 'MP3 audio (.mp3)', ext: 'mp3',
        hint: 'Encoded at 192 kbps.',
        run: async (f) => audioBufferToMp3(await decodeAudio(f), 192),
      });
    }

    /* ---------- video ---------- */
    if (cat === 'video') {
      add({
        id: 'wav', label: 'WAV audio — extract soundtrack (.wav)', ext: 'wav',
        hint: 'Pulls the audio track out of the video as uncompressed WAV.',
        run: async (f) => audioBufferToWav(await decodeAudio(f)),
      });
      if (hasLib('lame')) add({
        id: 'mp3', label: 'MP3 audio — extract soundtrack (.mp3)', ext: 'mp3',
        hint: 'Pulls the audio track out of the video, encoded at 192 kbps.',
        run: async (f) => audioBufferToMp3(await decodeAudio(f), 192),
      });
      add({
        id: 'png', label: 'PNG image — first frame (.png)', ext: 'png',
        hint: 'Captures a still from the start of the video.',
        run: async (f) => canvasToBlob(await videoToFrameCanvas(f), 'image/png'),
      });
      add({
        id: 'jpeg', label: 'JPEG image — first frame (.jpg)', ext: 'jpg', needsQuality: true,
        hint: 'Captures a still from the start of the video.',
        run: async (f, d, o) => canvasToBlob(await videoToFrameCanvas(f), 'image/jpeg', o.quality),
      });
    }

    /* ---------- JSON ---------- */
    if (id === 'json') {
      add({
        id: 'csv', label: 'CSV table (.csv)', ext: 'csv',
        hint: 'Works when the JSON is an array of objects or an array of arrays.',
        run: async (f) => new Blob([toDSV(jsonToRows(JSON.parse(await f.text())), ',')], { type: 'text/csv' }),
      });
      if (hasLib('yaml')) add({
        id: 'yaml', label: 'YAML document (.yaml)', ext: 'yaml',
        run: async (f) => new Blob([libs.yaml().dump(JSON.parse(await f.text()))], { type: 'text/yaml' }),
      });
      add({
        id: 'xml', label: 'XML document (.xml)', ext: 'xml',
        run: async (f) => {
          const data = JSON.parse(await f.text());
          const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + jsonToXmlNode(data, 'root', 0) + '\n';
          return new Blob([xml], { type: 'application/xml' });
        },
      });
      if (hasLib('xlsx')) add({
        id: 'xlsx', label: 'Excel workbook (.xlsx)', ext: 'xlsx',
        hint: 'Works when the JSON is an array of objects or an array of arrays.',
        run: async (f) => {
          const XLSX = libs.xlsx();
          const rows = jsonToRows(JSON.parse(await f.text()));
          const ws = XLSX.utils.aoa_to_sheet(rows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
          return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })],
            { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        },
      });
      add({
        id: 'json-pretty', label: 'Pretty-printed JSON (.json)', ext: 'pretty.json',
        run: async (f) => new Blob([JSON.stringify(JSON.parse(await f.text()), null, 2)], { type: 'application/json' }),
      });
      add({
        id: 'json-min', label: 'Minified JSON (.json)', ext: 'min.json',
        run: async (f) => new Blob([JSON.stringify(JSON.parse(await f.text()))], { type: 'application/json' }),
      });
    }

    /* ---------- CSV / TSV ---------- */
    if (id === 'csv' || id === 'tsv') {
      const delim = id === 'csv' ? ',' : '\t';
      add({
        id: 'json', label: 'JSON data (.json)', ext: 'json',
        hint: 'The first row is used as column headers.',
        run: async (f) => new Blob([JSON.stringify(rowsToObjects(parseDSV(await f.text(), delim)), null, 2)], { type: 'application/json' }),
      });
      add(id === 'csv'
        ? {
          id: 'tsv', label: 'TSV table (.tsv)', ext: 'tsv',
          run: async (f) => new Blob([toDSV(parseDSV(await f.text(), ','), '\t')], { type: 'text/tab-separated-values' }),
        }
        : {
          id: 'csv', label: 'CSV table (.csv)', ext: 'csv',
          run: async (f) => new Blob([toDSV(parseDSV(await f.text(), '\t'), ',')], { type: 'text/csv' }),
        });
      if (hasLib('xlsx')) add({
        id: 'xlsx', label: 'Excel workbook (.xlsx)', ext: 'xlsx',
        run: async (f) => {
          const XLSX = libs.xlsx();
          const rows = parseDSV(await f.text(), delim);
          const ws = XLSX.utils.aoa_to_sheet(rows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
          return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })],
            { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        },
      });
      add({
        id: 'md', label: 'Markdown table (.md)', ext: 'md',
        run: async (f) => {
          const rows = parseDSV(await f.text(), delim);
          if (!rows.length) throw new Error('The file appears to be empty.');
          const esc = (c) => String(c).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
          const width = Math.max.apply(null, rows.map((r) => r.length));
          const norm = rows.map((r) => { const c = r.slice(); while (c.length < width) c.push(''); return c; });
          const lines = ['| ' + norm[0].map(esc).join(' | ') + ' |',
            '| ' + norm[0].map(() => '---').join(' | ') + ' |'];
          for (const r of norm.slice(1)) lines.push('| ' + r.map(esc).join(' | ') + ' |');
          return new Blob([lines.join('\n') + '\n'], { type: 'text/markdown' });
        },
      });
      add({
        id: 'html', label: 'HTML table (.html)', ext: 'html',
        run: async (f) => {
          const rows = parseDSV(await f.text(), delim);
          if (!rows.length) throw new Error('The file appears to be empty.');
          let t = '<table>\n<thead>\n<tr>' + rows[0].map((c) => '<th>' + escapeHtml(c) + '</th>').join('') + '</tr>\n</thead>\n<tbody>\n';
          for (const r of rows.slice(1)) t += '<tr>' + r.map((c) => '<td>' + escapeHtml(c) + '</td>').join('') + '</tr>\n';
          t += '</tbody>\n</table>';
          return new Blob([wrapHtmlDoc('Table', t)], { type: 'text/html' });
        },
      });
    }

    /* ---------- YAML ---------- */
    if (id === 'yaml' && hasLib('yaml')) {
      add({
        id: 'json', label: 'JSON data (.json)', ext: 'json',
        run: async (f) => new Blob([JSON.stringify(libs.yaml().load(await f.text()), null, 2)], { type: 'application/json' }),
      });
    }

    /* ---------- XML ---------- */
    if (id === 'xml') {
      add({
        id: 'json', label: 'JSON data (.json)', ext: 'json',
        run: async (f) => {
          const doc = new DOMParser().parseFromString(await f.text(), 'application/xml');
          if (doc.querySelector('parsererror')) throw new Error('The XML could not be parsed — please check it is well-formed.');
          const out = {};
          out[doc.documentElement.nodeName] = xmlToJson(doc.documentElement);
          return new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
        },
      });
    }

    /* ---------- XLSX ---------- */
    if (id === 'xlsx' && hasLib('xlsx')) {
      const readSheet = async (f) => {
        const XLSX = libs.xlsx();
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        return { XLSX, ws: wb.Sheets[wb.SheetNames[0]], name: wb.SheetNames[0] };
      };
      add({
        id: 'csv', label: 'CSV table — first sheet (.csv)', ext: 'csv',
        run: async (f) => { const s = await readSheet(f); return new Blob([s.XLSX.utils.sheet_to_csv(s.ws)], { type: 'text/csv' }); },
      });
      add({
        id: 'json', label: 'JSON data — first sheet (.json)', ext: 'json',
        run: async (f) => {
          const s = await readSheet(f);
          return new Blob([JSON.stringify(s.XLSX.utils.sheet_to_json(s.ws), null, 2)], { type: 'application/json' });
        },
      });
      add({
        id: 'html', label: 'HTML table — first sheet (.html)', ext: 'html',
        run: async (f) => {
          const s = await readSheet(f);
          return new Blob([wrapHtmlDoc(s.name, s.XLSX.utils.sheet_to_html(s.ws))], { type: 'text/html' });
        },
      });
    }

    /* ---------- Markdown ---------- */
    if (id === 'md') {
      if (hasLib('marked')) add({
        id: 'html', label: 'HTML document (.html)', ext: 'html',
        run: async (f) => new Blob([wrapHtmlDoc(baseName(f.name), libs.marked().parse(await f.text()))], { type: 'text/html' }),
      });
      if (hasLib('jspdf')) add({
        id: 'pdf', label: 'PDF document (.pdf)', ext: 'pdf',
        hint: 'Renders the raw markdown text into a paginated PDF.',
        run: async (f) => textToPDF(await f.text(), baseName(f.name)),
      });
      add({
        id: 'txt', label: 'Plain text (.txt)', ext: 'txt',
        run: async (f) => new Blob([await f.text()], { type: 'text/plain' }),
      });
    }

    /* ---------- HTML ---------- */
    if (id === 'html') {
      if (hasLib('turndown')) add({
        id: 'md', label: 'Markdown document (.md)', ext: 'md',
        run: async (f) => {
          const Turndown = libs.turndown();
          return new Blob([new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced' }).turndown(await f.text())], { type: 'text/markdown' });
        },
      });
      add({
        id: 'txt', label: 'Plain text — tags stripped (.txt)', ext: 'txt',
        run: async (f) => {
          const doc = new DOMParser().parseFromString(await f.text(), 'text/html');
          return new Blob([(doc.body ? doc.body.textContent : '').replace(/\n{3,}/g, '\n\n').trim() + '\n'], { type: 'text/plain' });
        },
      });
      if (hasLib('jspdf')) add({
        id: 'pdf', label: 'PDF document — text content (.pdf)', ext: 'pdf',
        hint: 'Extracts the page text and lays it out as a paginated PDF.',
        run: async (f) => {
          const doc = new DOMParser().parseFromString(await f.text(), 'text/html');
          return textToPDF((doc.body ? doc.body.textContent : '').replace(/\n{3,}/g, '\n\n').trim(), baseName(f.name));
        },
      });
    }

    /* ---------- plain text ---------- */
    if (id === 'txt') {
      if (hasLib('jspdf')) add({
        id: 'pdf', label: 'PDF document (.pdf)', ext: 'pdf',
        run: async (f) => textToPDF(await f.text(), baseName(f.name)),
      });
      add({
        id: 'html', label: 'HTML document (.html)', ext: 'html',
        run: async (f) => new Blob([wrapHtmlDoc(baseName(f.name), '<pre style="white-space:pre-wrap">' + escapeHtml(await f.text()) + '</pre>')], { type: 'text/html' }),
      });
    }

    /* ---------- universal (any file) ---------- */
    if (hasLib('fflate')) add({
      id: 'zip', label: 'ZIP archive (.zip)', ext: 'zip',
      hint: 'Compresses the file into a standard ZIP archive.',
      run: async (f) => {
        const fflate = libs.fflate();
        const u8 = new Uint8Array(await f.arrayBuffer());
        const files = {};
        files[f.name] = u8;
        const zipped = await new Promise((resolve, reject) => {
          fflate.zip(files, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)));
        });
        return new Blob([zipped], { type: 'application/zip' });
      },
    });
    add({
      id: 'base64', label: 'Base64 text (.txt)', ext: 'b64.txt',
      hint: 'Encodes the raw bytes as Base64 text — handy for embedding files in code or config.',
      run: async (f) => new Blob([bufToBase64(await f.arrayBuffer())], { type: 'text/plain' }),
    });

    return list;
  }

  /* ---------------- public API ---------------- */
  window.PlaceholderEngine = {
    detectFile,
    getConversions,
    formatBytes,
    baseName,
  };
})();
