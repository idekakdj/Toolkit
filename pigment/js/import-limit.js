// Validate the full prospective document before touching history or live state.
export function appendImportedItems(current, additions, pushHistory) {
  const items = current.items.concat(additions);
  if (items.length > 5000) throw new Error('Import exceeds the 5000-item painting limit');
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, canvas: current.canvas, items })).byteLength;
  if (bytes > 8 * 1024 * 1024) throw new Error('Import exceeds the 8 MB painting limit');
  if (!additions.length) return;
  pushHistory();
  // Keep the live array identity for callers holding getDoc().items.
  for (const item of additions) current.items.push(item);
}
