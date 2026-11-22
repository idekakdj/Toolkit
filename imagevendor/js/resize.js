// Allocate every replacement before the caller records history or mutates state.
export const RESIZE_PIXEL_BUDGET = 64_000_000;

export function resizeDimensions(width, height) {
  const parse = value => {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) throw new Error('Width and height must be whole pixels from 1 to 8000.');
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 8000) throw new Error('Width and height must be whole pixels from 1 to 8000.');
    return n;
  };
  return { w: parse(width), h: parse(height) };
}

export function prepareResize(canvas, layers, width, height, createCanvas) {
  const { w, h } = resizeDimensions(width, height);
  // Include the two display surfaces as well as old and replacement layers.
  const pixels = layers.reduce((sum, layer) => sum + layer.offscreen.width * layer.offscreen.height, 0)
    + layers.length * w * h + 2 * (canvas.w * canvas.h + w * h);
  if (!Number.isSafeInteger(pixels) || pixels > RESIZE_PIXEL_BUDGET) throw new Error('Resize exceeds the 64 million pixel memory budget. Choose smaller dimensions.');
  return layers.map(layer => {
    const offscreen = createCanvas();
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d');
    if (!ctx) throw new Error('Unable to allocate resized layers. Choose smaller dimensions.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(layer.offscreen, 0, 0, w, h);
    return { ...layer, offscreen };
  });
}
