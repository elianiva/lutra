# Image picker resamples to a 960px / JPEG 80% preview; export transcodes the source to JPEG and renders the chain at full resolution

Two ends of the **edit chain**'s I/O are different operations that needed different source files.

## Preview (post-pick)

The picker hands us the source at its native resolution — often 12-50 MP. The editor's pipeline reads every pixel of the image on every frame (each active **adjustment layer** adds a fullscreen pass), so a 24 MP source on a 9-layer chain is ~216 M pixels of fragment work per slider tick. Decoupling the preview from the source size keeps the editor smooth regardless of the original.

**`resampleForPreview(uri, w, h)`** is called from the picker callback, before the editor mounts. It uses `expo-image-manipulator` to scale the longer edge to `PREVIEW_MAX_DIM = 960` (preserving aspect ratio, never upscaling) and re-encode as JPEG at `PREVIEW_JPEG_QUALITY = 0.8`. The result lands in the app cache; the editor's `useImage` reads from that cache file, not the original.

The picker is invoked with **no `allowsEditing` / `aspect`** — the crop step the picker offers is rejected because it would discard the original framing. The picked asset's `uri` is also stashed (as `originalUri` in the image store) for export.

The store therefore holds both URIs:

```ts
{ originalUri: string | null;  // full-res source, for export
  previewUri:  string | null;  // 960px / 80%, for editor }
```

## Export (post-edit)

The export pipeline needs the full-resolution source so the saved JPEG preserves the photographer's pixels. The preview is too small for that. The pipeline has to be able to start from any format the picker hands back — iOS in particular returns HEIC by default, and Skia's built-in codec does not speak HEIC.

**`exportImage(originalUri, layers, svMap, onProgress)`** is called from the Export panel when the user taps "Save to Photos":

1. **`loading_source`** — Run the original URI through `expo-image-manipulator` with no resize and `compress: 1, format: JPEG`. The platform-native decoder (AVFoundation on iOS, BitmapFactory on Android) decodes HEIC/PNG/DNG/JPEG into pixels and re-encodes as a lossless-quality JPEG into the app cache. This guarantees a format Skia can consume, and avoids loading the multi-megapixel file as a JS `Uint8Array`. The ImageRef's `width` / `height` are the source's native dimensions.
2. **`rendering`** — `loadData(jpegUri, d => Skia.Image.MakeImageFromEncoded(d))` hands the transcoded JPEG to Skia. The same `LayerFilter[]` chain the editor uses is built (registry-driven, so the export pipeline and the preview pipeline apply the same per-layer `RuntimeShader`s in the same order). `drawAsImage(<Image><filters/></Image>, { width, height })` from `@shopify/react-native-skia` runs an offscreen, GPU-backed render at the source's native resolution. No visible `<Canvas>`.
3. **`encoding`** — `encodeToBytes(JPEG, EXPORT_JPEG_QUALITY=100)`. Fixed at 100% for v1.
4. **`saving`** — Write the bytes to `Paths.cache`, then `MediaLibrary.Asset.create(filePath)` to hand the file off to the system gallery.

`onProgress(phase)` reports the active phase; the panel renders a single spinner whose label updates as the phase changes.

The **original URI is never displayed in the editor** — only the preview URI is. The Export panel does not call `useImage(originalUri)` to load the image into memory up front (that would decode the full-res source for every Export-tab visit, even if the user never taps the button). The full decode + transcode + render only runs when the user actually presses "Save to Photos".

## Deliberate v1 simplifications

- **One quality, one format, one resolution.** No quality slider, no PNG option, no scale picker. The save button is one tap. Any of those are easy to add later as a second panel content; the underlying pipeline doesn't change.
- **A single transcode pass at export time, not at import time.** The picker already does a HEIC→JPEG re-encode on the way in (via `quality: 1` on the picker), but only for the preview URI. The original URI is left untouched so the export gets the full-resolution pixels. The export then re-transcodes the original through `ImageManipulator` for format normalization. Two transcodes, both lossless, both fast relative to the HEIC decode.
- **No batch / multi-export.** One image picked, one export. A "save preset" or batch flow would be a different feature.
- **Progress is a label, not a percentage.** `drawAsImage` and `ImageManipulator.renderAsync` don't expose intermediate progress. The UI shows "Preparing full resolution…" / "Rendering full resolution…" / "Encoding JPEG…" / "Saving to Photos…" as a coarse status. Real progress would need a worker-thread render and a piped encoder — out of scope for v1.
- **Cache file is not cleaned up after `Asset.create`.** The system reclaims the cache on its own schedule. If the cache grows, the next move is to track the latest export's filename and `file.delete()` on success.
- **The export pipeline is not parallelized.** The transcode, render, encode, and save are run sequentially. The transcode is CPU-bound (native decoder), the render is GPU-bound (Skia), the encode is CPU-bound (Skia encoder), the save is I/O-bound. They could overlap with a worker pool, but the gain is small for single-image exports and the complexity isn't justified for v1.

_See also: [0001](./0001-pipeline-of-nested-runtime-shaders.md) — the export reuses the editor's `LayerFilter` chain, so the per-layer `RuntimeShader` tree is the same shape in both pipelines._
