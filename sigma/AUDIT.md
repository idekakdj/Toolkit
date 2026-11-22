# Sigma bounded review

## Equal-gap distribution

- Added labeled native buttons inside Align with selectors
  `[data-distribute="horizontal"]` and `[data-distribute="vertical"]`.
  Controls disable below three distinct visible, unlocked selected nodes and
  refresh on existing selection/document events. `initProps` wires clicks.
- `distributeSelected(axis)` sorts rotation-aware AABB starts, retaining selection
  order for ties. It preserves both endpoint nodes and translates only interior
  nodes along the requested axis. Overlap (negative gaps) is allowed.
- Changed distributions create one undo entry and emit the existing `markDirty`
  document event. Insufficient selections, invalid axes, and already equal gaps
  create no history; floating-point differences below 1e-9 are treated as no-op.
- Validation: `npm test` in `sigma/`: 25 passing tests, including five new tests
  for both axes, unequal rotated sizes, endpoint preservation, locked/hidden
  filtering, stable ties, negative gaps, single undo/redo, no-op events/history,
  and control labels/disabled state. No browser or server was started; main owns
  browser/runner integration. No real database was accessed.

Only files under `sigma/` were edited. Shared-server route/validation code and
Pigment/ImageVendor renderers were read to verify document contracts. Toolkit
was not started; no real database was opened and no user designs were modified.

## Fixes and evidence

- `state.js`, `panels.js`: layer dragging previously called `pushUndo` after
  removing the dragged layer. `moveLayer` now snapshots before either splice.
  A three-layer reorder test verifies all IDs survive undo and redo.
- `state.js`, `main.js`: clearing an existing text layer now records undo.
  Empty newly created text is removed, unchanged text avoids dirtying the
  document, and locked layers survive Delete even when selected through groups
  or the layer panel. Text deletion/edit and locked deletion tests cover these.
- `render.js`: remeasured text is rerendered for every alignment so left-aligned
  rotated text also receives a rotation center matching its new dimensions.
- `persistence.js`, `main.js`: saves freeze the document before asynchronous
  work, serialize requests, and keep the document dirty until acknowledgement.
  Edits made during a request stay dirty. Thumbnail errors do not block saving.
  Transient failures retry; validation/auth failures do not loop indefinitely.
  Save errors display their message. Leaving with pending edits invokes the
  browser's unsaved-change confirmation instead of relying on an unbounded
  unload PUT that can exceed the browser keepalive limit or race an active save.
  Four mock-request tests cover successful, concurrent, queued, and failed saves.
- `export.js`: selection export uses document z order rather than selection
  order. Artboard export keeps strokes whose geometry is outside the artboard
  but whose paint intersects it. JPEG transparency is composited over white.
  Raster exports reject dimensions above 16384 or areas above 64 megapixels
  before allocation. Thumbnails fit both dimensions within 280 pixels. Tests
  cover stack order, XML escaping, boundary strokes and oversized export.
- `imageimport.js`, `raster.js`: saved picker names/thumbnails are inserted with
  DOM APIs rather than interpolated HTML. Obsolete tab responses are discarded.
  Pigment linear/radial gradients retain stops and angles, and zero-width
  region strokes stay zero. Missing art or image decoding errors fail visibly
  instead of importing partial content. ImageVendor order, opacity and hidden
  layers are covered by a mocked composite test.
- All new imported nodes store embedded PNG data. Decoded local files,
  including SVG, are rendered to PNG before insertion. Remote/SVG source URLs
  in cross-app raster documents are rejected. Integer source dimensions must
  be 1..8000; exceeding 8 MB document size or 5000 nodes rejects insertion
  before document mutation. Tests exercise safe sources, invalid dimensions,
  normalization, atomic size rejection and import undo.
- `panels.js`: artboard numeric inputs round to whole pixels to satisfy shared
  server validation while preserving the existing 16..8000 UI bounds.
- `dialogs.js`, editor/dashboard/import wiring: dialogs have names, modal
  semantics, focus placement/restoration, Escape and Tab containment. Global
  editor shortcuts are suspended inside dialogs and preserve Space/Enter
  activation on buttons. Layer names and project thumbnails are keyboard
  selectable; focus rings, layer action labels, tool pressed state and live
  save status were added. Right-click no longer draws shapes; pointer cancel
  clears drag chrome and lost window focus clears held-space pan mode.
- `dashboard.js`: repeat submit/delete actions are guarded; delete/load failures
  are visible. `main.js` redirects failed project loads to `/sigma/dashboard`.
- `README.md`: storage documentation now identifies the shared Toolkit store.

## Verification

`node --test sigma/tests/regression.test.js`: 17 passing isolated tests.
`node --check` succeeded for every JavaScript file under `sigma/public/js`.
`npm test` is available without installing dependencies.

## Remaining limits

No full browser/visual or assistive-technology test was performed. Canvas and
image mocks verify control flow, source normalization and composite parameters,
not browser pixel fidelity, font metrics or SVG-in-image nested raster behavior.
Modal focus and pointer interaction need a browser smoke check. Pigment and
ImageVendor imports remain flattened images, preserving Sigma's existing
feature model rather than promising editable source layers. Legacy projects
containing remote/SVG raster sources are not migrated automatically. Persistence
has no conflict resolution for simultaneous editors in different tabs; those
requests still depend on the shared server's last-write behavior. Raster limits
are conservative guards, not a guarantee that every device can allocate the
largest allowed canvas. An unsaved-change prompt cannot protect against abrupt
process termination.
