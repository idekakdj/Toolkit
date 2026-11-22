# Toolkit review — October 8, 2026

This review implemented fixes in the shared server and all four apps. Existing
user designs were not edited. Tests use disposable accounts, documents, and data
directories.

## Shared server and shell

- Direct editor `.html` URLs now enforce shared authentication before static
  serving; previously those paths bypassed the page gates.
- API rate limiting and CSRF rejection run before large request-body parsing.
  Authentication bodies have a smaller limit and private API responses use
  `Cache-Control: no-store`.
- Malformed cookies are ignored safely; invalid JSON returns a clear 400.
- Bcrypt operations are asynchronous, and concurrent registration rechecks
  uniqueness after hashing.
- Rejected updates no longer partially change names/documents before returning
  an error. Thumbnail clearing works, and malformed thumbnail data is rejected.
- Shared document validation bounds integer canvas dimensions, raster sources,
  nesting and numeric values; image layers require unique IDs and valid opacity.
- Corrupt databases halt startup without overwriting the original file.
  `TOOLKIT_DATA_DIR` supports isolated testing and deployment storage.
- The shell respects reduced-motion preferences, shows keyboard focus, restores
  selection after lost focus during drawing, and reports failed logout requests.
- Updated four backend dependency packages through compatible npm audit fixes.
  The approved follow-up audit reported zero known backend vulnerabilities.

## App improvements

**Sigma:** corrected undo for layer reorder and text deletion, locked-node
deletion, save concurrency and failure feedback, export stacking and edge
strokes, JPEG transparency, raster size checks, and safe image import. Pigment
gradients, image rotation and item opacity survive raster conversion. Added
keyboard layer access and dialog focus handling. See `sigma/AUDIT.md`.

**Pigment:** corrected sparse-stroke erasing, canceled gestures, save races and
rename persistence, failed-load protection, and import atomicity. Sigma image
nodes now import instead of disappearing; rotation, opacity and safe raster
sources carry through. Navigation prompts for unsaved work without sending an
unqueued PUT that could race existing saves. Added accessible modal and tile
interaction.

**ImageVendor:** protected saved documents after decode/load failures, repaired
save and rename races, adjustment/text/opacity undo, and atomic history restore.
Corrected transparent blur edges, sharpen borders, JPEG backgrounds, crop display
size and export button recovery. Imports normalize to safe PNGs and missing art
fails explicitly. See `imagevendor/REVIEW.md`.

**Placeholder:** repaired CSV parsing/data-loss cases, BOM handling, prototype
named keys and XML array output. Fixed library load ordering, stale async
responses, duplicate conversions, nested file drops and hidden errors. Imports
preserve embedded Pigment images, rotation, opacity and zero-width outlines.
Dialog keyboard focus and status announcements improved. See its README for
format-specific limitations.

## Verification

- `cd toolkit; npm test`: all eleven isolated regression suites pass.
- Headless Edge smoke checks pass for all landing pages, shared authentication,
  Sigma drawing, Pigment brush/clipart, independent ImageVendor layers and saving,
  ImageVendor handoffs into Sigma/Pigment/Placeholder, and PNG conversion.
- Browser smoke checks report no uncaught page errors. Optional CDN requests were
  deliberately blocked in the smoke environment; browser-native conversions were
  exercised, not every third-party codec.
- JavaScript syntax checks pass using the correct script/module formats.
- `npm audit --omit=dev`: zero reported vulnerabilities after compatible updates.
  This does not audit browser CDN libraries or prove the absence of security bugs.

## Remaining practical limits

The JSON store is intended for a single server process. Editor saves check server
revisions; legacy API clients that omit `baseRevision` retain unconditional writes.
Large live raster documents and transient snapshots can still use substantial
memory despite the new history storage budget. Cross-app transfers flatten
artwork; editable source layer structures are not universally preserved.
Pigment's vector conversion approximates curves and imported Sigma text is
rasterized rather than editable. Full visual accessibility, assistive-technology, all codec and
production load testing remain outside these checks. Legacy remote/SVG raster
sources are rejected rather than automatically migrated.

## Follow-up fixes

- Sigma, Pigment and ImageVendor expose and submit document revisions. A stale
  save returns 409 before mutation, stops automatic retries/queued saves, retains
  local edits and directs the user to export them before reloading. Sigma rename
  writes share its document write queue.
- ImageVendor sends original-resolution PNGs to Sigma/Pigment with transparent
  destination backgrounds. Oversized encoded transfers fail before destination
  creation instead of silently reducing resolution. SVG imports preserve alpha.
- Pigment accepts tiny valid saved canvases, imports Sigma text as transparent
  PNGs with multiline alignment, rotation and opacity, and preserves alpha in
  PNG downloads. Text imports enforce size budgets, escape markup and commit
  additions only after every decode succeeds. Pigment/ImageVendor thumbnails
  clamp both dimensions to at least one pixel so thin images remain savable.
- ImageVendor's combined undo/redo strings are limited to 64 MiB (estimated as
  two bytes per character) and 30 steps per stack. Old entries are discarded;
  a single snapshot larger than the budget cannot be retained for undo.
- Added API/editor stale-write, transfer quality/size, text-import and history
  budget regression checks. Headless Edge checks cover two actual editor tabs
  for each app, full-resolution alpha handoffs and real text raster decoding.
  All eleven suites and 42 JavaScript syntax checks pass after the follow-up.

Restart Toolkit's server to load the server and dependency updates.
