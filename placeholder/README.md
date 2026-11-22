# Placeholder — client-side file converter

A fully static file-conversion web app. Every conversion runs **in the visitor's
browser** — no backend, no uploads, no server processing costs.

## Pages

- [index.html](index.html) — landing page
- [convert.html](convert.html) — the converter

## Run it

It's a static site, so any static host or local server works:

```powershell
python -m http.server 8741
# then open http://localhost:8741
```

Opening `index.html` directly from disk also works.

## Deploy for free

Push to GitHub and enable GitHub Pages, or drop the folder into Netlify /
Cloudflare Pages / Vercel. There is nothing to build and no server component,
so hosting is free.

## How conversions work

| Source | Targets | Powered by |
|---|---|---|
| PNG, JPEG, WebP, GIF, BMP, SVG, ICO, AVIF | PNG, JPEG, WebP, BMP, ICO, PDF | Canvas API (+ jsPDF for PDF; BMP/ICO encoders are hand-rolled) |
| MP3, WAV, OGG, FLAC, M4A, AAC | WAV, MP3 | Web Audio API (+ lamejs for MP3) |
| MP4, WebM, MOV, OGV | WAV / MP3 (soundtrack), PNG / JPEG (first frame) | Web Audio + `<video>` & Canvas |
| CSV / TSV | JSON, TSV/CSV, XLSX, Markdown table, HTML table | hand-rolled CSV parser (+ SheetJS) |
| JSON | CSV, YAML, XML, XLSX, pretty/minified JSON | js-yaml, SheetJS |
| YAML | JSON | js-yaml |
| XML | JSON | DOMParser |
| XLSX | CSV, JSON, HTML | SheetJS |
| Markdown | HTML, PDF, TXT | marked, jsPDF |
| HTML | Markdown, TXT, PDF | turndown, jsPDF |
| TXT | PDF, HTML | jsPDF |
| **Any file** | ZIP, Base64 text | fflate |

File types are detected from magic bytes (signature sniffing) with content/extension
fallbacks, so a `.txt` that is really a PNG is handled correctly.

Libraries load from free CDNs (cdnjs / jsDelivr) with `defer`; if one fails to
load, the conversions that need it are simply hidden — everything else keeps
working. Conversions that would require server-side processing or licensed
codecs (e.g. full video transcoding) are deliberately not offered.

Image conversions also support resizing and same-format outputs, such as
PNG-to-PNG. Enter width and/or height in pixels; with aspect ratio enabled the
result fits inside those bounds. Disable it for exact dimensions, or leave both
blank for original size. Outputs allow 1–8000 pixels per side and at most 16
million pixels. These options apply to image-to-image, ICO and image-to-PDF
conversion; ICO retains its 256px bound. PNG/WebP preserve transparency, while
JPEG/BMP use white backgrounds. Run `node placeholder/tests/resize.cjs` for
the isolated resize checks.

## Isolated regression checks

Run with Node.js (no server, database or real designs required):

```powershell
node placeholder/tests/regression.cjs
node placeholder/tests/ui-regression.cjs
```

Run these commands from the workspace root. The checks exercise actual conversion
handlers and synthetic UI state. Companion imports are read-only and require the
shared Toolkit server/session; standalone hosting supports local file conversion.
Imported rasters must be embedded PNG/JPEG/WebP data, canvas dimensions must be
integers in 1..8000, and ImageVendor layer IDs must be unique. Unsupported legacy
sources are reported rather than silently omitted. Files and output URLs live
only in memory: download results before closing or reloading the page.

Known conversion limits: browser codec support varies; MP3 export uses at most
the first two audio channels; text PDFs use the built-in Helvetica font and do
not support all Unicode glyphs. XML export wraps arrays in item elements and
rejects keys that are invalid XML names. CSV JSON export rejects duplicate
headers and excess fields to avoid silently discarding data. Large media can
still exhaust browser memory or block the main thread.
