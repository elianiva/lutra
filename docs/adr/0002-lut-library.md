# LUT library

## Source: vendored Film-Luts mirror

The LUT library is a committed copy of the YahiaAngelo/Film-Luts mirror — 296 G'MIC film-emulation `.cube` presets, the catalog JSON, and generic thumbnails — placed under `public/luts/` by a pinned vendor script with attribution to the mirror and G'MIC. `lutId` is the vendored file path, so ids are stable and the fetch URL is literally `/luts/<lutId>`; cubes load on demand from same origin and cache in the browser after first use. Refreshing upstream is a pinned-commit bump in the vendor script plus a re-run.

Runtime fetch from gmic.eu was rejected (no CORS headers; third-party availability coupling); a CORS proxy was rejected (new infra for no user-visible gain); a build-time compact binary format was rejected (a conversion pipeline to maintain for files that load on demand anyway).

## Browsing: the LUT bar

The bar owns browsing; the layer drawer keeps summary + strength slider. The contract:

- Category tabs (`recents | category`; deliberately no "All" — one strip of 296 items is unusable). Recents cap at 12, dedupe-prepend on real picks only, persist via KeyValueStore, and hide while empty.
- **Hover previews, click commits.** Hover sets presentation-only `previewLut` model state applied at render time by composing the chain handed to the renderer — browsing never mutates the committed chain or the phase machine. Same-value guards skip redundant renders; save/export dismisses an active preview before acting, so snapshots can never capture a merely-hovered look.
- The bar auto-opens when a LUT draft is created and auto-closes on confirm/cancel/select; `previewLut` clears at every closing transition so a stale preview can't leak into unrelated renders.

## Per-photo thumbnails

Filmstrip thumbs show **the user's photo with each LUT applied** — a generic stock preview cannot do the bar's job. Generation is lazy per visible category (tab select / bar open), never prefetched wholesale: ~30–68 cubes per category visited instead of ~38MB for all.

- The CPU sampler `applyLutCpu` (@lutra/engine) is a 1:1 mirror of the WGSL LUT body — exact for LUT-only chains, where the colorspace boundary is a no-op. The vendored cubes vary red fastest (opposite of common `.cube` documentation); the axis order is locked by an engine test.
- A pool of stateless thumb workers (min(4, hardwareConcurrency)) round-robins requests, following the encode-worker pattern. Requests dedupe by (lutId, photo); results landing after an image switch are dropped by photo identity; blob URLs are presentation-only model state revoked explicitly on image change.
- The vendored generic thumbnail is the placeholder during generation and the silent failure fallback. Failed thumbs retry on the group's next visit — no error UI; a preview is never worth one.

**Consequences**: a second implementation of the LUT body exists (CPU vs WGSL). Drift risk is bounded — deterministic per-pixel math, translation locked by tests, previews presentation-only with the GPU hover preview authoritative — and thumb generation never competes with interactive renders for the GPU queue.
