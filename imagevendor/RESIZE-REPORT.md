# Image resize handoff

All changes are confined to imagevendor/. No dependencies or real database calls.

Files: app.html (accessible Transform controls), css/imagevendor.css (navy/gold styling), js/resize.js (validation and temporary layer allocation), js/app.js (command, history and refresh integration), regression.cjs (synthetic tests).

Browser selectors: #resize-width, #resize-height, #resize-aspect (checked initially), #apply-resize, #resize-error (live alert). Controls live in the existing Transform panel. Dimensions initialize on document load and refresh on undo/redo. Editing either dimension with aspect enabled computes the other from the current document ratio, rounded to at least one pixel. Apply rejects dimensions outside integer 1..8000.

The command resamples every independent layer, including hidden layers, without background fill. It preserves document layer IDs/order/visibility/opacity, active layer and background. Combined old/new layer allocations plus two old/new display surfaces must fit 64 million pixels. All replacements and the history snapshot are prepared before state changes. Resize records one snapshot through existing bounded history logic, clears selection/marquee/adjustment cache, refreshes canvas dimensions/fit/composite/layers/history controls and schedules existing revision-aware autosave. History restoration blocks resize; same-size Apply is a no-op.

Run: node imagevendor/regression.cjs; node imagevendor/history-regression.cjs; node imagevendor/handoff-regression.cjs.

Tests cover independent source layers and draw geometry, metadata and transparent background preservation, one-step undo/redo, aspect coupling, invalid dimensions, memory budget, first/later allocation failure, visible errors and history concurrency. Existing autosave conflict/revision, history budget and transparent interop tests pass. Tests use synthetic canvas/API fixtures; browser pixel resampling and visual layout still require the main browser runner.

Suggested browser check: resize a transparent two-layer image (one hidden with partial opacity), confirm alpha remains transparent and both layers scale, undo once and redo; reject fractional/zero/over-budget sizes with no document or history change. Verify keyboard access and the live error alert.
