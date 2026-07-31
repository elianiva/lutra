# Image encoding is a swappable engine service (jSquash wasm codecs)

The export pipeline encodes through an `ImageEncoder` Effect service defined in `@lutra/engine`, with a jSquash-backed implementation: `@jsquash/*` (the maintained continuation of Squoosh's codecs) lazy-loaded per format inside a dedicated Web Worker owned by the frontend. The browser's native `canvas.toBlob` was rejected even though it covers PNG/JPEG/WebP for free: it has no AVIF encoder at all, its quality curves differ per browser, and it cannot run off the main thread — a 12MP AVIF encode takes seconds. The wasm codecs are the same binaries in every browser, they run in the worker, and swapping the backend later (native encoders, a server, another codec family) is a one-Layer change behind the service seam.

**Status**: accepted

**Considered Options**:

- **Native `canvas.toBlob` for everything** — zero dependencies, but no AVIF, per-browser quality drift, main-thread encode, and a second pipeline when AVIF inevitably lands.
- **Hybrid (native for PNG/JPEG/WebP, wasm only for AVIF)** — fewer wasm downloads, but two pipelines with inconsistent quality semantics and no single seam to swap.
- **`@squoosh/lib` directly** — archived January 2023 and unmaintained; jSquash is the maintained fork of the same codecs.

**Consequences**:

- The engine's public API grows a `Context.Service` (`ImageEncoder`) — its first service — plus the `ExportSettings`/`ExportFormat` schemas that cross the message boundary.
- `@jsquash/*` wasm files are bundled as assets by the frontend's vite build; each codec loads only when its format is first used (dynamic import).
- The service contract is `encode({ image: ImageData, settings }) → Uint8Array` — platform-neutral bytes, no DOM types, so the same layer can run in a worker, on the main thread, or in node tests.
- Encoding happens on settings change (debounced) so the dialog can show the estimated file size — the size preview is a foreground feature, not an afterthought.
