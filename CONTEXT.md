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

**Chromatic aberration**: Implemented (not deferred). The chain shader exposes both the accumulated `color` and the source texture coordinate so CA can sample the input texture at offset positions. The assembler contract supports per-body source-texture access.

**GPU pipeline**: Compute shaders, not render pipelines. Unlocks: real clarity (local contrast with workgroup shared memory), proper film-grain (FBM noise with neighbor coherence), and future scatter-write passes (histograms, LUT tetrahedral interpolation). Grain is a priority — the mobile's cheap per-pixel hash is not acceptable for the web engine.

**Clarity**: Placeholder for now (midtone lift, same as mobile). Real local contrast is deferred despite compute-shader capability.

**Scaffolding order**:
1. Layer data model (Schema definitions, registry, `createLayer`)
2. Colorspace + WGSL utilities
3. Shader bodies (10 WGSL body renderers)
4. Chain source assembler
5. Chain operations (add/remove/reorder/update param)
6. Render pipeline (Effect-based `render`, `GpuBackend` service)
7. Tests — written alongside each workstream, not as a separate phase

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
  render.ts          ← Effect-based render pipeline
  index.ts           ← public API surface
```

**Public API**: Effect-based. The engine defines `Chain` operations (add/remove/reorder/update), a `render` Effect that processes an image through a chain, and a service interface (`GpuBackend`) that the frontend implements via Effect Context. The frontend calls `render(chain, imageSource)` and gets back a result — it doesn't touch WGSL, binding groups, or shader internals.

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

**Pinned tools**:
The fixed set of four quick-access **adjustment layer** types shown in the bottom toolbar of the **editor**: Exposure, White Balance, Saturation, Contrast. These are not configurable. The chevron-up affordance below opens the **tool overlay** for access to all available tools.
_Avoid_: "toolbar" (too generic), "quick actions"

**Draft layer**:
An **adjustment layer** in a transactional preview state before the user confirms it. Created when the user selects a tool from the **tool overlay**. The slider adjusts live, but the layer is not added to the **edit chain** until confirmed. If the user cancels or navigates away, the draft is discarded. The **editor** blocks other interactions (layer drawer, tool selection) while a draft is active.
_Avoid_: "preview layer" (ambiguous with image preview), "temp layer" (implies temporary persistence)

**Tool overlay**:
A bottom-sheet overlay showing all available **adjustment layer** types in a 4-column grid. Accessed via the chevron-up affordance below the **pinned tools**. Organized into tabs (Adjustments, LUTs placeholder for v1). Selecting a tool creates a **draft layer** and closes the overlay.
_Avoid_: "tool palette" (desktop jargon), "adjustments panel" (conflicts with the old tab-based UI)

**Layer drawer**:
A side panel showing the current **edit chain** with reorder, visibility toggle, and delete capabilities. Accessed via the layer icon in the top bar. Blocked while a **draft layer** is active.
_Avoid_: "layers panel" (was the old bottom tab), "layer list" (too generic)

### Adjustments

The v1 palette — ten **adjustment layer** types the user can add to the **edit chain**. No LUT yet (see Future). Order is significant.

Most layers expose a single parameter with one ruler slider. Two layers — **White balance** and **Vignette** — have **toggled parameters**: two parameters sharing one layer, one visible at a time.

1. **Exposure** — stops (-3 to +3, default 0). Multiplicative gain.
2. **Contrast** — S-curve amount (-1 to +1, default 0). Anchored at mid-gray.
3. **Shadows** — lifts dark tones (-1 to +1, default 0 = no-op).
4. **Highlights** — compresses bright tones (-1 to +1, default 0 = no-op).
5. **White balance** — toggled: temperature (K, default 6500) ↔ tint (-1 to +1, default 0).
6. **Saturation** — multiplier (-1 to +1, default 0 = no-op).
7. **Grain** — film-grain noise overlay (0 to 1, default 0 = no-op). Hash-based, no texture.
8. **Vignette** — toggled: amount (-1 to +1, default 0 = no-op) ↔ size (0.2 to 1, default 0.6).
9. **Chromatic aberration** — radial R/B channel split (-1 to +1, default 0 = no-op).
10. **Clarity** — midtone contrast / structure enhancement (-1 to +1, default 0 = no-op).

### Screens

**Main menu**:
The app's entry screen at `/`. Shows the app name (**LUTRA**) and a grid of **saved edits** (3-column, square-cropped thumbnails). "New edit" button starts the image picker flow → **editor**. Empty state shows "Start editing" with "Your edits will appear here" subtitle.
_Avoid_: "home" (ambiguous with system home), "landing" (web jargon).

**Editor**:
The color-grading screen at `/editor/:editId` or `/editor/new` that renders an **edit chain** for one image. Top bar: **back** (left), **layer icon** (opens **layer drawer**), **hamburger** (export). Bottom: **pinned tools** with chevron-up to **tool overlay**. During active edit: bottom shows slider replacing pinned tools; top shows confirm/cancel for **draft layer**. Pannable/zoomable image.
_Avoid_: "color grading menu", "workspace", "canvas"

**Options screen**:
Settings surface at `/options` with storage info. Shows edit count and total storage used. Includes "Clear all" action (deletes all **saved edits** and source images, with confirmation).
_Avoid_: "settings", "preferences", "config"

### Saved edit

A persisted record of a user's work: source image file + **edit chain** + thumbnail. Stored in IndexedDB (OPFS for source images, JSON for chain metadata). Grid on the **main menu** displays **saved edits** sorted newest-first.

### Future (not in v1)

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
