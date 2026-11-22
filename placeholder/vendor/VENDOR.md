# Vendored third-party files

These files were previously loaded from public CDNs. They are served from this origin so a CDN
compromise or outage cannot affect the converter, no visitor data is sent to a third party, and
the Content-Security-Policy can allow `script-src 'self'` only.

**Updating:** download the new pinned version, review its release notes and advisories, replace the
file, update the version and SHA-256 below, run `npm test`, and commit. Never point a page back at a CDN.

| File | Library | Version | License | SHA-256 | Original source |
|---|---|---|---|---|---|
| jspdf.umd.min.js | jsPDF | 2.5.1 | MIT | `98ccf17aa10c20bb1301762618fcc9b6ab3a4e7f26b6071d64d0b41154df3875` | https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js |
| js-yaml.min.js | js-yaml | 4.1.0 | MIT | `45dc3dd03dc07a06705a2c2989b8c7f709013f04bd5386e3279d4e447f07ebd7` | https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js |
| marked.min.js | marked | 9.1.6 | MIT | `6002af63485b043fa60ddaba1b34363b98d2a8b2c63b607004f3a2405a8a053a` | https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js |
| turndown.min.js | Turndown | 7.1.2 | MIT | `7686ddaa8b32676870dc13b6635a90e98a5c85bb711063e2b5037d7fc592fae5` | https://cdnjs.cloudflare.com/ajax/libs/turndown/7.1.2/turndown.min.js |
| xlsx.full.min.js | SheetJS (xlsx) | 0.18.5 | Apache-2.0 | `c9506197caf809a075b6dee1da0d36fb19da7158ffe8a88e7b0c96c5d8623c99` | https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js |
| lame.min.js | lamejs | 1.2.1 | LGPL-3.0 | `15d285e2587b3bdbfd18a68de6ce07cc074f7480a82c3815da2dc1c348ec6df4` | https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js |
| fflate.umd.js | fflate | 0.8.2 | MIT | `c3b34f2e9f5e74d4d7d64e01cac7a0c01954c6c406414d42185c7b53d6875ddf` | https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js |

## Fonts

Inter and Space Grotesk, SIL Open Font License 1.1, latin and latin-ext subsets (variable fonts),
downloaded from the Google Fonts API and stored in `fonts/` with the generated `fonts/fonts.css`.

| File | SHA-256 |
|---|---|
| inter-latin-ext.woff2 | `34b9c504cab7a73e37b746343a449132e56cf7b5481af2cb81dc74dcff25c956` |
| inter-latin.woff2 | `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62` |
| space-grotesk-latin-ext.woff2 | `952dddb45d2f96f71cbf3b7f510b24379afc3c89ea02fcf89d377b45d62c0166` |
| space-grotesk-latin.woff2 | `0640890476fc1198ab4de571fb658de443c4d85b66466ec09534a8737ab1ce9d` |
