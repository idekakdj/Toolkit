// Snapshot strings use up to two bytes per character. Keep combined undo/redo
// storage bounded even when one document contains many raster layers.
export const HISTORY_BYTES = 64 * 1024 * 1024;
export function trimHistory(undo, redo, preferred = undo, budget = HISTORY_BYTES) {
  let bytes = [...undo, ...redo].reduce((sum, snapshot) => sum + snapshot.length * 2, 0);
  const other = preferred === undo ? redo : undo;
  while (bytes > budget && (other.length || preferred.length)) {
    const stack = other.length ? other : preferred;
    bytes -= stack.shift().length * 2;
  }
  while (undo.length > 30) undo.shift();
  while (redo.length > 30) redo.shift();
}
