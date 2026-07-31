# Vendored Film-Luts mirror as the LUT source

The LUT library is a plain committed copy of the YahiaAngelo/Film-Luts repository — `luts/` (296 film-emulation `.cube` LUTs mirrored from G'MIC's color presets), `thumbnails/`, and `film_luts.json` — placed under `frontend/public/luts/` by a pinned bun vendor script, with attribution to the mirror and to G'MIC. The original plan (recorded in context.md) was to download LUTs at runtime from gmic.eu, but gmic.eu sends no CORS headers so browser `fetch` is blocked; a runtime download would also couple the app to a third party's availability. The mirror is MIT-licensed with a stable catalog and pre-generated thumbnails, and vendoring keeps builds deterministic and offline.

**Status**: accepted

**Considered Options**:

- **Runtime fetch from gmic.eu** — blocked by CORS (no `Access-Control-Allow-Origin`); would require a proxy.
- **CORS proxy (Cloudflare Worker)** — unlocks the full gmic.eu catalog at runtime, but adds new infra, a third-party dependency, and a catalog/thumbnail pipeline of our own.
- **User upload only** — no shipping cost, but the feature's anchor (the gmic library) becomes invisible friction.
- **Build-time conversion to a compact binary** — the script would parse `.cube` and emit a 10× smaller custom format, adding a conversion pipeline to maintain for files that load on demand anyway (~131KB each, fetched only when a LUT is applied).

**Consequences**:

- The repo grows ~47MB (38MB cubes + 8.2MB thumbnails); `lutId` is the vendored file path (`luts/<category>/<name>.cube`), so ids are stable and the fetch URL is literally `/luts/<lutId>`.
- Refreshing upstream is a pinned-commit bump in `scripts/vendor-luts.ts` plus a re-run; the script verifies the catalog resolves before finishing.
- LUTs load on demand from the same origin; the browser caches them after first use.
