# Raw support — research (everything we know before implementing)

Status: **Resolved** — every question below was decided in the 2026-02-19 grilling session; the decisions are recorded in §8 and the architecture rationale is docs/adr/0014. Terms marked with a **bold term** landed in `context.md`'s Language section. No code written yet — docs/adr/0014 owns the architecture; this document is the research reference behind it.

Scope: opening camera RAW files (CR2/CR3, NEF, ARW, RW2, ORF, PEF, SRW, RAF, DNG — including phone DNGs) in the web app, decoded **client-side, full resolution**, and graded through the existing WebGPU chain like any other source image. "Proper" means real demosaicing of the full-res sensor data with as-shot white balance and camera color matrix — not the embedded JPEG preview (which stays as a fast-path placeholder) and not the mobile app's platform transcode (which lands on the embedded thumbnail on Android).

---

## 1. What a RAW file is, and what decoding means

A RAW file stores the sensor's per-pixel readings **before** most image processing. Decoding it to a displayable image is a pipeline, not a single step:

1. **Unpack** — de-compress the sensor data (lossless per-format compression; Canon CR3/C-RAW and lossy DNG are compressed differently; Nikon HE/HE* variants need recent LibRaw).
2. **Black/white level normalization** — subtract per-channel black levels, scale to the white level (metadata, not heuristics).
3. **White balance** — apply the camera's as-shot multipliers (from EXIF) or an estimate (gray-world).
4. **Demosaic** — reconstruct RGB per pixel from the Bayer (or Fuji X-Trans) mosaic. This is the quality-defining step.
5. **Color conversion** — camera color space → XYZ → working RGB, via the DNG camera color matrices (ColorMatrix1/2, ForwardMatrix) or LibRaw's embedded camera profiles.
6. **Orientation, crop, hot-pixel/defective-pixel fix, lens shading** (LibRaw does the pixel fix automatically; lens shading is available but optional).
7. **Tone encode** — map linear light to a displayable curve (sRGB).

Two structural facts matter for Lutra:

- **Bayer vs linear DNG.** Most RAW files are Bayer mosaics (one sample per pixel; demosaic required). Some are **linear DNGs** — already-demosaiced RGB stored in the DNG: **iPhone ProRAW (12 MP) is a linear DNG** (the darktable issue on iPhone 12 Pro shows SubImage `PhotometricInterpretation = Linear Raw`, 3 samples/pixel, tiled); the 48 MP ProRAW variant (iPhone 14 Pro+) is widely reported to be Bayer-mosaic — verify against a real file during implementation. Linear DNGs skip demosaic but need the same color pipeline.
- **Embedded JPEG preview.** Every RAW carries a camera-rendered JPEG preview. It is instant to extract (<50 ms) but is 8-bit, camera-processed, and often small — never a substitute for the full decode.

## 2. The decoder landscape (what we evaluated)

### 2.1 `libraw-wasm` — selected (as the base of our own build)

npm `libraw-wasm` (github ybouane/LibRaw-Wasm, v1.6.0) — LibRaw **0.22.1** compiled with Emscripten 5.0.7, ISC-licensed wrapper around LibRaw (LGPL-2.1 / CDDL-1.0 dual, see §7). We cloned and inspected the source; **we now fork it and own the build** (§8/ADR 0014):

