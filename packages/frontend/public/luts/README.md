# Vendored LUT library

This directory is a vendored copy of the G'MIC film-emulation LUT collection
from https://github.com/YahiaAngelo/Film-Luts at commit
`af957b631a304e6be94778b96cb3395de3438e9f`, placed here by `scripts/vendor-luts.ts`.

- `film_luts.json` — the catalog (name, category, lut_file, thumbnail)
- `luts/` — 296 `.cube` LUTs (13³), the runtime format
- `thumbnails/` — picker previews
- `LICENSE` — the upstream MIT license (preserved per its terms)
- `NOTICE` — attribution and provenance

Refresh: bump the pinned commit in `scripts/vendor-luts.ts` and run
`bun scripts/vendor-luts.ts`, then commit the result.
