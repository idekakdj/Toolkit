# Shape tools report

Changes are confined to pigment/. Rectangle (R) and Ellipse (O) reuse the minimalist tool styling and aria-pressed handling. Shift makes squares/circles. Regions use four rectangle points or 48 ellipse samples, captured current solid/gradient fill, and the existing default dark 2px outline.

Preview paths never enter document items. Release commits one history snapshot and autosave schedule. Escape, tool switching, undo/redo, pointercancel and capture loss discard pending shapes. Dimensions below three screen pixels are ignored. Existing library, fill, interop and save-conflict logic remains unchanged.

Main runner selectors: [data-tool="rectangle"], [data-tool="ellipse"], #paint-svg, [data-shape-preview], #undo-btn, #redo-btn, #gradient-toggle.

Browser integration: require('./pigment/tests/shapes-browser.cjs')(page) after opening a ready painting with mocked APIs. Uses the main runner's existing Playwright page, no dependencies or DB. Tests real drag preview isolation, rectangle commit, undo/redo, Escape, tiny drag, Shift-circle geometry. Leaves initial document plus one rectangle. Browser test supplied but not executed here.

Validation passed: node pigment/tests/shapes.cjs, regression.cjs, integration.cjs, raster.cjs, text-import.cjs. Shape tests execute actual gesture and undo/redo functions, covering reverse drag, 48-point sampling, release coordinates, Shift, gradient snapshot, one history/save, pointer ownership, cancel/capture loss and tiny/zero gestures.
