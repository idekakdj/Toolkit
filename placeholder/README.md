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
