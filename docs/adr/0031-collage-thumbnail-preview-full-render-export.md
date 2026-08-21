# Collage rendering: thumbnail previews, full-chain render at export

The collage screen previews tiles from each referenced Edit's stored **thumbnail**. Only **Export** renders pixels: every referenced Edit's full chain is re-run at cell resolution through a temporary GPU session on an offscreen canvas, the resulting `ImageData` frames are composited onto a 2D canvas grid, and the composite encodes through the existing engine encoder.

## Why

Previews must be instant and free: thumbnails are already persisted per Edit and cached as object URLs by the main menu, so the grid costs nothing and cannot drift from what the menu shows. Re-rendering for preview would mean decoding N multi-MB sources and running N GPU chains on every layout tweak. At export, quality matters and export never upscales (docs/adr/0005) — so we re-render rather than enlarge small thumbnails. Each Edit flows through `createRenderRequest` + `GpuBackend.snapshot` exactly like the editor's export path, just bound to an offscreen canvas instead of the editor's `CanvasRef`, which resolves exactly one element. The composite itself is plain 2D-canvas drawing plus the engine `ImageEncoder` (docs/adr/0006): no new shaders, no new GPU machinery beyond the borrowed session.

### Decisions

- Cells compose at **1024px square** before the export scale preset; scale means a fraction of the composed size, downscale-only (docs/adr/0005).
- Filename `lutra-collage.<format>`; export dialog settings reuse the editor's `ExportSettings` schema and KeyValueStore persistence.
- The export dialog's presentational settings sections are **extracted into a shared module** consumed by both the editor dialog and a thin collage-local dialog built on the same `@foldkit/ui` `Dialog.Model` pattern — one convention, editor behavior unchanged.

### Consequences

- A saved collage's export always reflects the referenced Edits' *current* chains — regrade an Edit and the next collage export picks it up, while the stored record (ids + layout) never goes stale.
- Export is O(N · chain) GPU work done serially at press time; acceptable for contact-sheet sizes and invisible outside the explicit export action.
