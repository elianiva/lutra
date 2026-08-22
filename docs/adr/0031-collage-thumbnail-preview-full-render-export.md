# Collage rendering: thumbnail previews, full-chain render at export

The collage screen previews tiles from each referenced Edit's stored **thumbnail**. Only **Export** renders pixels: every referenced Edit's full chain is re-run at cell resolution through a temporary GPU session on an offscreen canvas, the resulting `ImageData` frames are composited onto a 2D canvas grid, and the composite encodes through the existing engine encoder.

## Why

Previews must be instant and free: thumbnails are already persisted per Edit and cached as object URLs by the main menu, so the grid costs nothing and cannot drift from what the menu shows. Re-rendering for preview would mean decoding N multi-MB sources and running N GPU chains on every layout tweak. At export, quality matters and export never upscales (docs/adr/0005) — so we re-render rather than enlarge small thumbnails. Each Edit flows through `createRenderRequest` + `GpuBackend.snapshot` exactly like the editor's export path, just bound to an offscreen canvas instead of the editor's `CanvasRef`, which resolves exactly one element. The composite itself is plain 2D-canvas drawing plus the engine `ImageEncoder` (docs/adr/0006): no new shaders, no new GPU machinery beyond the borrowed session.

### Decisions

- Cells compose at **1024px square** before the export scale preset; scale means a fraction of the composed size, downscale-only (docs/adr/0005).
- Filename `lutra-collage.<format>`; export dialog settings reuse the editor's `ExportSettings` schema and KeyValueStore persistence.
- The whole export dialog is **one shared TEA submodel** (`src/export-dialog/`), consumed by both the editor and the collage. What began as sharing only the presentational sections grew into a full machine extraction when the two screen-local dialogs kept duplicating state and behavior: the `Dialog.Model` submodel wiring, settings persistence (load on open, save per change), the encode → download → revoke lifecycle, close-time cleanup, error surfacing, and the frame slot all now live in one place. Each owning screen keeps only its snapshot command (`SnapshotForExport` / `SnapshotCollageExport`) plus a thin delegation arm that wraps machine messages at its own boundary (`GotExportDialogMessage`). The machine's commands are schema-carried data (`PrepareExport`, `ExportDownload`, `RevokeExportUrl`, `Load/SaveExportSettings`) — no functions or pixels in command args.
- The composed frame **bypasses the TEA model**: a full-resolution `ImageData` is megabytes of pixels, and routing it through Messages/Model makes every model log, diff, or devtools snapshot enumerate millions of array cells (observed as a hard crash with the devtools mounted). The owning model holds no pixels; a module-level **one-slot frame cache owned by the shared machine** (`export-dialog/frame.ts`, the same seam as `thumbnail-url.ts`) holds the pixels for the dialog's lifetime. The owner's snapshot command writes the slot before reporting success (`FrameReady`); every dialog open re-snapshots, so a single shared slot is safe despite two consumers, and close cleanup drops it.
- Late-result races are guarded inside the machine: a `FrameReady` landing after close is dropped along with its pixels; an encode completing after close revokes its blob URL instead of downloading.

### Consequences

- A saved collage's export always reflects the referenced Edits' *current* chains — regrade an Edit and the next collage export picks it up, while the stored record (ids + layout) never goes stale.
- Export is O(N · chain) GPU work done serially at press time; acceptable for contact-sheet sizes and invisible outside the explicit export action.
- A third exporting surface is now additive: define a snapshot command that fills the shared frame slot, embed `ExportDialog.Model` in the screen model, and delegate — no dialog plumbing to re-derive.
- Tile rendering borrows the GPU session through `Effect.scoped` + `acquireRelease`, so decoded sources, squared bitmaps, and the offscreen canvas are closed on success and failure alike; tile composition assumes every tile arrives cell-sized (failed tiles are skipped up front, not cropped mid-compose).
- The Edit and Collage IndexedDB backends share their scaffolding (`store-support.ts`: typed table CRUD, the rejecting fallback store, and the fused Layer that degrades when the database cannot open); adding another object store means defining its table + contract and assembling from the shared pieces.
