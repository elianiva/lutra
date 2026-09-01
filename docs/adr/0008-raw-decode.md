# RAW decode

**Status**: decided (`packages/raw-decoder` does not exist yet).

RAW files (CR2/CR3, NEF, ARW, RW2, ORF, RAF, DNG) decode client-side at full resolution via an **owned LibRaw wasm build** in `packages/raw-decoder` — our fork of LibRaw-Wasm (C++ wrapper + Emscripten build script + committed dist + TypeScript client), rebuilt via `bun run build:raw`. Owning the build buys progress callbacks, LibRaw version freedom, and flag control; the cost is maintaining the wrapper and version bumps.

- **Decode lands as an sRGB-encoded 16-bit source texture** (rgba16unorm; RGB→RGBA padded in-worker): the engine changes nothing, since pass 0's linearize step inverts exactly this curve. A linear working space is a documented future option — not worth touching four engine sites for near-zero visible difference in an sRGB-authored app.
- The full pipeline runs on CPU via LibRaw (`imageData()`): unpack, levels, as-shot white balance, camera matrix, AHD demosaic, sRGB encode — in a dedicated worker with stage-based progress and an embedded-JPEG placeholder during decode.
- Decode settings are deliberate: as-shot WB (the White balance layer adjusts relative to it — its range cannot fix a neutral decode under tungsten), camera matrix always applied, **AHD demosaic** (the licensing ceiling — AMaZE/DCB/DHT are GPL2 and would drag the app's posture along), highlight blend, no auto-brightness (don't fight the Exposure layer), EXIF orientation ignored.
- Routing sniffs RAW (TIFF magic + extension set) → wasm path, else `createImageBitmap`; a raw decode failure retries the browser decode once before surfacing a tagged error.
- Gallery/loading placeholders use the **embedded JPEG** (instant); LUT-bar thumbnails use a decode-derived preview instead — embedded JPEGs carry the camera tone curve and would mismatch how the editor renders.
- Licensing: LGPL-2.1/CDDL LibRaw, ISC wrapper, MIT LCMS; attribution ships with the dist. ProRAW / linear DNGs get zero special investment (core LibRaw decodes them or they fail with a readable error).
- The Rust demosaic stack (rawler; RawSpeed's official Rust port) remains the watch-item alternative — the service seam and settings schema don't block it.
