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

**GPU pipeline**: Compute shaders for processing, render pipeline for presentation. The chain assembler emits one compute pass per layer; passes ping-pong through linear-light rgba16float intermediates (8-bit intermediates would band), and only the final pass encodes to sRGB and writes the display texture. This enables neighbor-sampling bodies: clarity runs a 9-tap bilinear blur of the previous pass's output (local contrast, unsharp-mask style, midtone-masked), and grain is 3-octave FBM value noise (integer lattice hash, quintic interpolation, animated per frame) — the mobile's per-pixel hash was pure white noise with no spatial coherence. Sampling passes expose a binding-5 sampler and use textureSampleLevel (textureSample is fragment-stage only). LUT passes are the exception to the linear-light rule: the vendored film cubes are authored in sRGB space, so a LUT pass decodes its linear input to sRGB, applies the cube via a 13³ 3D texture (manual trilinear — 32-bit float textures are not filterable, so the body reads texels with textureLoad), mixes by strength, and re-encodes to linear — skipping the round-trip at the chain ends, where source and display textures are already sRGB. Future scatter-write passes (histograms) remain unlocked. The processed frame never leaves the GPU on the display path — the final storage texture is blitted to the canvas swapchain by a fullscreen-triangle pass (free bilinear). Readback to an ImageBitmap happens only on export.

**Clarity**: Implemented as local contrast: a 9-tap bilinear box blur (radius 4 px) of the pass input, then unsharp-mask push away from the local mean, masked to midtones. Radius is fixed — a true wide-radius clarity would need a separable blur or mip pyramid.

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
_Avoid_: "Presets" (these are built-in looks, distinct from the adjustment primitives the user composes), "filters" (see below).

