export function requireDimensions(w, h) {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 8000 || h > 8000) {
    throw new Error('Image dimensions must be whole pixels between 1 and 8000.');
  }
}
export function requireRaster(src) {
  if (typeof src !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src)) {
    throw new Error('Image sources must be embedded PNG, JPEG or WebP data.');
  }
  return src;
}

// Normalize decoded local files (including SVG) into embedded raster data.
export function imageToPNG(image) {
  requireDimensions(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');
  ctx.drawImage(image, 0, 0);
  return requireRaster(canvas.toDataURL('image/png'));
}
