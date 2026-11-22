# ImageVendor bounded review

Only files inside `imagevendor/` were changed. No application server was started, database was opened, or real design was created, updated, or deleted. Other app code and server routes were read to check contracts.

## Changes

- `js/app.js`: save revisions prevent an older request clearing newer dirty edits; image names use the same autosave queue; failed document loads detach the original image ID and retain an error; initialization blocks editing until loading completes. Unload warns for unsaved edits instead of relying on an unacknowledged, potentially oversized keepalive request.
- Undo/redo decodes layers into temporary canvases, commits atomically, preserves the active layer, serializes history navigation, and prevents editing while restoring. Adjustment history captures the pre-preview image; switching editing operations or layers commits the preview baseline. Adjustment previews are dirty and saved. Layer opacity gestures capture one undo entry. Layer renames capture history and schedule persistence.
- `js/tools.js`: text insertion is undoable and commits once even when removing the field fires blur; Escape cancels. Crop updates displayed canvas dimensions and clears stale selections; rotation and history restoration clear selections too. Eyedropper clamps to the last valid pixel at image edges. Pointer cancellation ends the gesture and schedules persistence.
- `js/adjust.js`: blur averages premultiplied colors to avoid dark transparent edges; sharpen clamps border samples so constant-color borders stay constant.
- `js/raster.js`: saved image documents require integer dimensions 1–8000, at most 64 layers, unique nonempty IDs, embedded PNG/JPEG/WebP data (or empty layer data), and valid opacity. File imports render into canvas, verify PNG encoding before mutating the document, and surface read/decode errors. Imported and new layers respect the server layer limit. String sources reject remote URLs and SVG data.
- `js/interop.js`: all downloads share Blob encoding with failure handling; JPEG flattens transparency onto white; successful and failed exports release the export button; destination names stay within the 80-character server limit. Handoffs cannot round a narrow dimension to zero. Export status no longer falsely reports the source document as saved. Import lists discard stale responses, import cards are keyboard buttons, and SVG decoding releases object URLs even if drawing fails.
- `app.html`, `css/imagevendor.css`, and modal/layer handlers: live save status, tool pressed state, import selected state, labeled visibility controls, keyboard layer selection, dialog naming, focus trapping/restoration, visible keyboard focus, and touch canvas gestures. Editor shortcuts no longer intercept text-field undo or modal input; Space on a focused button no longer starts panning.

## Verification

Run `node imagevendor/regression.cjs`. Twelve isolated checks execute actual application functions in a synthetic DOM/canvas/API environment: transparent-edge blur, sharpen borders, text commit/cancel, save race, atomic active-layer undo and overlapping navigation, corrupt-load protection, adjustment history, cross-app export reset/name/document, raster validation, import normalization/taint rejection, JPEG flattening/encoding failure, and opacity history.

All JavaScript modules also pass `node --check`. No tests load server/store modules or make network calls. The harness strips ES module imports and injects synthetic dependencies; it does not validate browser module loading or raster codec implementation.

## Remaining limitations

- Follow-up headless Edge checks cover native canvas rendering, alpha handoffs, saving, two-tab conflicts and Placeholder conversion with synthetic data. Comprehensive visual, assistive-technology, codec and touch testing remains outstanding.
- Sigma/Pigment export still creates a destination then updates its document in a second request. A second-request failure can leave an empty destination. Handoffs now preserve original resolution and transparency as PNG; the 8 MB destination limit is checked before creation.
- Placeholder export opens its converter; saved images are available through Placeholder's existing ImageVendor picker. It does not transfer unsaved in-memory edits.
- Live layers and temporary snapshots can consume significant memory, and payloads can exceed server limits. Combined undo/redo strings now have a 64 MiB budget and 30-entry bounds; oversized snapshots cannot be retained. Failed saves stay dirty and visible.
- Import conversion duplicates the other apps' SVG serializers, so uncommon rendering features/fonts can differ from their native editors.