- **Artifact**: 1.4 MB wasm (raw), worker-based, `INITIAL_MEMORY=256 MB` with `ALLOW_MEMORY_GROWTH`, built `-O3 -flto -ffast-math -msimd128` **with `--enable-openmp` + pthreads** — demosaic is SIMD + multithreaded in wasm.
- **API** (all async, serialized per instance, transferables used):
  - `open(bytes, settings)` — parse only (cheap); all dcraw keys available: `useCameraWb`, `useAutoWb`, `useCameraMatrix` (0/1/3), `outputColor` (0=raw … 1=sRGB …), `outputBps` (8/16), `userQual` (0–12 demosaic), `halfSize`, `highlight` (0 clip / 2 blend / …), `noAutoBright`, `gamm` (power, toe-slope), `userFlip`, `cropbox`, `expCorrec`/`expShift`, `fbddNoiserd`, `medPasses`, `badPixels`, `darkFrame`, … (full list in the repo README).
  - `metadata(full?)` — rich color data we need: **`cam_xyz`** (camera→XYZ), **`rgb_cam`**, **`cam_mul`** (as-shot WB), **`pre_mul`**, **`dng_color`** (per-illuminant colormatrix/forwardmatrix/illuminant), **`dng_levels`** (dng_black, dng_whitelevel), **`flip`** (EXIF orientation), **`filters`** (CFA pattern), thumbnail dims/format, lens, makernotes (opt-in).
  - `imageData()` → `{ width, height, colors: 3, bits, data }` — interleaved **RGB `Uint16Array`** when `outputBps: 16` (runs `unpack` + `dcraw_process` + `dcraw_make_mem_image`).
  - `rawImageData()` → `{ raw_width, raw_height, width, height, top_margin, left_margin, data }` — the **undebayered 16-bit mosaic** (+ crop margins), i.e. the GPU-demosaic path is possible.
  - `thumbnailData()` → embedded JPEG bytes (`unpack_thumb` + `dcraw_make_mem_thumb`) — the fast preview path.
  - `dispose()` — terminates the worker; must be called on image clear.
- **Build recipe is in-repo and reproducible** (`compileLibraw.sh`): pins LibRaw 0.22.1, LCMS 2.19.1, libjpeg (USE_JPEG8 — required for lossy DNG and Kodak RAW), zlib, png. **Not included**: the GPL2 "demosaic pack" (so the quality ceiling in this build is **AHD**; DCB/DHT/AMaZE/LMMSE etc. are not compiled in and would fall back to AHD anyway) and the Adobe DNG SDK (so linear-DNG handling is whatever core LibRaw 0.22 does — see decision 12). Both can be added to our own recipe, with licensing caveats (§7).
- **Errors**: a failed `imageData()` rejects with the LibRaw error string (e.g. "decoder for this file's compression format may be unavailable") — maps cleanly onto a tagged error.
- **Limitations**: one instance per worker; calls serialized; no progress callback wired in the stock build (LibRaw has `set_progress_handler` — **we wire it in our fork**, decision 5). No memory cap exposure — wasm32 heap is capped at ~2 GB in browsers; a 61 MP decode (Bayer 122 MB + RGB16 366 MB) fits, a 100 MP medium-format file is the practical ceiling.

