// Shared raster boundary: reject external/SVG sources before decoding them.
export function assertRasterSource(source) {
  if (typeof source !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(source) || source.endsWith(',')) {
    throw new Error('Image must be embedded PNG, JPEG or WebP base64 data');
  }
  return source;
}

export function assertRasterDimensions(w, h) {
  if (![w, h].every(n => Number.isInteger(n) && n >= 1 && n <= 8000)) {
    throw new Error('Image dimensions must be integers from 1 to 8000');
  }
}

export async function compositeRasterDocument(doc) {
  const { w, h, bg = 'transparent' } = doc.canvas || {};
  assertRasterDimensions(w, h);
  if (!Array.isArray(doc.layers)) throw new Error('Invalid image layers');
  const ids = new Set();
  // Validate the entire document before allocating a canvas or loading images.
  for (const layer of doc.layers) {
    if (!layer || typeof layer.id !== 'string' || !layer.id || ids.has(layer.id)) throw new Error('Image layer IDs must be unique');
    ids.add(layer.id);
    if (layer.data) assertRasterSource(layer.data);
    if (layer.opacity != null && (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)) throw new Error('Invalid layer opacity');
  }
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  if (bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  for (const layer of doc.layers) {
    if (layer.visible === false || !layer.data) continue;
    const image = await new Promise((resolve, reject) => {
      const im = new Image(); im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('A source layer could not be loaded')); im.src = layer.data;
    });
    ctx.globalAlpha = layer.opacity ?? 1;
    ctx.drawImage(image, 0, 0, w, h);
    ctx.globalAlpha = 1;
  }
  return assertRasterSource(cv.toDataURL('image/png'));
}
