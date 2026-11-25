const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const jsDir = path.join(__dirname, '../js');
const FILES = ['library.js', 'library-animals.js', 'library-nature.js', 'library-food.js', 'library-travel.js', 'library-fun.js'];
const ORIGINAL_IDS = ['butterfly', 'fish', 'flower', 'sailboat', 'mushroom', 'rocket', 'house', 'cat', 'ice-cream', 'hot-air-balloon', 'turtle', 'robot'];
const ALLOWED_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line']);
const FORBIDDEN_ATTRS = /^(style|transform|href|xlink:href|id|on[a-z]+)$/i;

(async () => {
  // The repo has no "type": "module", so load the ESM sources from a temp copy that does.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pigment-library-'));
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
    for (const f of FILES) fs.copyFileSync(path.join(jsDir, f), path.join(tmp, f));
    const { COLORING, CATEGORIES, getColoring } = await import(pathToFileURL(path.join(tmp, 'library.js')).href);

    // No non-ASCII characters in the five art files (library.js predates this rule).
    for (const f of FILES.slice(1)) {
      const text = fs.readFileSync(path.join(jsDir, f), 'utf8');
      assert.ok(!/[^\x00-\x7f]/.test(text), `${f} contains non-ASCII characters`);
    }

    assert.equal(COLORING.length, 112);
    const ids = COLORING.map(p => p.id);
    assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
    for (const id of ORIGINAL_IDS) assert.ok(ids.includes(id), `original id missing: ${id}`);

    assert.deepEqual(CATEGORIES.map(c => c.key), ['animals', 'nature', 'food', 'travel', 'fun']);
    assert.equal(CATEGORIES.find(c => c.key === 'fun').label, 'Fun & fantasy');
    const counts = {};
    for (const c of CATEGORIES) counts[c.key] = 0;
    for (const p of COLORING) {
      assert.ok(p.category in counts, `${p.id}: bad category ${p.category}`);
      counts[p.category]++;
    }
    assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 112);
    for (const [k, n] of Object.entries(counts)) assert.ok(n >= 20, `category ${k} has only ${n}`);

    for (const p of COLORING) {
      const tag = `piece ${p.id}`;
      assert.equal(typeof p.name, 'string', tag);
      assert.ok(p.name.trim(), tag);
      assert.equal(p.vb, 200, `${tag}: vb`);
      const elements = [...p.markup.matchAll(/<\s*([a-zA-Z][\w:-]*)([^>]*)>/g)];
      assert.ok(elements.length, `${tag}: no elements`);
      assert.ok(!/<\s*\//.test(p.markup), `${tag}: unexpected closing tags`);
      const regions = [];
      for (const [, name, attrs] of elements) {
        assert.ok(ALLOWED_TAGS.has(name), `${tag}: tag <${name}> not allowed`);
        const attrMap = {};
        for (const m of attrs.matchAll(/([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
          assert.ok(!FORBIDDEN_ATTRS.test(m[1]), `${tag}: attribute ${m[1]} not allowed`);
          attrMap[m[1]] = m[2];
        }
        const leftover = attrs.replace(/([a-zA-Z_:][\w:.-]*)\s*=\s*"([^"]*)"/g, '').replace(/[\s/]/g, '');
        assert.equal(leftover, '', `${tag}: unparsed attribute text "${leftover}"`);
        if ('data-region' in attrMap) {
          regions.push(attrMap['data-region']);
          assert.equal(attrMap.fill, '#ffffff', `${tag}: region ${attrMap['data-region']} fill`);
        }
      }
      assert.ok(regions.length > 0, `${tag}: no regions`);
      assert.deepEqual(regions, regions.map((_, i) => `r${i + 1}`), `${tag}: regions must be unique and contiguous r1..rN`);
    }

    for (const p of COLORING) assert.equal(getColoring(p.id), p);
    assert.equal(getColoring('no-such-piece'), null);
    assert.equal(getColoring(undefined), null);

    console.log(`library: ${COLORING.length} pieces ok (${Object.entries(counts).map(([k, n]) => `${k}=${n}`).join(', ')})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(err => { console.error(err); process.exit(1); });
