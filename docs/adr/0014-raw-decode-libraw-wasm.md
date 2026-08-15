# RAW decode: owned LibRaw wasm build feeding an sRGB-16 source texture

RAW files (CR2/CR3, NEF, ARW, RW2, ORF, RAF, DNG) decode client-side at full
resolution in a dedicated wasm worker and land in the engine's existing
pipeline as an **sRGB-encoded 16-bit source texture** — the engine changes
nothing. The decoder is our own build of LibRaw 0.22.1 (a fork of
ybouane's LibRaw-Wasm), not a third-party npm binary.

**Status**: decided (2026-02-19 grilling session); not yet implemented.

## Why

Chromium has no RAW decode, so opening camera RAW files required bringing a
decoder to the browser. The candidates: **libraw-wasm** (C++, battle-tested,
broadest camera coverage), **our own GPU demosaic** (PhotonCamera's RCD port
exists as reference but is Bayer-only — Fuji X-Trans rules out "all cameras"),
and the **emerging Rust stack** (rawler + `demosaic` crates — clean licensing
but ~300+ cameras, unproven demosaic quality, and the color pipeline would be
ours to write). LibRaw won on coverage and proven quality; Rust stays a watch
item (RawSpeed's official Rust port is the trigger to revisit).

The engine assumes an sRGB-encoded source (pass 0 linearizes; LUTs read sRGB
at position 0). Decoding RAW with the sRGB curve makes the source a drop-in —
a linear working space would touch four engine sites for near-zero visible
difference in an sRGB-authored, 8-bit-export app.

## Decisions

### D1 — CPU decode via LibRaw's `imageData()`, not a GPU demosaic

LibRaw does the whole pipeline on the CPU — unpack, black/white levels,
as-shot WB, AHD demosaic, camera matrix, sRGB encode — at full resolution in
a worker. The service also exposes `rawImageData()` (undebayered mosaic) and
the color metadata (`cam_xyz`, `cam_mul`, `dng_color`), so a GPU demosaic
remains a contained future path: a service-output change plus one WGSL pass,
with zero change to the chain, compare, or UI surface.

### D2 — Decode to sRGB-encoded 16-bit; the engine changes nothing

`outputBps: 16`, `outputColor: 1` (sRGB), `gamm: [1/2.4, 12.92]` — pass 0's
`srgbToLinear` inverts exactly this curve, so the source texture is just
higher precision than today's 8-bit JPEG/PNG. Padded RGB→RGBA in the worker
(WebGPU has no RGB16UNorm) and uploaded via `writeTexture` as rgba16unorm
(filterable; no shader change). A linear working space (`sourceIsLinear`
through pass 0, LUT-at-0, passthrough/compare) is a documented future option,
not v1.

### D3 — We own the build: fork LibRaw-Wasm into `packages/raw-decoder/`

C++ wrapper + Emscripten build script (LibRaw 0.22.1, LCMS 2.19.1, libjpeg
JPEG8, zlib; OpenMP + SIMD128; `INITIAL_MEMORY=256 MB` + growth) + committed
dist (~1.4 MB wasm) + TypeScript client (`open`/`metadata`/`imageData`/
`rawImageData`/`thumbnailData`/`onProgress`/`dispose`). Rebuild via
`bun run build:raw`; the dist is committed, so devs without emsdk never
rebuild. Bought: the progress callback (D5), LibRaw version freedom, build-flag
control, no third-party wasm trust. Cost: we maintain the wrapper and version
bumps. (The house jSquash pattern — npm dep wrapped by the engine — was
deliberately not followed: full flexibility was the requirement.)

### D4 — Decode settings: as-shot WB, camera matrix always, AHD, highlight blend

`useCameraWb: true` — the **White balance** layer adjusts relative to as-shot
(its ±30% R/B range cannot fix a neutral decode under tungsten, where as-shot
multipliers reach R×2.5); `useCameraMatrix: 3` (always); `userQual: 3` (AHD —
the ceiling of the LGPL build); `highlight: 2` (blend — trades clipping purity
for no magenta/cyan casts); `noAutoBright: true` (predictable normalization;
no histogram brightening fighting the Exposure layer); `userFlip: -1` (EXIF
orientation); `halfSize: false` (full-res always; tiering deferred behind the
existing flag if phone performance ever hurts).

### D5 — Licensing posture: LGPL-2.1/CDDL LibRaw, no GPL2 demosaic pack

AHD is the deliberate quality ceiling — AMaZE/DCB/DHT are GPL2 and would drag
the app's licensing posture along. Attribution + license texts ship with the
dist. The wrapper stays ISC; LCMS is MIT. (The GPL question is also why Rust
is the interesting long-term alternative, D6.)

### D6 — Preview path: embedded JPEG first, decode-derived for LUT thumbs

Gallery tiles and the editor's Loading placeholder use the embedded JPEG
(`thumbnailData()`) — instant, zero decode. **LUT preview thumbnails** use a
~1024 px sRGB8 preview derived from the full decode inside the decode worker
(convert + downscale via OffscreenCanvas, transferred once per photo):
embedded JPEGs carry the camera tone curve and would mismatch the
`noAutoBright` decode, and the bar's whole point is "see the LUT on _your_
photo" as the editor renders it. Compare binds the decoded source texture —
unchanged.

## Consequences

- RAW opens at full resolution on every modern browser, including Safari —
  the old WebKit RAW→PNG transcode was a 2023-fixed bug; sniff-first routing
  (TIFF magic + extension → wasm, else `createImageBitmap`) covers legacy
  edge cases as a generic rule, with a one-shot browser retry after a
  `RawDecodeError` (new tag; message failure unions don't widen).
- A 24 MP decode costs ~0.6–1.4 s on desktop (stage-based progress via
  `set_progress_handler`, posted from the worker; embedded-JPEG placeholder
  during the Loading phase). Memory is ~192 MB wasm heap (RGBA16) per photo,
  released on `dispose()`; Edit rows grow to 25–100 MB — IndexedDB handles
  it, and `navigator.storage.persist()` is requested at first save.
- ProRAW / linear DNGs get zero investment: no DNG SDK contingency, no
  special detection. If core LibRaw decodes them (dcraw_emu does), iPhone
  ProRAW works for free — significant because Chromium cannot decode HEIC;
  if not, a readable `RawDecodeError` surfaces.
- Rust (rawler + `demosaic`, and RawSpeed's in-progress official Rust port)
  remains the long-term clean-room alternative; the service seam and settings
  schema do not block it.
