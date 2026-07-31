# Lutra

A color-grading app for film simulation. Adjustments are non-destructive, ordered, and intentionally limited in scope. Web-first, client-side only — all image processing runs locally via WebGPU shaders.

## Architecture

**Engine** (`@lutra/engine`):
The pure computational core. Owns the layer registry (what layers exist, their fields, defaults, ranges), the WGSL shader body generation per layer, the chain source assembler (concatenates bodies into a single shader program), and the sRGB↔linear conversion functions. No WebGPU pipeline setup, no DOM, no UI.

**Frontend** (`@lutra/frontend`):
The web application. Owns the WebGPU pipeline setup (device, bind groups, compute passes), the TEA-based UI (foldkit), and all browser-side concerns. Consumes `@lutra/engine` as a library.

**Effect-TS runtime**:
The engine uses the Effect library (`effect` ^4.x) for its public API. `Effect` models the image processing pipeline (async GPU operations, error handling, resource management). `Schema` defines the layer data model. `Context` provides dependency injection for GPU resources when the engine is hosted in a browser.

**Shader porting**:
Direct port of each SkSL body to WGSL by hand. The mobile SkSL bodies are the reference. No shared IR or transpilation layer — just parallel implementations in two shader dialects.

**Chromatic aberration**: Implemented (not deferred), radial. Each layer runs as its own compute pass, so CA samples the previous pass's output (the accumulated result of earlier layers) at offsets that grow quadratically from the image center — not the source image. A dedicated linearize pass is inserted ahead of the first sampling layer so sampled texels are always linear light.

**GPU pipeline**: Compute shaders for processing, render pipeline for presentation. The chain assembler emits one compute pass per layer; passes ping-pong through linear-light rgba16float intermediates (8-bit intermediates would band), and only the final pass encodes to sRGB and writes the display texture. This unlocks: real clarity (local contrast with neighbor access across passes), proper film-grain (FBM noise with neighbor coherence), and future scatter-write passes (histograms, LUT tetrahedral interpolation). Grain is a priority — the mobile's cheap per-pixel hash is not acceptable for the web engine. The processed frame never leaves the GPU on the display path — the final storage texture is blitted to the canvas swapchain by a fullscreen-triangle pass (free bilinear). Readback to an ImageBitmap happens only on export.

**Clarity**: Placeholder for now (midtone lift, same as mobile). Real local contrast is deferred despite compute-shader capability.

**Scaffolding order**:
1. Layer data model (Schema definitions, registry, `createLayer`)
2. Colorspace + WGSL utilities
3. Shader bodies (10 WGSL body renderers)
4. Chain source assembler
5. Chain operations (add/remove/reorder/update param)
6. Render request (`createRenderRequest`, pure: shader + packed uniforms + source + frame)
7. GPU backend (frontend): persistent per-image resources, compute + blit execution, export snapshot
8. Tests — written alongside each workstream, not as a separate phase

**Engine package structure**:
```
engine/src/
  layers/
    registry.ts      ← source of truth (10 layer entries)
    types.ts         ← Layer, LayerType, field types
    defaults.ts      ← createLayer factory
  shaders/
    bodies/          ← 10 WGSL body renderers
    chain-source.ts  ← assembler (concatenates bodies into one shader)
    colorspace.ts    ← sRGB↔linear WGSL functions
  chain.ts           ← Chain abstraction (add, remove, reorder, update param)
  render.ts          ← createRenderRequest (pure assembly + uniform packing)
  index.ts           ← public API surface
```

**Public API**: The engine defines `Chain` operations (add/remove/reorder/update) and `createRenderRequest` (assembles a chain into a `RenderRequest`: shader + packed uniforms + source bitmap + frame counter). The frontend calls `createRenderRequest`, then hands the request and the canvas to its own `GpuBackend` service (Effect Context resource) — the backend executes the compute pass, blits to the canvas, and provides `snapshot` for export. The frontend doesn't touch WGSL or binding groups; the engine doesn't touch the DOM or WebGPU.

**Data model**: Effect Schema is the source of truth. Each layer type is a `Schema.Struct` defining its parameters with constraints (min, max, defaults). Types are derived via `typeof Schema.Type`. The registry maps layer type keys to their Schema + shader body + metadata (label, icon reference). Runtime validation uses `Schema.decode` at persistence boundaries.

## Language

**Adjustment layer**:
A sequential step in a non-destructive edit chain. Each layer consumes the result of the previous layer and produces a new one. There is no parallel compositing, no blend mode, and no mask at the layer level. Order matters; reordering re-runs the chain from that point.
_Avoid_: "Layer" on its own (ambiguous with Photoshop's parallel composited layer), "filter" (overloaded with Snapseed's Filters tab), "step".

**Film simulation adjustment**:
A product-level design constraint, not a feature flag. The prototype intentionally exposes a small palette of adjustments so the user can reach a film look quickly and is gently pushed away from runaway editing. Limitation is the feature.
_Avoid_: "Presets" (these are built-in looks, distinct from the adjustment primitives the user composes), "filters" (see above).

