// Real-browser smoke checks, using disposable data rather than user artwork.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
process.env.TOOLKIT_EMAIL_DNS_CHECK = 'off'; // synthetic example.com addresses
process.env.TOOLKIT_EMAIL_VERIFICATION = 'off'; // these suites test other features; verification has its own suite (mail.test.cjs)
process.env.TOOLKIT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-browser-'));
const app = require('../server/index');
async function main() {
  const runtime = process.env.TOOLKIT_PLAYWRIGHT_PATH || 'playwright';
  const { chromium } = require(runtime);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const base = `http://127.0.0.1:${server.address().port}`;
    const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 } });
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', err => errors.push(err.message));
    // Optional CDN libraries are not needed for browser-native image checks.
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
    const api = async (url, method = 'GET', data) => {
      const response = await context.request.fetch(url, { method, data, headers: { 'X-Requested-With': 'smoke' } });
      assert.ok(response.ok(), `${url}: ${response.status()} ${await response.text()}`);
      return response.json();
    };
    await api('/api/auth/register', 'POST', { name: 'Browser test', email: 'browser@example.com', password: 'Violet-Harbor-Lamp-42', acceptTerms: true });
    for (const url of ['/', '/sigma', '/pigment', '/imagevendor', '/placeholder/']) {
      await page.goto(base + url);
      assert.ok(await page.title(), url);
    }
    await page.goto(base + '/sigma/dashboard');
    await page.waitForSelector('#new-project-btn');
    const project = (await api('/api/projects', 'POST', { name: 'Smoke vector' })).project;
    await page.goto(base + '/sigma/editor/' + project.id);
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');
    await page.locator('[data-tool="rect"]').click();
    let bounds = await page.locator('#viewport').boundingBox();
    await page.mouse.move(bounds.x + 100, bounds.y + 100);
    await page.mouse.down(); await page.mouse.move(bounds.x + 250, bounds.y + 200, { steps: 8 }); await page.mouse.up();
    await page.waitForFunction(() => document.querySelectorAll('#viewport [data-node-id]').length > 0);
    const painting = (await api('/api/paintings', 'POST', { name: 'Smoke paint' })).painting;
    await page.goto(base + '/pigment/app?id=' + painting.id);
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');
    await page.locator('[data-tool="brush"]').click();
    bounds = await page.locator('#paint-svg').boundingBox();
    await page.mouse.move(bounds.x + 100, bounds.y + 100);
    await page.mouse.down(); await page.mouse.move(bounds.x + 200, bounds.y + 150, { steps: 8 }); await page.mouse.up();
    await page.waitForFunction(() => document.querySelectorAll('#paint-svg path[data-item-index]').length > 0);
    await page.locator('#library-btn').click();
    await page.locator('#library-grid .lib-item').first().click();
    await page.waitForFunction(() => !!document.querySelector('#paint-svg [data-region]'));
    const itemCount = await page.evaluate(async () => (await import('/pigment/js/app.js')).getDoc().items.length);
    for (const [tool, points] of [['rectangle', 4], ['ellipse', 48]]) {
      await page.locator('[data-tool="' + tool + '"]').click();
      if (tool === 'ellipse') await page.locator('#gradient-toggle').click();
      bounds = await page.locator('#paint-svg').boundingBox();
      await page.mouse.move(bounds.x + 80, bounds.y + 80); await page.mouse.down();
      await page.mouse.move(bounds.x + 180, bounds.y + 140, { steps: 5 });
      assert.equal(await page.locator('[data-shape-preview]').count(), 1);
      await page.mouse.up();
      const shape = await page.evaluate(async () => (await import('/pigment/js/app.js')).getDoc().items.at(-1));
      assert.equal(shape.kind, 'region'); assert.equal(shape.points.length, points);
      if (tool === 'ellipse') assert.equal(shape.fill.grad, 'linear');
    }
    await page.locator('#undo-btn').click();
    assert.equal(await page.evaluate(async () => (await import('/pigment/js/app.js')).getDoc().items.length), itemCount + 1);
    await page.locator('#redo-btn').click();
    assert.equal(await page.evaluate(async () => (await import('/pigment/js/app.js')).getDoc().items.length), itemCount + 2);
    await page.mouse.move(bounds.x + 100, bounds.y + 100); await page.mouse.down();
    await page.mouse.move(bounds.x + 150, bounds.y + 150, { steps: 4 });
    await page.keyboard.press('Escape'); await page.mouse.up();
    assert.equal(await page.locator('[data-shape-preview]').count(), 0);
    assert.equal(await page.evaluate(async () => (await import('/pigment/js/app.js')).getDoc().items.length), itemCount + 2);
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');
    assert.equal((await api('/api/paintings/' + painting.id)).painting.document.items.at(-1).points.length, 48);
    const image = (await api('/api/images', 'POST', { name: 'Smoke raster' })).image;
    await page.goto(base + '/imagevendor/app?id=' + image.id);
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');
    await page.locator('[data-tool="brush"]').click();
    bounds = await page.locator('#iv-canvas').boundingBox();
    await page.mouse.move(bounds.x + 100, bounds.y + 100);
    await page.mouse.down(); await page.mouse.move(bounds.x + 200, bounds.y + 150, { steps: 8 }); await page.mouse.up();
    await page.locator('#add-layer-btn').click();
    await page.waitForFunction(() => document.querySelectorAll('#layers-list .layer-row').length === 2);
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');
    const stored = (await api('/api/images/' + image.id)).image.document;
    assert.equal(new Set(stored.layers.map(l => l.id)).size, 2);
    assert.notEqual(stored.layers[0].data, stored.layers[1].data);
    // A canvas wider than the old 1600px handoff cap with transparent pixels.
    const transparent = (await api('/api/images', 'POST', { name: 'Alpha raster' })).image;
    const pixels = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 1701; c.height = 2;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 1, 1);
      return c.toDataURL('image/png');
    });
    await api('/api/images/' + transparent.id, 'PUT', { document: {
      version: 1, canvas: { w: 1701, h: 2, bg: 'transparent' },
      layers: [{ id: 'alpha', name: 'Alpha', visible: true, opacity: 1, data: pixels }],
    } });
    await page.goto(base + '/imagevendor/app?id=' + transparent.id);
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');
    // Exercise raster handoffs in the actual renderers, not just document mocks.
    await page.evaluate(async () => {
      const interop = await import('/imagevendor/js/interop.js');
      for (const destination of ['sigma', 'pigment']) {
        document.querySelector('#export-mode').value = destination;
        await interop.runExport();
      }
    });
    const sentProject = (await api('/api/projects')).projects.find(p => p.name.includes('from ImageVendor'));
    const sentPainting = (await api('/api/paintings')).paintings.find(p => p.name.includes('from ImageVendor'));
    assert.ok(sentProject && sentPainting);
    for (const [url, key] of [[`/api/projects/${sentProject.id}`, 'project'], [`/api/paintings/${sentPainting.id}`, 'painting']]) {
      const doc = (await api(url))[key].document;
      const size = doc.artboard || doc.canvas;
      assert.equal(size.w, 1701); assert.equal(size.h, 2); assert.equal(size.bg, 'transparent');
      const src = (doc.nodes || doc.items)[0].src;
      assert.match(src, /^data:image\/png;base64,/);
      const decoded = await page.evaluate(async src => {
        const img = new Image(); img.src = src; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
        return { w: img.width, h: img.height, red: Array.from(ctx.getImageData(0, 0, 1, 1).data), alpha: ctx.getImageData(1700, 1, 1, 1).data[3] };
      }, src);
      assert.equal(decoded.w, 1701); assert.equal(decoded.h, 2);
      assert.deepEqual(decoded.red, [255, 0, 0, 255]); assert.equal(decoded.alpha, 0);
    }
    await page.goto(base + '/sigma/editor/' + sentProject.id);
    await page.waitForSelector('#viewport image');
    assert.match(await page.locator('#viewport image').getAttribute('href'), /^data:image\//);
    await page.goto(base + '/pigment/app?id=' + sentPainting.id);
    await page.waitForSelector('#paint-svg image');
    assert.match(await page.locator('#paint-svg image').getAttribute('href'), /^data:image\//);
    const textSource = (await api('/api/projects', 'POST', { name: 'Text alpha import' })).project;
    await api('/api/projects/' + textSource.id, 'PUT', { document: {
      version: 1, artboard: { w: 300, h: 200, bg: 'transparent' }, nodes: [{
        id: 'label', type: 'text', text: 'Hello <world>\nSecond line',
        x: 20, y: 20, w: 200, h: 80, fontFamily: 'Arial', fontSize: 24,
        fontWeight: 700, fill: '#000000', align: 'center', rotation: 15, opacity: 0.5, visible: true,
      }],
    } });
    await page.locator('#import-btn').click();
    await page.locator('#import-grid .import-item').filter({ hasText: 'Text alpha import' }).click();
    await page.waitForFunction(() => document.querySelectorAll('#paint-svg image').length === 2);
    const textImage = page.locator('#paint-svg image').last();
    assert.equal(await textImage.getAttribute('opacity'), '0.5');
    assert.match(await textImage.getAttribute('transform'), /rotate\(15 /);
    const textPixels = await page.evaluate(async src => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let painted = 0, clear = 0;
      for (let i = 3; i < data.length; i += 4) { if (data[i]) painted++; else clear++; }
      return { painted, clear };
    }, await textImage.getAttribute('href'));
    assert.ok(textPixels.painted > 0 && textPixels.clear > 0, 'Text raster has glyphs and transparent background');
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');
    await page.goto(base + '/placeholder/convert.html');
    await page.waitForFunction(() => !!window.PlaceholderConvert);
    await page.locator('#fileInput').setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('name,count\nBrush,2\n') });
    await page.waitForFunction(() => document.querySelector('#fileType')?.textContent.includes('CSV'));
    await page.locator('#convertBtn').click();
    await page.waitForFunction(() => !document.querySelector('#resultView').classList.contains('hidden'));
    await page.evaluate(() => window.PlaceholderConvert.resetAll());
    await page.locator('#fileInput').setInputFiles({ name: 'alpha.png', mimeType: 'image/png', buffer: Buffer.from(pixels.split(',')[1], 'base64') });
    await page.waitForFunction(() => document.querySelector('#fileType')?.textContent.includes('PNG'));
    assert.ok(await page.locator('#resizeControl').isVisible());
    await page.locator('#resizeWidth').fill('100'); await page.locator('#resizeHeight').fill('40');
    await page.locator('#resizeAspect').uncheck();
    await page.locator('#convertBtn').click();
    await page.waitForFunction(() => !document.querySelector('#resultView').classList.contains('hidden'));
    const resized = await page.evaluate(async () => {
      const bitmap = new Image(); bitmap.src = document.querySelector('#downloadBtn').href; await bitmap.decode();
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
      const result = { width: bitmap.width, height: bitmap.height, alpha: ctx.getImageData(99, 39, 1, 1).data[3] };
      return result;
    });
    assert.deepEqual(resized, { width: 100, height: 40, alpha: 0 });
    await page.evaluate(() => window.PlaceholderConvert.resetAll());
    await page.locator('#importImageVendorBtn').click();
    await page.locator('.di-item').first().click();
    await page.waitForFunction(() => document.querySelector('#fileType')?.textContent.includes('SVG'));
    const pngValue = await page.locator('#targetSelect option').evaluateAll(options => options.find(o => o.textContent.includes('PNG')).value);
    await page.locator('#targetSelect').selectOption(pngValue);
    await page.locator('#convertBtn').click();
    await page.waitForFunction(() => !document.querySelector('#resultView').classList.contains('hidden'));
    assert.match(await page.locator('#resultName').textContent(), /\.png$/);
    // Two real editor tabs: a stale tab retains local artwork and cannot
    // overwrite the name/document committed by the newer tab.
    for (const config of [
      { route: 'projects', key: 'project', editor: id => '/sigma/editor/' + id, input: '#project-name', tool: '[data-tool="rect"]', canvas: '#viewport', count: '#viewport [data-node-id]' },
      { route: 'paintings', key: 'painting', editor: id => '/pigment/app?id=' + id, input: '#painting-name', tool: '[data-tool="brush"]', canvas: '#paint-svg', count: '#paint-svg path[data-item-index]' },
      { route: 'images', key: 'image', editor: id => '/imagevendor/app?id=' + id, input: '#image-name', add: '#add-layer-btn', count: '#layers-list .layer-row' },
    ]) {
      const created = (await api('/api/' + config.route, 'POST', { name: 'Two tabs ' + config.route }))[config.key];
      const stale = await context.newPage(), newer = await context.newPage();
      for (const tab of [stale, newer]) {
        tab.on('pageerror', err => errors.push(err.message));
        tab.on('dialog', dialog => dialog.accept());
        await tab.goto(base + config.editor(created.id));
        await tab.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');
      }
      await newer.locator(config.input).fill('Newer tab committed');
      await newer.locator(config.input).press('Tab');
      await newer.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');
      const committed = (await api('/api/' + config.route + '/' + created.id))[config.key];
      assert.equal(committed.name, 'Newer tab committed');
      if (config.add) await stale.locator(config.add).click();
      else {
        await stale.locator(config.tool).click();
        const box = await stale.locator(config.canvas).boundingBox();
        await stale.mouse.move(box.x + 100, box.y + 100); await stale.mouse.down();
        await stale.mouse.move(box.x + 200, box.y + 150, { steps: 8 }); await stale.mouse.up();
      }
      await stale.waitForFunction(() => document.querySelector('#save-status')?.textContent.includes('Save conflict'));
      assert.ok(await stale.locator(config.count).count(), 'Local artwork remains available after conflict');
      const after = (await api('/api/' + config.route + '/' + created.id))[config.key];
      assert.equal(after.revision, committed.revision);
      assert.deepEqual(after.document, committed.document);
      await stale.close(); await newer.close();
    }
    const spacing = (await api('/api/projects', 'POST', { name: 'Equal spacing' })).project;
    await api('/api/projects/' + spacing.id, 'PUT', { document: {
      version: 1, artboard: { w: 500, h: 300, bg: '#ffffff' },
      nodes: [10, 100, 300].map((x, i) => ({ id: 'r' + i, type: 'rect', name: 'Rect', x, y: 40, w: 40, h: 40, rotation: 0, opacity: 1, fill: '#ff0000', stroke: 'none', visible: true })),
    } });
    await page.goto(base + '/sigma/editor/' + spacing.id);
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');
    await page.evaluate(async () => { const state = await import('/sigma/js/editor/state.js'); state.setSelection(['r0', 'r1', 'r2']); });
    await page.locator('[data-distribute="horizontal"]').click();
    assert.equal(await page.evaluate(async () => (await import('/sigma/js/editor/state.js')).state.doc.nodes[1].x), 155);
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');
    assert.equal((await api('/api/projects/' + spacing.id)).project.document.nodes[1].x, 155);
    await page.locator('#undo-btn').click();
    assert.equal(await page.evaluate(async () => (await import('/sigma/js/editor/state.js')).state.doc.nodes[1].x), 100);
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');

    const resizeDoc = (await api('/api/images', 'POST', { name: 'Resize layers' })).image;
    const layerData = await page.evaluate(() => ['#ff0000', '#0000ff'].map((color, i) => {
      const c = document.createElement('canvas'); c.width = 20; c.height = 10;
      const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(i * 10, 0, 4, 4); return c.toDataURL('image/png');
    }));
    await api('/api/images/' + resizeDoc.id, 'PUT', { document: { version: 1, canvas: { w: 20, h: 10, bg: 'transparent' }, layers: [
      { id: 'red', name: 'Red', visible: true, opacity: 1, data: layerData[0] },
      { id: 'blue', name: 'Blue', visible: false, opacity: 0.25, data: layerData[1] },
    ] } });
    await page.goto(base + '/imagevendor/app?id=' + resizeDoc.id);
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');
    await page.locator('#resize-width').fill('10');
    assert.equal(await page.locator('#resize-height').inputValue(), '5');
    await page.locator('#apply-resize').click();
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');
    const scaled = (await api('/api/images/' + resizeDoc.id)).image.document;
    assert.deepEqual(scaled.canvas, { w: 10, h: 5, bg: 'transparent' });
    assert.equal(scaled.layers[1].id, 'blue'); assert.equal(scaled.layers[1].visible, false); assert.equal(scaled.layers[1].opacity, 0.25);
    for (const layer of scaled.layers) {
      const decoded = await page.evaluate(async src => {
        const img = new Image(); img.src = src; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
        return { w: img.width, h: img.height, clear: ctx.getImageData(9, 4, 1, 1).data[3], painted: ctx.getImageData(0, 0, 10, 5).data.some((value, i) => i % 4 === 3 && value > 0) };
      }, layer.data);
      assert.deepEqual(decoded, { w: 10, h: 5, clear: 0, painted: true });
    }
    await page.locator('#resize-width').fill('0'); await page.locator('#apply-resize').click();
    assert.match(await page.locator('#resize-error').textContent(), /whole pixels/);
    await page.locator('#undo-btn').click();
    await page.waitForFunction(() => document.querySelector('#iv-canvas').width === 20);
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved');
    assert.equal((await api('/api/images/' + resizeDoc.id)).image.document.canvas.w, 20);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS browser: shared auth, editing/autosave, lossless alpha handoffs, Sigma text import/spacing/undo, Pigment shape previews/gradients/cancel/undo, ImageVendor independent layer resize/undo, all three two-tab save conflicts, Placeholder conversion/resize; no page errors.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(err => { console.error(err); process.exitCode = 1; });
