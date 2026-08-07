# Per-photo LUT thumbnails: CPU-rendered filmstrip previews

The LUT bar's filmstrip shows **the user's photo with each LUT applied**, instead of the vendored generic 500×500 previews. Previews generate **lazily per catalog category** — on tab select and on bar-open — and render through a **pure-JS CPU sampler in a dedicated worker**, not the WebGPU pipeline.

## Why

The vendored thumbnails (docs/adr/0004) are one generic photo graded with each LUT. The bar's whole job is "see it on _your_ photo" (docs/adr/0012) — a generic photo cannot do that. Every serious color tool converges on per-photo previews, and the render machinery already exists: the engine's LUT pass is a single compute pass with **no colorspace boundary** (sRGB source in, sRGB display out — the round-trip is skipped at both ends), whose body is pure trilinear cube sampling + strength mix. That body is ~20 lines of deterministic per-pixel math — trivially portable to JS.

The question was _where_ to render 296 previews. Options were the main-thread GPU backend (a new offscreen path sharing the interactive render queue), a WebGPU worker (duplicating ~600 lines of session/pipeline/readback machinery for a browser-support gamble — worker WebGPU is Chromium-only in practice), or a CPU sampler in a worker. The CPU path won on all axes: exact match for a LUT-only chain, no GPU dependency, no contention with slider-drag renders, and the existing encode-worker pattern (`worker.ts` + Deferred + pending map) was a proven template. The JPEG step reuses the engine's `encodeImage` (docs/adr/0006), so no new codec knowledge lands in the frontend.

Bandwidth shaped the trigger. Prefetching all 296 cubes (~38MB) at image load — the original plan — spends the user's bandwidth on LUTs they may never browse. Lazy per-group generation fetches only what the user looks at (~30–68 cubes ≈ 4–8MB per category), and the engine's cube fetch is memoized per session, so a revisit costs nothing.

## Decisions

### D1 — Lazy generation per visible group, not at import

The filmstrip's visible entries (the active tab's group, or the resolved Recents list) are generated on tab select (`SelectedLutTab`), on the LUT-draft auto-open, and on chevron-open — one `GenerateLutThumb` command per missing LUT. `visibleEntries`/`effectiveTab` in `lut-bar/catalog.ts` are shared by the bar's render and the trigger, so generation and display always agree on what is visible. A failed LUT stays missing and is retried on the next visit of its group — never retried automatically.

### D2 — The CPU sampler lives in the engine, and it is a 1:1 translation of the WGSL body

`applyLutCpu` (`@lutra/engine/src/luts/apply.ts`) mirrors `shaders/bodies/lut.ts` exactly: the same texel-space mapping (`p = c·(SIZE−1)`, floor/frac, `x1 = min(x0+1, SIZE−1)`), the same 8-corner trilinear mix, the same strength mix. Exact for a LUT-only chain because the colorspace boundary is a no-op there. Alpha passes through untouched, and the clamped-array write applies the same 8-bit rounding as the `rgba8unorm` store. Previews are presentation-only, so the hover preview through the real GPU path remains authoritative; the sampler is the poster, not the contract.

One subtlety bit us in review and is worth stating: the vendored G'MIC cubes vary **red fastest** (file point index `(b·size + g)·size + r`), the opposite of the common `.cube` documentation — verified against the upstream data (point 1 is the red-axis step) and against the GPU path's texture upload, which maps the file's axes onto the texture's X/Y/Z 1:1. The sampler indexes the file order directly, and a dedicated engine test locks the axis order (pure red input must come out red); the sampler was cross-checked against a JS reimplementation of the GPU lookup over 500 random colors with zero mismatches.

### D3 — A pool of stateless thumb workers; the main thread downscales once per photo

`thumbs/worker.ts` follows the encode-worker pattern: a stateless module worker, per-request `{ id, image, cube }` posts with transferred replies, `Effect.runFork` event routing. `worker-layer.ts` deviates from the encode-worker mirror in one deliberate way: the strip is a 30–68-request batch, and each request is a synchronous sample plus a wasm JPEG encode, so one worker would serialize the whole group. The layer instead keeps a pool of `min(4, hardwareConcurrency)` workers and round-robins requests across them; the pending map records each request's owning worker, so a crash fails only its own requests and that worker is respawned at full pool size (the pre-pool code would hang every later request on a dead worker). The main thread downscales the photo once per photo (a 200×200 center cover-crop, matching the bar's square `object-cover` presentation — 200px because the thumbs render at 96px CSS and 100px would be soft on 2× displays), cached by bitmap identity in the layer; the shared 160KB `ImageData` is structured-cloned with each request (one buffer serves the whole pool, so it cannot be transferred). The worker applies the LUT at full strength and encodes JPEG q85.

Per-LUT requests (rather than a batch) give progressive fill-in: each thumb swaps in the moment it lands.

### D4 — The worker-layer dedupes by (lutId, photo); update guards staleness by photo identity

The service keeps an in-flight `Map<lutId, ImageBitmap>`: a duplicate request for the same lutId + photo (a tab switch-away-and-back mid-generation) is skipped; the same lutId on a _new_ photo proceeds (the stale batch's results are dropped by update, never by the worker). `LutThumbGenerated` carries the photo's `ImageBitmap`; update revokes and drops any result whose bitmap is no longer `model.source.bitmap` — the same staleness discipline as `RenderedFrame`'s revision stamp, keyed by identity instead of a counter so slider-drag renders never invalidate a batch.

### D5 — The vendored generic jpg is the placeholder and the failure fallback

While a group generates (~100–300ms) and for every failure (cube fetch, downscale, worker, encode), the thumb keeps `/luts/${entry.thumbnail}`. The model holds only _ready_ thumbs (`lutThumbs: Record<lutId, blobUrl>`); "pending" and "failed" are both "not in the record", so no status enum exists. `LutThumbFailed` is observability only. No error UI: a preview is never worth one.

### D6 — Blob URLs are model state with an explicit revoke command

`lutThumbs` is presentation-only model state (docs/adr/0011/0012 spirit). When a new image loads (`ImageDecoded`, `EditLoaded`, `ClearedImage`), update clears the record and dispatches `RevokeLutThumbs({ urls })`, mirroring the export dialog's URL hygiene. A stale result that lands after an image switch is revoked inline in the `LutThumbGenerated` handler.

## Consequences

- The bar shows the user's photo under every LUT they actually browse; unvisited categories cost zero bandwidth.
- A second implementation of the LUT body exists (CPU vs WGSL). Drift risk is bounded: the body is deterministic per-pixel math, the translation is 1:1 and tested against hand-computed values, and previews are presentation-only — the hover preview (GPU) stays authoritative.
- Group generation costs ~100–300ms of wall time spread across the pool (a single worker would serialize the same work to N× longer) plus 4–8MB of fetches on first visit; the workers never touch the GPU queue, so slider-drag renders are unaffected.
- If CPU throughput ever feels slow, the seam is contained: swap the worker's `applyLutCpu` call for a GPU offscreen render — the message/command/model surface is unchanged.
