# Toolkit feature scope review

Reviewed the original brief against the actual editors and conversion registry.
The scope remains a shared authenticated shell for classic vector design, paint
and coloring, layered image editing, and local file conversion. This pass adds
four everyday features without adding dependencies or new storage schemas.

| App | Gap found | Added behavior |
| --- | --- | --- |
| Sigma | Alignment existed, but equal spacing did not | Horizontal/vertical equal-gap distribution for at least three visible, unlocked selected objects, including rotated objects. End objects stay fixed; one undo restores spacing. Controls are in Design → Align. |
| Pigment | Shapes could be imported, but not drawn directly | Rectangle and ellipse tools with drag previews, current solid/gradient fill, and dark outlines. R/O select the tools; Shift makes squares/circles. Escape/capture loss cancel without changing artwork. |
| ImageVendor | Crop and rotation existed, but image resampling did not | Transform → Width/Height, aspect ratio, and Apply resize. Every layer is resampled independently, including hidden layers, preserving IDs/order/opacity/background. Undo restores the prior dimensions and content. |
| Placeholder | Conversion kept natural dimensions and omitted same-format output | Image size controls for raster/ICO/image-PDF outputs, including PNG-to-PNG and JPEG-to-JPEG. Aspect ratio fits within requested dimensions; unchecked allows exact dimensions. Blank fields retain original size. |

All editor changes use existing history and revision-aware autosave. Shared
authentication, ownership checks, rate limits, security headers and document
validation continue to apply. No real user documents were used for testing.

## Bounds and remaining scope

- Sigma distribution requires three movable nodes and may produce negative gaps
  when the fixed endpoints overlap. It does not introduce auto-layout or frames.
- Pigment ellipses use 48-point regions compatible with its existing SVG and
  Sigma interchange. Shapes have the existing 2px dark outline; this is not a
  full vector transform/shape styling panel.
- ImageVendor dimensions remain 1–8000 whole pixels. Combined old/new layer
  canvases and display surfaces must fit a 64-million-pixel allocation budget.
  Resampling changes raster pixels; undo history is bounded as documented.
- Placeholder dimensions are 1–8000, with at most 16 million output pixels.
  JPEG/BMP flatten onto white; PNG/WebP preserve alpha where the codec supports
  it. ICO still fits within 256px. Animated images use their first frame.
- Larger potential additions remain separate work: Sigma multi-artboards,
  reusable components and layout constraints; Pigment native editable text and
  object transformation; ImageVendor masks and blend modes; Placeholder batch
  queues. Cross-app transfers do not preserve every editable source structure.

## Verification

`node toolkit/test/run-all.cjs` runs all 14 isolated suites, including spacing,
shape gestures, independent-layer resize, conversion geometry and UI options.
Headless Edge exercises the new controls, gradient shape preview/commit/cancel,
undo/autosave, alpha-preserving outputs and existing shared-auth/cross-app/save
conflict workflows. Optional CDN codecs remain outside the browser smoke test.
