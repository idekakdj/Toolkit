// Client-side upload guard: identifies real file types from their bytes and bounds sizes
// before any decoder runs. Runs the browser script unmodified inside a sandboxed VM.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'upload-guard.js'), 'utf8'), { window });
const guard = window.ToolkitUploadGuard;
const file = (bytes, size) => { const blob = new Blob([Buffer.from(bytes)]); return size === undefined ? blob : { size, slice: (a, b) => blob.slice(a, b) }; };
const pad = (buf, n = 64) => Buffer.concat([buf, Buffer.alloc(Math.max(0, n - buf.length))]);

const png = (w, h) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return pad(b);
};
const jpeg = (w, h, exifBytes = 0) => {
  const parts = [Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14)];
  if (exifBytes) { const seg = Buffer.alloc(exifBytes + 2); seg.writeUInt16BE(exifBytes + 2); parts.push(Buffer.from([0xff, 0xe1]), seg); }
  const sof = Buffer.alloc(17); sof[0] = 0xff; sof[1] = 0xc0; sof.writeUInt16BE(17 - 2 + 0, 2); sof[4] = 8; sof.writeUInt16BE(h, 5); sof.writeUInt16BE(w, 7); sof[9] = 3;
  parts.push(sof, Buffer.alloc(32));
  return Buffer.concat(parts);
};
const webpVp8 = (w, h) => { const b = Buffer.alloc(40); b.write('RIFF', 0); b.write('WEBP', 8); b.write('VP8 ', 12); b[23] = 0x9d; b[24] = 0x01; b[25] = 0x2a; b.writeUInt16LE(w, 26); b.writeUInt16LE(h, 28); return b; };
const webpVp8l = (w, h) => { const b = Buffer.alloc(40); b.write('RIFF', 0); b.write('WEBP', 8); b.write('VP8L', 12); b[20] = 0x2f; b.writeUInt32LE(((w - 1) | ((h - 1) << 14)) >>> 0, 21); return b; };
const webpVp8x = (w, h) => { const b = Buffer.alloc(40); b.write('RIFF', 0); b.write('WEBP', 8); b.write('VP8X', 12); b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b; };
const gif = (w, h) => { const b = Buffer.alloc(32); b.write('GIF89a', 0); b.writeUInt16LE(w, 6); b.writeUInt16LE(h, 8); return b; };
const bmp = (w, h) => { const b = Buffer.alloc(54); b.write('BM', 0); b.writeUInt32LE(40, 14); b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); return b; };

test('real formats are identified from their bytes with correct dimensions', async () => {
  const cases = [
    ['png', png(640, 480), 640, 480], ['jpeg', jpeg(1920, 1080), 1920, 1080], ['jpeg', jpeg(800, 600, 40000), 800, 600],
    ['webp', webpVp8(321, 123), 321, 123], ['webp', webpVp8l(300, 200), 300, 200], ['webp', webpVp8x(4000, 3000), 4000, 3000],
    ['gif', gif(100, 50), 100, 50], ['bmp', bmp(200, 100), 200, 100], ['bmp', bmp(200, -100), 200, 100],
  ];
  for (const [type, bytes, w, h] of cases) {
    const r = await guard.checkImage(file(bytes));
    assert.equal(r.ok, true, `${type} ${w}x${h}: ${r.message}`);
    assert.deepEqual([r.type, r.width, r.height], [type, w, h]);
  }
});

test('files that are not images are refused whatever their name or declared type claims', async () => {
  const hostile = {
    'script': Buffer.from('<script>alert(document.cookie)</script>'.padEnd(64, ' ')),
    'html': Buffer.from('<!DOCTYPE html><html><body onload=x()>'.padEnd(64, ' ')),
    'svg': Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>1</script></svg>'),
    'zip': pad(Buffer.from([0x50, 0x4b, 0x03, 0x04]), 64),
    'exe': pad(Buffer.from('MZ'), 64),
    'pdf': Buffer.from('%PDF-1.7'.padEnd(64, ' ')),
    'png header, wrong chunk': (() => { const b = png(10, 10); b.write('XXXX', 12, 'latin1'); return b; })(),
    'truncated png': png(10, 10).subarray(0, 18),
    'riff but not webp': (() => { const b = webpVp8(10, 10); b.write('WAVE', 8); return b; })(),
    'unknown webp chunk': (() => { const b = webpVp8(10, 10); b.write('ABCD', 12); return b; })(),
  };
  for (const [name, bytes] of Object.entries(hostile)) {
    const r = await guard.checkImage(file(bytes));
    assert.equal(r.ok, false, name);
    assert.match(r.message, /Unsupported|damaged/i, name);
  }
});

test('size and dimension limits are enforced before decoding', async () => {
  assert.equal((await guard.checkImage(file(png(100, 100), 26 * 1024 * 1024))).ok, false);           // file too big
  assert.match((await guard.checkImage(file(png(100, 100), 26 * 1024 * 1024))).message, /too large/);
  assert.equal((await guard.checkImage(file(png(100, 100), 25 * 1024 * 1024))).ok, true);            // exactly at the limit
  assert.equal((await guard.checkImage(file(png(20000, 100)))).ok, false);                           // edge too long
  assert.equal((await guard.checkImage(file(png(15000, 15000)))).ok, false);                         // pixel budget
  assert.equal((await guard.checkImage(file(jpeg(30000, 30000)))).ok, false);
  assert.equal((await guard.checkImage(file(png(0, 100)))).ok, false);
  assert.equal((await guard.checkImage(file(webpVp8x(16384, 6000)))).ok, true);                      // inside both limits
  assert.equal((await guard.checkImage(file(Buffer.alloc(0)))).ok, false);                           // empty
  assert.equal((await guard.checkImage(null)).ok, false);
  assert.equal((await guard.checkImage({})).ok, false);
  assert.equal((await guard.checkImage('/etc/passwd')).ok, false);
  // Options narrow the allowed set (e.g. a page that only wants PNG/JPEG).
  assert.equal((await guard.checkImage(file(gif(10, 10)), { allow: ['png', 'jpeg'] })).ok, false);
  assert.equal((await guard.checkImage(file(png(10, 10)), { maxBytes: 10 })).ok, false, 'a custom byte limit is honoured');
});

test('an unreadable file never throws', async () => {
  const broken = { size: 100, slice: () => ({ arrayBuffer: () => Promise.reject(new Error('read failed')) }) };
  const r = await guard.checkImage(broken);
  assert.equal(r.ok, false); assert.match(r.message, /could not be read/);
  const throwing = { size: 100, slice: () => { throw new Error('boom'); } };
  assert.equal((await guard.checkImage(throwing)).ok, false);
});