**Performance** (Konvrt's real-world benchmark of LibRaw 0.22 wasm, 24 MP Sony ARW): ~**0.6 s on M4, 0.9 s on M2 Pro, 1.1 s on Ryzen 7 7840U, 1.4 s on i5-1240P**. For context, native LibRaw post-processing benchmarks ~81–87 Mpix/s on desktop (OpenBenchmarking). Expect AHD to be slower than the benchmark's default; `halfSize: true` halves cost when needed. Decoding must run in a worker (it does — the package is worker-native).

### 2.2 Everything else (and why it lost)

| Option                                               | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`dcraw-wasm`** (nhebling)                          | dcraw compiled to wasm; exposes metadata + embedded JPEG extraction, **no full decode** — insufficient alone.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **UTIF.js** (Photopea's open-source TIFF/DNG parser) | Parses TIFF/DNG/CR2/NEF IFDs and decompresses sensor data, but **does not demosaic** — "RAW processing should not be a part of UTIF.js" (maintainer). Not enough.                                                                                                                                                                                                                                                                                                                                                                                           |
| **rawloader** (Rust)                                 | Extracts Bayer + metadata + camera→XYZ matrix; **no maintained wasm build**, no demosaic. Superseded by **rawler** (see below).                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Rust stack: rawler + `demosaic` crate**            | The 2026 state of "Rust alternative": rawler 0.7.2 parses/unpacks (300+ cameras, CR3, X-Trans, JXL-DNG); the `demosaic` crate adds pure-Rust AHD/PPG/Markesteijn incl. X-Trans. Clean licensing, but camera coverage lags LibRaw, the demosaic is unproven in production, the color pipeline would be ours to write, and wasm-readiness needs a spike. **Watch item, not v1** (decision 6).                                                                                                                                                                 |
| **RawSpeed (darktable)**                             | C++, demosaic-quality reference. Wasm builds were explored (darktable issue #184) but never shipped; an **official Rust port is in progress** (issue #709) — the trigger to revisit Rust.                                                                                                                                                                                                                                                                                                                                                                   |
| **Photopea's own decoder**                           | They implemented TIFF/DNG/NEF/CR2/ARW decode in JS themselves (closed source, UTIF is the open piece). Reference for what's possible; nothing to reuse.                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Safari / WebKit native (ImageIO)**                 | WebKit's `ImageDecoderCG` decodes whatever the OS ImageIO supports — Apple has system-level RAW support for a long camera list on macOS/iOS (iOS 18 / macOS Sequoia lists). The old WebKit RAW→PNG transcode for picked files (WebKit PR #15801) was a **bug, fixed 2023** — modern Safari returns original bytes, so the wasm pipeline covers Apple platforms like any other browser. The remaining caveat (8-bit, OS-controlled, per-OS-version camera lists) applies only to the `createImageBitmap`/ImageDecoder fallback path, never the primary path. |
| **Chrome / Edge / Firefox**                          | No RAW in `ImageDecoder`/`createImageBitmap`/`<img>` at all. Chromium has no raw-image proposal.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Mobile reference (lutra-mobile)**                  | Transcodes RAW→JPEG through the platform (AVFoundation on iOS / BitmapFactory on Android). Android's `BitmapFactory` returns **only the embedded thumbnail** for RAW; Android's `ImageDecoder` (Java and NDK, API 30+) does decode DNG full-res via the DNG SDK. The web app exceeds this.                                                                                                                                                                                                                                                                  |

## 3. The reference implementation we already own: PhotonCamera

`~/Development/repos/PhotonCamera` (the RAW pipeline the mobile survey studied) is the strongest precedent for "proper raw" and matches the web architecture (compute shaders, linear working space):

- **DNG → sensor data**: `processDngNative` (C++ `dng_sdk` + **LibRaw bundled in `app/src/main/cpp/LibRaw`**) parses the file into Bayer + metadata (black/white level, CFA, WB gains, lens shading, matrices). Fallback path: Android `ImageDecoder.decodeBitmap` with `EXTENDED_SRGB`.
- **Demosaic on the GPU**: a 1:1 GLSL port of **darktable's RCD** demosaic (9 SSBOs, black-level subtraction + normalization + WB gains in a "populate" pass, then gradient-estimation passes, 16×16 workgroups) — exactly the shape a WGSL port would take.
- **Color**: `native-lib.cpp` implements the complete DNG color pipeline: ForwardMatrix → (XYZ D50 → target primaries, they pass ProPhoto); else ColorMatrix1/2 × illuminant white point → normalize columns by the camera neutral → invert → **Bradford CAT to D50**; interpolate the two illuminant matrices by reference-illuminant weight; fallbacks: LibRaw `cam_xyz` (treated as XYZ→camera under D65) then LibRaw `ccm`.

This is the same math LibRaw's `dcraw_process` does internally when you ask for an output colorspace. It also tells us the _two viable web architectures_:

- **A. CPU decode (LibRaw `imageData()`)** — LibRaw does everything (unpack, WB, demosaic, matrix, gamma). We just upload RGBA16 to the GPU. **Selected (decision 1).**
- **C. GPU demosaic (LibRaw `rawImageData()` + WGSL)** — we get Bayer + metadata, port the RCD (or start with Malvar-He-Cutler/bilinear) to WGSL, apply `cam_xyz`/`dng_color` ourselves (the native-lib.cpp algorithm ports directly). More work; **X-Trans (Fuji RAF) needs a separate demosaic path** (PhotonCamera's shaders are Bayer-only) — a real blocker for "all cameras". Remains possible behind the seam; revisit only if decode speed becomes the bottleneck.

## 4. What the engine assumes about its source (the key integration fact)

The engine (`chain-source.ts`) is built around an **sRGB-encoded source texture**:

- Pass 0 of any chain reads the source and applies `srgbToLinear` (piecewise IEC 61966-2-1 — `colorspace.ts`) unless the first layer is a LUT, which reads the sRGB source directly (`inputIsSrgb`).
- The empty chain is a passthrough: sRGB source → rgba8unorm display.
- Intermediates are linear rgba16float; only the final pass encodes to sRGB.

Two consequences:

1. **If the RAW decode outputs sRGB-encoded 16-bit** (dcraw `-g 2.4 12.92` curve, i.e. `gamm: [1/2.4, 12.92]`), **nothing in the engine changes** — the texture is just higher precision than today's 8-bit JPEG/PNG. The chain's `srgbToLinear` inverts the exact curve we applied. LUTs (sRGB-authored) behave identically to today. **Selected (decision 2).**
2. **If we wanted a linear working space** (decode `gamm: [1.0, 1.0]`), the engine would need a `sourceIsLinear` flag: pass 0 skips `srgbToLinear`, the LUT-at-position-0 pass encodes linear→sRGB before the body, the empty-chain passthrough and the compare blit need linear→sRGB encodes, and the exposure layer keeps headroom only if the display encode stops clamping at 1.0.

**Analysis**: for a display-oriented, sRGB-centric app (LUTs authored in sRGB, export to 8-bit sRGB, no HDR), (1) and (2) produce nearly identical results — the sRGB curve is invertible and 16-bit quantization is invisible in both directions. (1) wins on zero engine risk and matches the mobile app's mental model (decode → display-ready image, then grade). **Future note**: the linear working space (2) is the documented next step if we ever want tone-mapped highlight rolloff — it needs the `sourceIsLinear` flag at all four engine sites above plus an unclamped display encode.

## 5. Frontend integration surface (what changes where)

Current flow, read from source:

- `DecodeImage` (editor/command.ts): `file.arrayBuffer()` + `createImageBitmap(file)` → `ImageDecoded { bitmap, width, height, source }`. Same shape in `LoadEdit` (decodes the Edit's stored bytes) and `thumbnailBytes` (gallery/command.ts, 320 px JPEG for the Edit tile).
- `SourceImage` (message.ts): `{ bitmap: ImageBitmap|null, width, height, error }` — the bitmap is handed straight to WebGPU.
- GPU session (gpu/backend.ts): `buildSession(canvas, w, h, srcBitmap)` uploads via `copyExternalImageToTexture`, retains the bitmap; the **present blit binds the source texture** for Compare's Toggle/Split/Side-by-side — compare is texture-based, so a RAW source texture works unchanged.
- LUT preview thumbs (`LutThumbnailer.render(lutId, bitmap, cube)`): the source bitmap is downscaled to 200×200 ImageData (canvas 2D), then `applyLutCpu` + jSquash-wasm JPEG in a worker pool. This needs an 8-bit sRGB bitmap.
- `PickImageFile` accepts `['image/*', '.jpg', '.jpeg', '.png', '.webp', '.avif']` — RAW extensions missing.
- Error taxonomy: `Image decode error` (context.md) — "one concept whether the browser API failed or the file is corrupt".

Changes (in implementation order):

1. **Picker** — add RAW extensions (`.dng .cr2 .cr3 .nef .nrw .arw .rw2 .orf .raf .pef .srw .3fr .iiq .erf .mef .mrw .x3f .fff .raw`). `image/*` already covers some via MIME on Safari.
2. **Decode service** — a new Effect Context service (like `GpuBackend` / `EditStore`): `RawDecoder { decode(bytes, settings) → DecodedRaw, preview(bytes) → jpeg, dispose() }` implemented in `packages/raw-decoder/` (the owned LibRaw build — §8/ADR 0014), with a worker implementation wrapping the wasm client. Route: sniff RAW (TIFF magic + extension set) → raw path; else `createImageBitmap` (unchanged). In the raw path, keep a live `LibRaw` instance (module init ~100s of ms; instance reuse matters) and `dispose()` on image clear.
3. **`SourceImage` extension** — decoded RAW arrives as `{ rgba16: Uint16Array, width, height }` (+ an 8-bit sRGB preview bitmap for thumbs/compare placeholders). The GPU session gains a second source path: `writeTexture` into an **rgba16unorm** texture (WebGPU has no RGB16UNorm; pad RGB→RGBA in the worker before transfer — 24 MP ≈ 192 MB, tens of ms). rgba16unorm is filterable, `textureLoad` returns 0..1 f32 — no shader change.
4. **Loading phase** — the editor machine's `Loading` state already exists; full decode lands there (with the embedded JPEG as the placeholder and stage-based progress — decisions 5/8). No new phase needed.
5. **Thumbs + gallery tiles** — the decode worker emits a ~1024 px sRGB8 preview **derived from the full decode** (decision 8); `LutThumbnailer` and `thumbnailBytes` consume that instead of the source bitmap for RAW files (their contracts stay bitmap-based — zero changes to the thumb worker itself). Gallery tile thumbnail for a RAW pick uses `thumbnailData()` (embedded JPEG) — instant; the full decode happens only when the editor opens.
6. **Save/Edit flow** — `source` bytes = the original RAW file, passed through untouched (no change; a 25–100 MB row is fine for IndexedDB, but see decision 10).
7. **Errors** — new tagged `RawDecodeError` (decision 11): wasm decode failure is a distinct defect class from a browser decode failure; the pick flow retries `createImageBitmap` once, then surfaces the same user-visible error stage as `Image decode error` today.

## 6. Decode configuration (decided, v1)

```
open(bytes, {
  useCameraWb: true,        // as-shot WB — the image matches what the camera previewed
  useCameraMatrix: 3,       // always apply the camera color matrix (avoids the
                            // "washed out" complaint; default 1 only applies with -w)
  outputColor: 1,           // sRGB primaries
  outputBps: 16,            // 16-bit — feeds the rgba16unorm source texture
  gamm: [1/2.4, 12.92],     // sRGB piecewise curve — the engine's srgbToLinear
                            // inverts exactly this (see §4)
  userQual: 3,              // AHD — best algorithm in the core build (see §7)
  highlight: 2,             // blend — avoids magenta/cyan clipping casts
  noAutoBright: true,       // no histogram-based brightening; predictable normalization
  userFlip: -1,             // use EXIF orientation (dims swap for 90/270)
  halfSize: false,          // full res; halfSize is the low-end fallback
})
imageData() → pad RGB16 → RGBA16 → transfer to main thread → writeTexture
```

Default WB: **as-shot** — the White Balance layer then adjusts _relative to as-shot_ (its ±30% R/B scaling stays meaningful; it could not fix a neutral decode under tungsten, where as-shot multipliers reach R×2.5). **Future note**: `highlight: 2` (blend) deliberately trades raw clipping behavior for no magenta/cyan casts in blown highlights — standard for a display-first app; revisit if we ever chase pixel purity. `halfSize` tiering is deferred behind the existing flag (decision 7).

## 7. Licensing (must read before vendoring)

- **LibRaw 0.22.1**: LGPL-2.1 **or** CDDL-1.0 (dual, choose one). Distributing the wasm binary means complying — attribution + license text in the distribution. The wrapper (`libraw-wasm`) is ISC.
- The **GPL2 "demosaic pack"** (DCB/DHT/AAHD/AFD/VCD/Mixed/LMMSE/AMaZE) is **not** in this build and must not be added without a GPL compliance decision — that's the quality ceiling (AHD) trade-off. (Photopea sidestepped this entirely with a clean-room decoder; not our path.)
- **Decided: we own the build** — fork `ybouane/LibRaw-Wasm` into `packages/raw-decoder/` (C++ wrapper, Emscripten build script, committed dist, TS client; rebuild via `bun run build:raw`). This keeps the LGPL-2.1/CDDL attribution in our hands, enables the progress callback (decision 5), LibRaw version bumps (C-RAW, Nikon HE*, newest bodies — a rebuild, not a rewrite), and would allow adding the DNG SDK if ever needed (currently not planned — decision 12). **Correction to an earlier draft of this doc**: the repo does **not** vendor jSquash — it's an npm dependency in `@lutra/engine` wrapped by `engine/src/encode/jsquash.ts`. The own-build decision here is deliberate (full flexibility), not house style.

## 8. Resolved decisions (2026-02-19 grilling session)

Every open question was decided in one session; the architecture rationale is docs/adr/0014. **Note** flags future-reference items.

| #   | Question                          | Decision                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Decode architecture (A vs C)      | **A — CPU decode via LibRaw `imageData()`**. GPU demosaic (C) stays possible: the service also exposes `rawImageData()` (undebayered mosaic) + color metadata. X-Trans coverage and ship cost decide it.                                                                                                                             |
| 2   | Output (sRGB vs linear)           | **sRGB-encoded 16-bit source** — zero engine changes (`gamm [1/2.4, 12.92]` is exactly inverted by pass-0 `srgbToLinear`). _Note:_ the linear working space is the future step — `sourceIsLinear` at pass 0, LUT-at-0 encode, passthrough/compare encodes, and an unclamped display encode for exposure headroom.                    |
| 3   | Packaging (Q1)                    | **Own the build** — fork `ybouane/LibRaw-Wasm` → `packages/raw-decoder/`: C++ wrapper + build script + committed dist + TS client + settings schema; `bun run build:raw`. Supersedes the npm option.                                                                                                                                 |
| 4   | Decode settings (Q4)              | §6 block **as-is**: as-shot WB, matrix 3, sRGB, 16-bit, AHD, highlight blend, noAutoBright, EXIF flip, full-res. _Note:_ highlight 2 (blend) trades clipping purity for no magenta/cyan casts; as-shot keeps the White Balance layer's ±30% range meaningful.                                                                        |
| 5   | Progress (research Q4)            | **Owned build ⇒ stage-based progress** — `set_progress_handler` wired in our wrapper, posted from the worker, `onProgress` on the client.                                                                                                                                                                                            |
| 6   | Decoder language                  | **LibRaw now**; Rust is the watch item (`rawler` 0.7 + `demosaic` crate; RawSpeed's official Rust port is the trigger to revisit). _Note:_ Rust would kill the LGPL/GPL questions but means writing the color pipeline ourselves and narrower camera coverage (~300+ vs LibRaw).                                                     |
| 7   | Quality tiers (research Q5)       | **AHD full-res always** for v1. _Note:_ a `halfSize` tier/toggle drops in behind the existing settings flag if phone performance hurts.                                                                                                                                                                                              |
| 8   | Preview strategy                  | Gallery tiles + Loading placeholder: **embedded JPEG** (`thumbnailData()`). LUT thumbs: **1024 px sRGB8 preview derived from the full decode** in the decode worker (embedded JPEGs carry the camera tone curve and would mismatch the noAutoBright decode). Compare unchanged (binds the RGBA16 source texture).                    |
| 9   | Safari (research Q6)              | **Sniff-first routing; no Safari-specific handling.** The WebKit RAW→PNG transcode was a bug (PR #15801), fixed 2023 — modern Safari delivers original bytes, wasm runs on Apple platforms too. "Magic says PNG → normal path" is just the generic routing rule.                                                                     |
| 10  | Storage (research Q7)             | **`navigator.storage.persist()`** fire-and-forget at first save; no store/schema changes. _Note:_ with 25–100 MB rows, storage management graduates from nice-to-have.                                                                                                                                                               |
| 11  | Error taxonomy                    | **New `RawDecodeError`** tag; the pick flow retries `createImageBitmap` once after a raw failure, then surfaces `ImageDecodeError` (raw error rides the cause chain). Message unions don't widen. _Note:_ future work surfaces tag-level detail (e.g. "your camera's format isn't supported yet") for a transparent user experience. |
| 12  | ProRAW / linear DNG (research Q3) | **Zero investment** — no DNG SDK contingency, no special detection; the bring-up spike (sample files) settles it: if core LibRaw decodes linear DNGs it works for free, else a clean `RawDecodeError` with a readable message.                                                                                                       |

## 9. Performance & UX expectations

- Desktop (24 MP): ~1 s decode (AHD likely 1.5–3 s; unpack dominates). Phone: expect several seconds → stage-based progress + embedded-JPEG placeholder are not optional polish.
- Memory: Bayer 24 MP = 48 MB, RGB16 = 144 MB, RGBA16 padded = 192 MB in the worker; texture copy on the GPU is queue-side, one-shot. Disposing the worker on image clear releases the wasm heap (the wasm module stays cached in the browser after first load — reuse the instance).
- The wasm (~1.4 MB, gzipped less) loads once per session; pre-warm it in a hidden worker at app start so the first RAW open isn't the first compile.

## 10. Glossary candidates (context.md Language section)

These terms landed in `context.md` under a new "RAW files" group, plus the `Raw decode error` taxonomy entry:

- **RAW decode** — the full-resolution conversion of a RAW file's sensor data into a displayable image: unpack, black/white normalization, as-shot white balance, demosaic, camera color matrix, sRGB encode. _Avoid_: "import", "convert" (the mobile app's platform transcode is a different, lesser thing).
- **Embedded JPEG preview** — the camera-rendered JPEG inside a RAW file, used as the instant placeholder/gallery tile until the **RAW decode** lands.
- **As-shot white balance** — the camera's recorded WB multipliers, applied at decode; the White Balance layer adjusts relative to it.
- **Bayer / X-Trans** — the sensor mosaic patterns; X-Trans (Fuji) needs dedicated demosaicing, which LibRaw handles on the CPU (and which rules out a GPU-demosaic-only design).

## Evidence trail

Read/verified: `ybouane/LibRaw-Wasm` (cloned: wrapper, worker, build script, d.ts, wasm artifact — LibRaw 0.22.1, Emscripten 5.0.7, OpenMP+SIMD, 1.4 MB); `nhebling/dcraw-wasm`; `photopea/UTIF.js` (+ issue #88); `pedrocr/rawloader`; LibRaw docs (C++ API, datastruct, node/2093 demosaic-Q&A, node/2626 ProRAW, node/2280 output color); WebKit PR #15801 (read in full — the transcode was a 2023-fixed bug); Apple RAW support lists (iOS 18/macOS Sequoia); Android NDK ImageDecoder docs; darktable #7578 (ProRAW structure); LibRaw-Wasm issue trail; Konvrt benchmark (LibRaw 0.22 wasm, 24 MP ARW: 0.6–1.4 s); OpenBenchmarking LibRaw post-processing (~81–87 Mpix/s native); Rust landscape (rawler 0.7.2, `demosaic` crate, RawSpeed issue #709 — official Rust port in progress); PhotonCamera (cloned: RawDemosaic-Processor.kt RCD port, native-lib.cpp DNG color pipeline, CameraRawCalibration-Matrix.kt, bundled LibRaw); lutra-mobile (RAW→JPEG transcode decision, docs/ANALYSIS_SUMMARY.md); this repo's engine `chain-source.ts` / `colorspace.ts`, frontend decode/session/thumb/compare paths.
