# RAW decode

**Status**: implemented (`packages/frontend/src/lib/decode-image.ts`).

RAW files (CR2/CR3, NEF, ARW, RW2, ORF, RAF, DNG, and about 30 more) decode client-side at full resolution with [FlashRaw](https://flashraw.ybouane.com), a Rust decoder compiled to WebAssembly and installed from npm (`flashraw`). There is no owned build, no native toolchain and no committed binary: the npm package ships the wasm.

- **Decode lands as an 8-bit sRGB `ImageBitmap`** (`output: 'rgba8'`, `colorSpace: 'srgb'`): the editor's source is an `ImageBitmap` for every format, so the engine changes nothing and pass 0's linearize step inverts exactly this curve. A 16-bit source (`rgb16`) or a linear working space (`linear-rgb16`) is a future option that needs a new source-texture path.
- FlashRaw runs unpack, black/white normalization, as-shot white balance, demosaic, camera matrix and sRGB encode in one pass. It runs in a Web Worker (`flashraw/worker`, pool of one) so the editor stays responsive. It is multithreaded when the page is cross-origin isolated and single-threaded otherwise.
- Decode settings are deliberate: as-shot WB (the White balance layer adjusts relative to it — its range cannot fix a neutral decode under tungsten), full-size output (the `half-size` demosaic is a future quality tier), no exposure, black-point or white-point adjustment (don't fight the Exposure layer). The demosaic is bilinear; FlashRaw offers no other algorithm.
- Routing: one `decodeImage(blob)` function. A picked file with a RAW extension tries FlashRaw first; any other blob (a saved Edit's source has no name) tries `createImageBitmap` first and falls back to FlashRaw. The browser decoder's error is the one surfaced.
- Gallery/loading placeholders use the **embedded JPEG** (`raw.preview()`, instant); LUT-bar thumbnails use a decode-derived preview instead — embedded JPEGs carry the camera tone curve and would mismatch how the editor renders.
- Licensing: FlashRaw is MIT OR Apache-2.0. No copyleft component ships with the app.
- Nikon High Efficiency NEF (TicoRAW) is not decodable by any open decoder. It fails with `UnsupportedCompression` and takes the error path above.
- FlashRaw can also return the undemosaiced, normalized CFA (`output: 'normalized'`) and has a WebGPU backend, so a GPU demosaic stays possible without changing the service seam.
