# Export

## Post-scale, don't re-render

Export reads back the displayed frame and downscales in the encode worker (Lanczos), capped at 100% — no upscaling, no re-render at target size. Re-rendering the chain at export resolution would scale pixel-space effects (grain cell size, clarity radius) with the output and diverge from the frame the user saw (grain animates per render). Post-scale keeps export honest — "what you see, at this size". If true output-scaled effects ever become a goal, this is the decision to revisit.

## Encoding is a swappable engine service

Encoding goes through an `ImageEncoder` Effect Context.Service defined in @lutra/engine, backed by jSquash wasm codecs lazy-loaded per format inside a frontend-owned Web Worker. The contract is platform-neutral bytes — `encode({ image, settings }) → Uint8Array`, no DOM types — so the same layer runs in a worker, on the main thread, or in node tests. Native `canvas.toBlob` was rejected: no AVIF encoder, per-browser quality drift, main-thread blocking on multi-second encodes. Encoding runs debounced on settings change so the dialog can show the estimated file size.

## The size and codec options are the squoosh API

`ExportSettings` carries one `scale` in `[0.01, 1]` — no upscaling, and a floor that keeps the output pixels sane — plus the resampler and a per-format options struct. The dialog exposes them the way Squoosh's own controls do:

- **Size** — percentage presets (100/75/50/25%) and exact output width × height typed against the composed frame. Both write the same `scale`; uniform scaling is the only mode, so the output always keeps the frame's aspect, and the typed fields cap at 100%.
- **Resample** — the filter family jSquash ships without extra wasm: `lanczos3` (default), `mitchell`, `catrom`, `triangle`.
- **Codec options** — collapsed behind a disclosure per format: MozJPEG progressive / optimize-coding / smoothing, WebP lossless / method effort, AVIF lossless / speed. PNG is lossless and owns none. `quality` is live only while the encode is lossy; `isLossy` follows the lossless toggles, so a lossless WebP or AVIF hides the quality knob.
- Settings persist under the same key with decoding defaults for the new fields, so a record written before this change still decodes (the format choice survives).

A codec knob whose units are ambiguous stays internal rather than mislabeled in the UI — MozJPEG's raw `chroma_subsample` enum, for instance, is not surfaced because its integer-to-subsampling mapping is undocumented and would ship a guess.

## Shared export dialog submodel

The whole export dialog is **one TEA submodel** consumed by every exporting surface: settings persistence, encode → download → revoke lifecycle, close-time cleanup, and error surfacing live in one machine. Adding a surface is additive: define a snapshot command that fills the frame slot, embed `ExportDialog.Model`, delegate with a thin `Got*Message` arm.

- Commands are schema-carried data — never functions or pixels in command args.
- **Composed frames bypass the TEA model**: megabyte `ImageData`s never enter Messages or Model (every model log, diff, or devtools snapshot would enumerate millions of cells — observed as a hard crash). A module-level one-slot frame cache owned by the machine holds pixels for the dialog's lifetime; owners snapshot before reporting success, and every dialog open re-snapshots.
- Late-result races are guarded inside the machine: frames landing after close drop with their pixels; encodes completing after close revoke their blob URL instead of downloading.