**LUT library**:
The vendored collection of film-emulation `.cube` LUTs (296, mirrored from the G'MIC film color presets) that a **LUT layer** selects from via the **LUT picker**. Each LUT is referenced by its file path (`luts/<category>/<name>.cube`) as a stable id.
_Avoid_: "presets" (see **Film simulation adjustment**), "LUT pack"

**Edit chain**:
The ordered list of **adjustment layers** applied to a single source image. The chain is the unit of non-destructive persistence: it can be saved, replayed, reordered, and pruned without touching the source image.
_Avoid_: "Stack" (Snapseed uses this word but it suggests LIFO; the chain is order-sensitive in both directions), "history" (history is a side effect, not the model).

### Editor UI

**Tool panel**:
A persistent panel in the **editor** showing all 11 **adjustment layer** types. Always visible — no distinction between "pinned" and "overflow" tools. Selecting a tool from the panel creates a **draft layer**; the LUT tool stays disabled until the **LUT library** catalog has loaded. The whole panel is disabled until an image is loaded (see **Editor phase machine**).
_Avoid_: "toolbar" (too generic), "tool palette" (desktop jargon)

**Draft layer**:
An **adjustment layer** in a transactional preview state before the user confirms it. Created when the user selects a tool from the **tool panel**. The slider adjusts live, but the layer is not added to the **edit chain** until confirmed. If the user cancels or navigates away, the draft is discarded. The **editor** blocks tool selection and layer selection while a draft is active (chain edits — remove, reorder, visibility — stay available).
_Avoid_: "preview layer" (ambiguous with image preview), "temp layer" (implies temporary persistence)

**Editor phase machine**:
The editor's interaction mode is a foldkit **Machine** (the experimental module) defined in `packages/frontend/src/app/phase.ts`; the model's `phase` field is its state. The image lifecycle and the interaction mode are one state union because they gate each other:

- `Empty` / `Loading` / `Error` — no image; the editor is blocked.
- `Idle` / `Drafting` / `Selected` — editable; the canvas is showing.

Tool selection and layer selection are edges only from the editable states, so a draft is structurally impossible without an image, and layer selection while a draft is active is blocked (the draft is never silently cancelled). A decode that lands after a `ClearedImage` has no edge and is dropped — a stale decode cannot resurrect a cleared image. Messages with no edge are ignored; that _is_ the blocking, with no scattered `if` guards. `unreachableStates()` and `deadTransitions()` are asserted empty in `phase.test.ts`.

**State machine inventory** — which editor state is a machine, and which is plain data:

- **Editor phase** (`app/phase.ts`): the machine above. Owns the image lifecycle, the draft, and the selection. The `Drafting` state carries the draft layer; the model no longer has `draft`/`selectedLayerId`/`source.status` flags.
- **Render loop** (`renderPending` / `revision` / `stamp`): deliberately plain — a latest-wins reconciliation whose stale-frame decision needs the model `revision`, and whose trigger is `renderNow` from data-op handlers, not a message.
- **LUT catalog**: one-shot AsyncData (`null` until the startup fetch lands) — not a machine.
- **Chain data ops, pan/zoom, export, LUT picker expansion**: pure data updates.

**Layer drawer**:
The right sidebar of the **editor**, always visible, showing the current **edit chain** as a vertical list. Displays each layer with its icon, label, formatted value, visibility toggle, and delete button. When a layer is selected or a **draft layer** is active, the slider and confirm/cancel controls render inline below the layer entry. Supports drag-to-reorder.
_Avoid_: "layers panel" (was the old bottom tab), "layer list" (too generic)

**LUT picker**:
The inline control in the **layer drawer** for choosing the LUT on a **LUT layer** (draft or selected). Expands as per-category accordions showing a thumbnail grid; selecting updates the preview live and keeps the picker open for comparison. The current LUT is shown on a selector row above the grid, with the strength slider below.
_Avoid_: "preset picker" (presets are built-in looks, distinct from LUTs)

**Upload zone**:
The empty-state placeholder in the canvas area before an image is loaded. Shows a dashed-border drop target with an icon and the prompt "Drop an image or click to browse." Accepts drag-and-drop and click-to-browse file input. Disappears once an image is loaded.

### Adjustments

The v1 palette — eleven **adjustment layer** types the user can add to the **edit chain**. Order is significant.

Most layers expose a single parameter with one ruler slider. Two layers — **White balance** and **Vignette** — have **toggled parameters**: two parameters sharing one layer, one visible at a time.

1. **Exposure** — stops (-3 to +3, default 0). Multiplicative gain.
2. **Contrast** — S-curve amount (-1 to +1, default 0). Anchored at mid-gray.
3. **Shadows** — lifts dark tones (-1 to +1, default 0 = no-op).
4. **Highlights** — lifts bright tones (-1 to +1, default 0 = no-op).
5. **White balance** — toggled: temperature (-1 to +1, default 0, cool → warm) ↔ tint (-1 to +1, default 0). Approximated with direct linear-light channel scaling (R/B ±30%, G ±20% at full slider), not a CCT-based model.
6. **Saturation** — multiplier (-1 to +1, default 0 = no-op).
7. **Grain** — three Snapseed-style knobs, all 0–1 default 0 (no-op): **texture** (strength), **size** (base noise cell, log 1.5→10 px), **blur** (softness). 3-octave FBM value noise over an integer lattice hash, animated per frame. Amplitude ±0.15 linear at full texture, midtone-weighted.
8. **Vignette** — toggled: amount (-1 to +1, default 0 = no-op) ↔ size (0.2 to 1, default 0.6).
9. **Chromatic aberration** — radial R/B channel split (-1 to +1, default 0 = no-op).
10. **Clarity** — midtone local contrast / structure enhancement (-1 to +1, default 0 = no-op).
11. **LUT** — applies a film-emulation color cube from the **LUT library** at 0 to 1 strength (default 1 = full apply, 0 = no-op). The cube is applied to sRGB-encoded values — the film LUTs are authored in sRGB space — so the layer round-trips through sRGB at its chain boundaries.

### Screens

**Editor**:
The single screen at `/`. Three-column Lightroom-style layout: left sidebar (**tool panel**, ~240px), center (**canvas** with pannable/zoomable image), right sidebar (**layer drawer**, ~280px). Top bar: app wordmark (**LUTRA**) left-aligned, export button right-aligned. No routing beyond the root — the editor is the app.
_Avoid_: "color grading menu", "workspace"

### Future (not in v1)

- **Main menu** — a gallery screen at `/` showing saved edits in a grid. The entry point for a multi-edit workflow.
- **Options screen** — settings surface with storage info and "Clear all" action.
- **Saved edit** — persisted record of source image + **edit chain** + thumbnail. Stored in IndexedDB (OPFS for source images, JSON for chain metadata).
- Lift / gain / gamma, masks, blend modes per layer.
- **Storage management** — soft/hard caps on saved edits, per-edit storage info, cleanup suggestions.

## Flagged ambiguities

- **"Layer"** in this project is exclusively an **adjustment layer** (sequential). It is not a Photoshop-style composited layer. If we ever introduce the latter, the term must change.
- **"Filter"** is reserved for a finished look / preset, not a single adjustment. An **adjustment** is a primitive; a **filter** (if added) would be a named, ordered set of adjustments applied as one.

## Example dialogue

> Dev: "The user added a saturation layer — where does it go in the edit chain?"
> Expert: "Wherever they put it. If it's after the channel mix, it tints the whole shifted image. If it's before, it tints the pre-look image. Order is part of the look."
>
> Dev: "The user picked a LUT from the picker — where does it go in the edit chain?"
> Expert: "It's a LUT layer like any other adjustment, with its own strength. Two LUT layers grade twice; order is part of the look."