**Edit chain**:
The ordered list of **adjustment layers** applied to a single source image. The chain is the unit of non-destructive persistence: it can be saved, replayed, reordered, and pruned without touching the source image.
_Avoid_: "Stack" (Snapseed uses this word but it suggests LIFO; the chain is order-sensitive in both directions), "history" (history is a side effect, not the model).

### Editor UI

**Tool panel**:
A persistent panel in the **editor** showing all 10 **adjustment layer** types. Always visible — no distinction between "pinned" and "overflow" tools. Selecting a tool from the panel creates a **draft layer**.
_Avoid_: "toolbar" (too generic), "tool palette" (desktop jargon)

**Draft layer**:
An **adjustment layer** in a transactional preview state before the user confirms it. Created when the user selects a tool from the **tool panel**. The slider adjusts live, but the layer is not added to the **edit chain** until confirmed. If the user cancels or navigates away, the draft is discarded. The **editor** blocks other interactions (layer drawer, tool selection) while a draft is active.
_Avoid_: "preview layer" (ambiguous with image preview), "temp layer" (implies temporary persistence)

**Layer drawer**:
The right sidebar of the **editor**, always visible, showing the current **edit chain** as a vertical list. Displays each layer with its icon, label, formatted value, visibility toggle, and delete button. When a layer is selected or a **draft layer** is active, the slider and confirm/cancel controls render inline below the layer entry. Supports drag-to-reorder.
_Avoid_: "layers panel" (was the old bottom tab), "layer list" (too generic)

**Upload zone**:
The empty-state placeholder in the canvas area before an image is loaded. Shows a dashed-border drop target with an icon and the prompt "Drop an image or click to browse." Accepts drag-and-drop and click-to-browse file input. Disappears once an image is loaded.

### Adjustments

The v1 palette — ten **adjustment layer** types the user can add to the **edit chain**. No LUT yet (see Future). Order is significant.

Most layers expose a single parameter with one ruler slider. Two layers — **White balance** and **Vignette** — have **toggled parameters**: two parameters sharing one layer, one visible at a time.

1. **Exposure** — stops (-3 to +3, default 0). Multiplicative gain.
2. **Contrast** — S-curve amount (-1 to +1, default 0). Anchored at mid-gray.
3. **Shadows** — lifts dark tones (-1 to +1, default 0 = no-op).
4. **Highlights** — lifts bright tones (-1 to +1, default 0 = no-op).
5. **White balance** — toggled: temperature (-1 to +1, default 0, cool → warm) ↔ tint (-1 to +1, default 0). Approximated with direct linear-light channel scaling (R/B ±30%, G ±20% at full slider), not a CCT-based model.
6. **Saturation** — multiplier (-1 to +1, default 0 = no-op).
7. **Grain** — film-grain noise overlay (0 to 1, default 0 = no-op). Hash-based, no texture.
8. **Vignette** — toggled: amount (-1 to +1, default 0 = no-op) ↔ size (0.2 to 1, default 0.6).
9. **Chromatic aberration** — radial R/B channel split (-1 to +1, default 0 = no-op).
10. **Clarity** — midtone contrast / structure enhancement (-1 to +1, default 0 = no-op).

### Screens

**Editor**:
The single screen at `/`. Three-column Lightroom-style layout: left sidebar (**tool panel**, ~240px), center (**canvas** with pannable/zoomable image), right sidebar (**layer drawer**, ~280px). Top bar: app wordmark (**LUTRA**) left-aligned, export button right-aligned. No routing beyond the root — the editor is the app.
_Avoid_: "color grading menu", "workspace"

### Future (not in v1)

- **Main menu** — a gallery screen at `/` showing saved edits in a grid. The entry point for a multi-edit workflow.
- **Options screen** — settings surface with storage info and "Clear all" action.
- **Saved edit** — persisted record of source image + **edit chain** + thumbnail. Stored in IndexedDB (OPFS for source images, JSON for chain metadata).
- **LUT layer** — a layer type that applies a 3D color cube (`.cube` format) as a shader pass. Downloaded at runtime, not bundled.
- Lift / gain / gamma, masks, blend modes per layer.
- **Storage management** — soft/hard caps on saved edits, per-edit storage info, cleanup suggestions.

## Flagged ambiguities

- **"Layer"** in this project is exclusively an **adjustment layer** (sequential). It is not a Photoshop-style composited layer. If we ever introduce the latter, the term must change.
- **"Filter"** is reserved for a finished look / preset, not a single adjustment. An **adjustment** is a primitive; a **filter** (if added) would be a named, ordered set of adjustments applied as one.

## Example dialogue

> Dev: "The user added a saturation layer — where does it go in the edit chain?"
> Expert: "Wherever they put it. If it's after the channel mix, it tints the whole shifted image. If it's before, it tints the pre-look image. Order is part of the look."
>
> Dev: "Should we add a LUT layer?"
> Expert: "Not in v1. LUTs are a future addition — capture it so we don't forget, but it doesn't go in the v1 palette."
