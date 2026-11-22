// Client checks mirror the server image document contract.
export function validateImageDocument(value) {
  const c = value?.canvas;
  if (!c || !Number.isInteger(c.w) || !Number.isInteger(c.h) || c.w < 1 || c.h < 1 || c.w > 8000 || c.h > 8000) throw new Error('Invalid canvas dimensions');
  if (!Array.isArray(value.layers) || value.layers.length > 64) throw new Error('Invalid layer list');
  const ids = new Set();
  for (const layer of value.layers) {
    if (!layer || typeof layer.id !== 'string' || !layer.id || ids.has(layer.id)) throw new Error('Invalid or duplicate layer ID');
    ids.add(layer.id);
    if (typeof layer.data !== 'string' || (layer.data && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(layer.data))) throw new Error('Saved layers must contain embedded PNG, JPEG, or WebP images');
    if (layer.opacity != null && (!Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)) throw new Error('Invalid layer opacity');
  }
  return value;
}
