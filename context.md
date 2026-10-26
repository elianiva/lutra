# Lutra

A color-grading app for film simulation. Adjustments are non-destructive, ordered, and intentionally limited in scope. Web-first, client-side only — all image processing runs locally via WebGPU shaders.

## Architecture

**Engine** (`@lutra/engine`):
The pure computational core. Owns the layer registry (what layers exist, their fields, defaults, ranges), the WGSL shader body generation per layer, the chain source assembler (concatenates bodies into a single shader program), and the sRGB↔linear conversion functions. No WebGPU pipeline setup, no DOM, no UI.

**Frontend** (`@lutra/frontend`):
The web application. Owns the WebGPU pipeline setup (device, bind groups, compute passes), the TEA-based UI (foldkit), and all browser-side concerns. Consumes `@lutra/engine` as a library.

**Store** (`@lutra/store`):
The persistence seam. Owns the **Edit** / **Edit summary** schemas, the **Edit store** service contract (save/load/list/delete), and the browser's IndexedDB `EditStoreLive` implementation (docs/adr/0005-storage). A server/account-side `EditStoreLive` swaps in behind the same seam. Depends on `@lutra/engine` (for the `Layer` schema); the frontend consumes both engine and store.

**Raw decoder** (`@lutra/raw-decoder`):
The RAW file decoding package (docs/adr/0008-raw-decode). Owns the fork of the LibRaw-Wasm build — the C++ wrapper, the Emscripten build script, the committed wasm dist, and the TypeScript client (`open`/`metadata`/`imageData`/`rawImageData`/`thumbnailData`/`onProgress`/`dispose`) — plus the **RAW decode** settings schema and the **Raw decode error**. Rebuilds via `bun run build:raw`; the frontend consumes it as a workspace package.

**Frontend structure** (`@lutra/frontend`):
A **root Submodel** owns the top-level `route` and one Submodel per route arm. **Gallery** is a thin Submodel (list of **Edit summaries**); **Editor** is a Submodel hosting the existing editor (phase machine, chain, draft, render, export). Route-driven state lives in the Submodel: each exposes `init(route)` (cold load) and `informRouteChanged(route)` (navigation) calling the shared route-firing Commands, so reload and in-app navigation behave identically. Editor Messages wrap as `GotEditorMessage`, Gallery as `GotGalleryMessage` (docs/adr/0006-frontend-architecture).

**Effect-TS runtime**:
The engine uses the Effect library (`effect` ^4.x) for its public API. `Effect` models the image processing pipeline (async GPU operations, error handling, resource management). `Schema` defines the layer data model. `Context` provides dependency injection for GPU resources when the engine is hosted in a browser.

**Shader porting**:
Direct port of each SkSL body to WGSL by hand. The mobile SkSL bodies are the reference. No shared IR or transpilation layer — just parallel implementations in two shader dialects.

**Depth of field**: An **adjustment layer** that blurs the image by scene depth (docs/adr/0011-depth-of-field), mimicking real lens depth of field: blur radius at each pixel scales with how far the pixel's depth is from the focal plane, so the focal region stays sharp while nearer and farther regions soften. Two parameters: **focus distance** (where the focal plane sits in depth) and **blur amount** (max blur radius; 0 = no-op). Like every layer, it consumes the result of the previous layer, and order matters.
_Avoid_: "portrait mode" (a product-level marketing term; this is a depth-based adjustment), "lens blur" (ambiguous with a plain blur), "bokeh" (bokeh describes the quality of the blur disc, not the adjustment).

**Chromatic aberration**: Implemented (not deferred), radial. Each layer runs as its own compute pass, so CA samples the previous pass's output (the accumulated result of earlier layers) at offsets that grow quadratically from the image center — not the source image. A dedicated linearize pass is inserted ahead of the first sampling layer so sampled texels are always linear light.

**GPU pipeline**: Compute shaders for processing, render pipeline for presentation. The chain assembler emits one compute pass per layer; passes ping-pong through linear-light rgba16float intermediates (8-bit intermediates would band), and only the final pass encodes to sRGB and writes the display texture. This enables neighbor-sampling bodies: clarity runs a 9-tap bilinear blur of the previous pass's output (local contrast, unsharp-mask style, midtone-masked), and grain is 3-octave FBM value noise (integer lattice hash, quintic interpolation, animated per frame) — the mobile's per-pixel hash was pure white noise with no spatial coherence. Sampling passes expose a binding-5 sampler and use textureSampleLevel (textureSample is fragment-stage only). LUT passes are the exception to the linear-light rule: the vendored film cubes are authored in sRGB space, so a LUT pass decodes its linear input to sRGB, applies the cube via a 13³ 3D texture (manual trilinear — 32-bit float textures are not filterable, so the body reads texels with textureLoad), mixes by strength, and re-encodes to linear — skipping the round-trip at the chain ends, where source and display textures are already sRGB. Future scatter-write passes (LUT tetrahedral interpolation) remain unlocked. The processed frame never leaves the GPU on the display path — the final storage texture is blitted to the canvas swapchain by a fullscreen-triangle pass (free bilinear). Readback to an ImageData happens only on export. The **Histogram overlay** is the one display-path exception, and a scoped one: a full-resolution scatter-write pass (frontend-owned, like the blit) atomicAdds Rec.709 luma into a session-scoped 256×u32 bins accumulator, and only the 1KB bins cross back — never the frame. The readback rotates through a ring of three mapped staging buffers, with each frame's map issued the moment its submit completes (mapAsync queues behind every pending submission, so a late-issued map would land stale during fast slider drags); the app consumes the mapped bins a message later, off the render loop's critical path.

**Clarity**: Implemented as local contrast: a 9-tap bilinear box blur (radius 4 px) of the pass input, then unsharp-mask push away from the local mean, masked to midtones. Radius is fixed — a true wide-radius clarity would need a separable blur or mip pyramid.

**Build layers**:

1. Layer data model (Schema definitions, registry, `createLayer`)
2. Colorspace + WGSL utilities
3. Shader bodies (13 WGSL body renderers)
4. Chain source assembler
5. Chain operations (add/remove/reorder/update param)
6. Render request (`createRenderRequest`, pure: shader + packed uniforms + source + frame)
7. GPU backend (frontend): persistent per-image resources, compute + blit execution, export snapshot
8. Tests

**Engine package structure**:

```
engine/src/
  layers/
    registry.ts      ← source of truth (13 layer entries)
    types.ts         ← Layer, LayerType, field types
    defaults.ts      ← createLayer factory
  shaders/
    bodies/          ← 13 WGSL body renderers
    chain-source.ts  ← assembler (concatenates bodies into one shader)
    colorspace.ts    ← sRGB↔linear WGSL functions
  chain.ts           ← Chain abstraction (add, remove, reorder, update param)
  render.ts          ← createRenderRequest (pure assembly + uniform packing)
  index.ts           ← public API surface
```

**Public API**: The engine defines `Chain` operations (add/remove/reorder/update) and `createRenderRequest` (assembles a chain into a `RenderRequest`: shader + packed uniforms + source bitmap + frame counter). The frontend calls `createRenderRequest`, then hands the request and the canvas to its own `GpuBackend` service (Effect Context resource) — the backend executes the compute pass, blits to the canvas, and provides `snapshot` for export. The split follows the presentation boundary: chain shader _generation_ is engine-owned (bodies, assembly, colorspace helpers), while presentation- and analysis-side WGSL is frontend-owned (the blit's fullscreen-triangle pass; the histogram scatter pass lives there too). The engine doesn't touch the DOM or WebGPU.

**Data model**: Effect Schema is the source of truth. Each layer type is a `Schema.Struct` defining its parameters with constraints (min, max, defaults). Types are derived via `typeof Schema.Type`. The registry maps layer type keys to their Schema + shader body + metadata (label, icon reference). Runtime validation uses `Schema.decode` at persistence boundaries.

## Language

**Adjustment layer**:
A sequential step in a non-destructive edit chain. Each layer consumes the result of the previous layer and produces a new one. There is no parallel compositing, no blend mode, and no mask at the layer level. Order matters; reordering re-runs the chain from that point.
_Avoid_: "Layer" on its own (ambiguous with Photoshop's parallel composited layer), "filter" (overloaded with Snapseed's Filters tab), "step".

**Film simulation adjustment**:
A product-level design constraint, not a feature flag. The prototype intentionally exposes a small palette of adjustments so the user can reach a film look quickly and is gently pushed away from runaway editing. Limitation is the feature.
_Avoid_: "Presets" (these are built-in looks, distinct from the adjustment primitives the user composes), "filters" (see below).

**LUT library**:
The vendored collection of film-emulation `.cube` LUTs (296, mirrored from the G'MIC film color presets) that a **LUT layer** selects from via the **stock sheet**. Each LUT is referenced by its file path (`luts/<category>/<name>.cube`) as a stable id. Each entry also carries a vendored generic preview jpg (`thumbnail`), the fallback for **LUT preview thumbnails**.
_Avoid_: "presets" (see **Film simulation adjustment**), "LUT pack"

**LUT preview thumbnail**:
A 200×200 JPEG of the **user's** photo with one LUT applied at full strength, rendered lazily per visible catalog category by the thumb worker (docs/adr/0002-lut-library): the engine's `applyLutCpu` — a pure-JS 1:1 mirror of the WGSL LUT body, exact because a LUT-only chain has no colorspace boundary — then the engine's JPEG encode. The **stock sheet**'s thumbs prefer it over the **LUT library**'s vendored generic preview, which stays as the placeholder and failure fallback. Blob URLs live in the model (`lutThumbs`), cleared and revoked when a new image loads; a result that lands after an image switch is dropped by a bitmap-identity guard. A failed thumb is silently retried on the group's next visit.
_Avoid_: "per-LUT thumbnail" (the preview is per LUT _and_ per photo — the pairing is the point)

### Offline

**Offline library**:
The complete vendored **LUT library** — the catalog, every `.cube` file, and every generic preview thumbnail — mirrored into the browser's Cache Storage so the app works without a connection. The mirror is diff-based: each **offline fill** run compares the catalog's entries against what is already cached and fetches only what is missing, so a catalog update on a later deploy is picked up automatically. Once the mirror is complete, the app is fully offline-capable: editing, saving, exporting, and every LUT apply and preview work with no network.
_Avoid_: "cache" on its own (the browser cache is the mechanism, not the feature), "offline cache"

**Offline fill**:
The background process that builds the **offline library**. Page-driven — the model owns its state — and automatic: it starts after the app settles, runs in small throttled batches so it never competes with real browsing, pauses while the device is offline, and resumes on reconnect. Applying a LUT before the fill reaches it caches that LUT immediately (cache-as-you-go). Completion is announced by an "offline ready" toast; a storage-quota failure surfaces a distinct, actionable message instead.
_Avoid_: "background download" (the download is the mechanism, not the feature), "preloading"

**Edit chain**:
The ordered list of **adjustment layers** applied to a single source image. The chain is the unit of non-destructive persistence: it can be saved, replayed, reordered, and pruned without touching the source image.
_Avoid_: "Stack" (Snapseed uses this word but it suggests LIFO; the chain is order-sensitive in both directions), "history" (history is a side effect, not the model).

**Edit**:
A gallery record: a stable UUID identifying one **edit chain**, the **source image** it grades, and a **thumbnail** of the graded result. Each Edit is self-contained — it owns its own source image copy. An Edit's UUID never changes: **Save** replaces its **edit chain** in place (source image untouched), while **Save as** forks a new Edit with a new UUID and a duplicated source image. The **main menu** lists one tile per Edit via its **Edit summary**. Ordering comes from the Edit's **savedAt**.
_Avoid_: "Saved edit" (was the old term; collapsed the record and its chain), "project", "document".

**Edit id**:
The UUID that identifies an **Edit**. Generated at creation, stable for the Edit's lifetime. Its **schema validates the UUID format** and fails the whole decode on a malformed value — a corrupt id inside a saved **Edit** is corruption, not a recoverable case. (Same posture applies to the runtime-UUID `LayerId`; `LutId` is validated by **path shape**, not UUID — see Flagged ambiguities.)

**Edit store**:
The swappable storage backend behind the **main menu** and the editor's save flow, owned by the **Store** package. It exposes aggregate-level operations on **Edits**: `save` (upsert by **Edit id**), `load` (full Edit, source bytes included), `list` (Edit summaries, source bytes excluded), `delete`, and `clearAll`. `load` of a missing id yields `Option.None`; a genuine failure surfaces as a **Store error**. The v1 implementation is a typed IndexedDB table in the `"lutra"` database — one `edits` object store, one row per Edit (see docs/adr/0005-storage); an opt-in online store is a future backend through the same seam. Because each Edit is one row, save/load/delete are atomic per Edit by construction.

**Edit summary**:
A gallery tile: an **Edit id**, its **thumbnail** (bytes), and its **edit chain** — explicitly **without** the source-image bytes. `list()` returns summaries so the **main menu** can render a grid without loading every Edit's multi-MB source image. A `byteLength` on the summary feeds per-edit storage size. Thumbnails render as object URLs the gallery converts from bytes; a future cloud backend may serve them by URL instead, and the render contract is unchanged.
_Avoid_: "thumbnail card" (it's the record, not the visual card), "saved-edit tile".

**savedAt**:
The timestamp stored on an **Edit** that orders the **main menu**. Because the local IndexedDB table is keyed by **Edit id** and not ordered by time, `list()` sorts summaries by `savedAt` in memory (a future sqlite/cloud backend may order server-side instead — docs/adr/0005-storage).

**Store error**:
The tagged error type a failed **Edit store** operation raises (a genuine failure — quota, blocked access, corruption — not a missing record, which `load` reports as `Option.None`). Its purpose is to give the frontend a channel to surface failures (in the **main menu** or **Options screen**) and to let future sync distinguish local from server failure.
_Avoid_: reusing the engine's `GpuError`/`EncodeError` — storage failures are a distinct defect class in a distinct package.

**Image decode error**:
The tagged error a failed image load raises — reading a picked file's bytes, decoding it into an `ImageBitmap`, or decoding a saved **Edit**'s source bytes. One concept whether the browser API failed or the file is corrupt: the user-visible failure is the same — the image cannot be opened. It surfaces in the editor's **error stage** and the gallery's photo-create failure.
_Avoid_: plain `Error` (the pre-taxonomy slop), "invalid image" (implies the file is at fault when a plain read can fail too).

**Raw decode error**:
The tagged error a failed **RAW decode** raises — LibRaw rejected the file, the wasm decode failed (unsupported compression, out-of-memory). A distinct defect class from **Image decode error** (a different mechanism, docs/adr/0006-frontend-architecture): after a raw failure the pick flow retries the browser decode once, and the user-visible failure stays "the image cannot be opened" — the raw error rides the cause chain (docs/adr/0008-raw-decode).
_Avoid_: reusing `ImageDecodeError` for wasm failures — the tags exist so the failure set stays discriminable.

**LUT load error**:
The tagged error a failed **LUT library** fetch raises — an HTTP failure of the catalog or a `.cube` file, or a corrupt catalog JSON. Distinct from a **LUT parse error**: a load error means the bytes never arrived; a parse error means the engine rejected the bytes it got.
_Avoid_: reusing `GpuError` — the historical mislabel; loading a LUT is not a GPU operation.

**LUT parse error**:
The tagged error `parseCube` raises on malformed `.cube` text — a missing or invalid `LUT_3D_SIZE` header, malformed data lines. The engine's pure parse boundary; the frontend passes it through rather than re-tagging it.

**Thumbnail encode error**:
The tagged error a failed **Edit summary** thumbnail encode raises — a 2d context unavailable, a `convertToBlob` failure. Distinct from the engine's `EncodeError` (the export encoder's contract): thumbnails are downscaled by canvas 2D, exports by the worker encoder.
_Avoid_: reusing `EncodeError` — the thumbnail pipeline is a different mechanism.

### RAW files

**RAW decode**:
The full-resolution conversion of a RAW file's sensor data into a displayable image: unpack, black/white normalization, as-shot white balance, demosaic, camera color matrix, sRGB encode (LibRaw in wasm, docs/adr/0008-raw-decode). Runs in the editor's `Loading` phase behind stage-based progress, with the **embedded JPEG preview** as the placeholder.
_Avoid_: "import", "convert" (the mobile app's platform transcode is a different, lesser thing — it lands on the embedded thumbnail).

**Embedded JPEG preview**:
The camera-rendered JPEG inside a RAW file — the instant placeholder for the gallery tile and the editor's Loading phase while the **RAW decode** runs. Not a substitute for the decode: 8-bit, camera tone curve, often small. The **LUT preview thumbnails** for RAW sources use a decode-derived preview instead, so the bar matches the editor's rendering.
_Avoid_: "thumbnail" on its own (the gallery's thumbnail is the graded **Edit summary** image).

**As-shot white balance**:
The camera's recorded WB multipliers, applied at **RAW decode** time so the untouched image matches what the camera previewed. The **White balance** layer then trims _relative_ to as-shot — its ±30% R/B range would be too small to fix a neutral decode under tungsten.

**Bayer / X-Trans**:
The sensor mosaic patterns in RAW files. X-Trans (Fuji RAF) needs dedicated demosaicing; LibRaw handles both on the CPU, which is why the decode is CPU-side rather than a GPU demosaic (docs/adr/0008-raw-decode).

### Editor UI

**Tool rail**:
The floating column of tools in the **editor** (docs/adr/0013-materials), one icon per **adjustment layer** type, ordered LUT first. Hovering or focusing an icon opens a **tool card** with its number, name and the two-line copy — what the layer does and when to reach for it — written from the shader body's actual behavior (never generic photo-editing semantics: **Chromatic aberration** here is a film effect, not a correction). With no hover there are no labels, which is why the rail is narrow enough to float over the canvas; below `lg` the same component renders as full-width rows with the copy visible, because touch has no hover. A small accent dot marks a tool already in the **edit chain**. The LUT entry doubles as the **LUT library** load status: "Loading LUTs…" while the catalog is in flight, "LUTs unavailable" (the error message in the card) on failure, and it stays disabled until the catalog lands. The rail is disabled until an image is loaded (see **Editor phase machine**). Selecting a tool starts a **draft layer**.
_Avoid_: "toolbar" (too generic), "tool panel" (the old fixed column), "tool palette" (the palette is the searchable overlay)

**Draft layer**:
An **adjustment layer** in a transactional preview state before the user confirms it. Created when the user selects a tool from the **tool rail** or the **palette**. The slider adjusts live, but the layer is not added to the **edit chain** until confirmed. If the user cancels or navigates away, the draft is discarded. The **editor** blocks tool selection and layer selection while a draft is active (chain edits — remove, reorder, visibility — stay available).
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
- **Chain data ops, pan/zoom, export, stock sheet state** (hover preview, category, recents, per-photo **LUT preview thumbnails**), **appearance mode**, **palette** (open, query): pure data updates.

**Inspector**:
The floating panel on the right of the **editor** (docs/adr/0013-materials). It shows the parameters of exactly one layer — the selected chain layer or the active **draft layer** — and never the chain itself. The header carries the module number (or `Draft`), the layer name, its formatted value and a stepper for single-field layers. A selected chain layer also carries a position row (move earlier / move later) between the sliders and the grouped content. Grouped content sits in a **well**: for a **LUT layer** the stock, colour space and the **stock sheet**; for every other layer its two-line description. The footer holds the layer actions (visibility, delete, add) — or Cancel / Apply for a draft, which uses the same shape so the transaction stays visible.
_Avoid_: "layer drawer" (the old fixed column), "layers panel"

**Stock sheet**:
The **LUT library** browser inside the **inspector**'s well (docs/adr/0002-lut-library, docs/adr/0013-materials): category chips above a four-column contact sheet of framed thumbnails, with the hovered or committed stock named below. Renders whenever the target is a **LUT layer** — drafting or selected — and the catalog has loaded; there is no toggle and no separate bar. Hover dispatches `PreviewedLut` (presentation-only model state applied at render time, never touching the chain or the machine); click commits via `ChangedDraftLut` / `ChangedLayerLut`. Thumbs show the **LUT preview thumbnail** for the current photo once it has rendered — generated lazily per visible group — else the vendored generic preview; an offline, not-yet-downloaded cube is dimmed and labelled "not downloaded", and its click raises the connect-once notice instead of committing. The **Recents** chip (most-recently-applied LUTs, capped at 12, persisted) is hidden while empty, falling back to the first catalog category. Save/export while a preview is active dismisses the preview instead of acting — the thumbnail/export frame must never capture the hovered look.
_Avoid_: "LUT bar" (the old bottom strip), "filmstrip", "preset picker" (presets are built-in looks, distinct from LUTs)

**Histogram readout**:
The luminance histogram in the **status band** under the canvas (docs/adr/0013-materials). A pure display widget: no interaction. It shows the luminance distribution (Rec.709 luma, same coefficients as the shader bodies) of the currently displayed frame — the source after the full **edit chain**, not the source. Luminance only, no per-channel traces, drawn as a filled area with linear max-bin normalization (the tallest bin fills the height). Nothing renders until the first readback lands.
_Avoid_: "chart", "waveform" (video terminology), "overlay" (it no longer floats over the canvas)

**Compare**:
The editor's before/after viewing feature, controlled from the segmented control in the **status band**. Four modes: **Off** (normal view), **Toggle** (the whole canvas flips between the **source image** and the **graded output**), **Split** (both at once, separated by a draggable divider — see **split position**), and **Side by side** (both images shown next to each other in the canvas). The graded side always shows the _last rendered frame_: presentation changes — flipping, dragging the divider — re-present it without re-rendering the **edit chain** (docs/adr/0010-editor-ui).
_Avoid_: "before/after" (a descriptive phrase, not the feature name), "compare view"

**Split position**:
The location of the divider in **Split** mode, in image space — it pans and zooms with the photo. The divider widget counter-scales its own size by the zoom, so its grab strip, line, and handle stay a constant screen size at any zoom (an image-space-sized strip would shrink to a few pixels on a zoomed-out photo and become undraggable). Persists while the image is loaded; a new image resets it to 50%.
_Avoid_: "divider position" (the divider is the widget; the split position is the value)

**Chain modules**:
The **edit chain** docked to the **print**'s right edge (docs/adr/0013-materials): one module card per layer, in chain order top to bottom, each connected to the frame's spine by a short stub. A module carries its position (01, 02 …), its formatted value and its name; the numbers plus the vertical order are the hierarchy. Selecting a module selects that layer for the **inspector**; a drafting layer appears as an accent module marked `draft`; the `+` module opens the **palette**. An empty chain renders no modules at all — the frame stays a print.
_Avoid_: "layer strip", "timeline" (the chain is ordered but not temporal), "dock" (it is no longer a row under the canvas)

**Palette**:
The add-adjustment overlay (docs/adr/0013-materials): a searchable list of all thirteen **adjustment layer** types, grouped Look / Light / Color / Film / Optics, opened from the dock's `+` or the inspector's add action. Typing filters by name, description and group. Selecting a row dispatches `SelectedTool` — the same message the **tool rail** sends — so there is one path into the **draft layer** transaction. A dot marks tools already in the chain.
_Avoid_: "command palette" (a different, keyboard-first surface), "tool panel"

**Status band**:
The row under the **chain dock**, aligned to the canvas column (docs/adr/0013-materials): the **histogram readout** on the left and the zoom percentage plus **Compare** control on the right. It exists so the print carries no chrome over it.

**Upload zone**:
The empty-state placeholder in the canvas area before an image is loaded. Shows the drop target with an icon and the prompt "Drop an image here, or browse." inside the print mount's stage. Accepts drag-and-drop and click-to-browse file input. Disappears once an image is loaded.

**Export dialog**:
The modal opened by the top-bar export button. Offers a format (PNG/JPEG/WebP/AVIF), a quality slider (lossy formats only), a **size** (percentage presets plus exact output width × height typed against the frame, capped at 100%), a **resample** filter, a collapsible **codec options** section for the active format, and the download button. Encoding runs only when Export is pressed (a live size preview was too slow) — the button shows a loading state while the frame encodes, and the file size appears after the download. The dialog stays open after a download — tweak and re-export until it looks right. Settings persist across sessions.
_Avoid_: "Save dialog" (there is no file location choice; the browser owns the download)

**Export settings**:
The persisted format / quality / size / resampler / codec-options choice shown in the **export dialog**. `quality` is null only for PNG (the one format with no quality knob); a lossless WebP/AVIF keeps its value so switching the toggle back off restores it, and the codec call omits quality while lossless. The codec options are one struct per lossy format (MozJPEG progressive / optimize-coding / smoothing, WebP lossless / method effort, AVIF lossless / speed). The one size value is a `scale` in `[0.01, 1]` — a preset or a typed pixel size read against the frame — because export never upscales.

### Adjustments

The v1 palette — thirteen **adjustment layer** types the user can add to the **edit chain**. Order is significant: the picker leads with the signature **LUT** layer, then the adjustment primitives (a deliberate deviation from the mobile reference ordering).

Most layers expose a single parameter with one ruler slider. Two layers — **White balance** and **Vignette** — have **toggled parameters**: two parameters sharing one layer, one visible at a time. **Color Mixer** has 24 parameters (8 ranges × 3 channels) behind a swatch row: pick a range, drag its three sliders. **Tone Curve** has 10 point coordinates behind the curve widget: drag the handles.

1. **LUT** — applies a film-emulation color cube from the **LUT library** at 0 to 1 strength (default 1 = full apply, 0 = no-op). The cube is applied to sRGB-encoded values — the film LUTs are authored in sRGB space — so the layer round-trips through sRGB at its chain boundaries.
2. **Exposure** — stops (-3 to +3, default 0). Multiplicative gain.
3. **Contrast** — S-curve amount (-1 to +1, default 0). Anchored at mid-gray.
4. **Shadows** — lifts dark tones (-1 to +1, default 0 = no-op).
5. **Highlights** — lifts bright tones (-1 to +1, default 0 = no-op).
6. **Tone Curve** — a draggable piecewise-linear curve over the whole tonal range (docs/adr/0003-adjustment-layers): 5 fixed control points (black and white anchors plus three interior), each with x (input tone) and y (output tone) in [0, 1], default identity (the diagonal). The **inspector** shows the curve widget — grid, dashed identity diagonal, accent curve polyline, one handle per point — instead of sliders; dragging a handle updates the point live, the reset button (visible only while non-neutral) restores the diagonal. The curve applies per channel in sRGB space (the widget's coordinates are display values); the shader evaluates the same polyline the widget draws (WYSIWYG), flat beyond the anchors.
7. **White balance** — toggled: temperature (-1 to +1, default 0, cool → warm) ↔ tint (-1 to +1, default 0). Approximated with direct linear-light channel scaling (R/B ±30%, G ±20% at full slider), not a CCT-based model.
8. **Saturation** — multiplier (-1 to +1, default 0 = no-op).
9. **Color Mixer** — Lightroom-style per-range HSL (docs/adr/0003-adjustment-layers): 24 normalized fields (8 ranges — red, orange, yellow, green, aqua, blue, purple, magenta — × hue/saturation/luminance, all -1 to +1, default 0). The **inspector** shows a swatch row + the active range's three sliders; hue rotates ±90° at full deflection, saturation is multiplicative (full left desaturates), luminance is asymmetric (compresses toward black / lifts toward white). GIMP's HSLA-in-sRGB math with partition-of-unity range weights (10° crossfade bands at midpoint boundaries); achromatic pixels are untouched.
10. **Grain** — three Snapseed-style knobs, all 0–1 default 0 (no-op): **texture** (strength), **size** (base noise cell, log 1.5→10 px), **blur** (softness). 3-octave FBM value noise over an integer lattice hash, animated per frame. Amplitude ±0.15 linear at full texture, midtone-weighted.
11. **Vignette** — toggled: amount (-1 to +1, default 0 = no-op) ↔ size (0.2 to 1, default 0.6).
12. **Chromatic aberration** — radial R/B channel split (-1 to +1, default 0 = no-op).
13. **Clarity** — midtone local contrast / structure enhancement (-1 to +1, default 0 = no-op).

### Screens

**Editor**:
The screen at `/edit/:id` (and `/` when a photo is picked). A full-bleed canvas — the image can use the whole window — with everything else floating above it (docs/adr/0013-materials): the **tool rail** at the left edge, the wordmark, edit id, appearance toggle and save actions along the top, the **inspector** at the right edge, and the **histogram** bottom-left. In the middle sits the **print**: the image stage, its plate label, the serif caption, the **chain modules** docked to its right edge, and the frame controls (zoom and **Compare**). Nothing is drawn with a border: tone, a lit top edge and shadow separate the surfaces. The top bar holds the wordmark, the attached edit's id, the **appearance mode** toggle, and Save as / Export / Save; the start-over action lives in the gallery.

On phones and portrait tablets (< 1024px) the columns stack: the mount takes the full width, the **tool rail** and **inspector** become bottom sheets toggled by a tab bar (Adjustments / Inspector / Add), and the **palette** opens full width. Picking a tool flips the sheet to Inspector so the draft sliders are the working surface. The canvas supports touch pinch-zoom and double-tap zoom alongside the desktop wheel/drag; the top bar drops the document line and Save as below 640px.
_Avoid_: "color grading menu", "workspace"

**Print mount**:
The framed card that holds the canvas (docs/adr/0013-materials). A plate label above (`Print`, the pixel dimensions) and a serif caption below (the first **LUT layer**'s stock and strength, the chain length). The canvas area inside the mount is a dark stage in both **appearance modes** — a photograph is judged against a neutral dark surround, and the mount around it can be paper in light mode. The stage is what pans and zooms; the mount never moves.

**Appearance mode**:
The app's light or dark presentation, `dark` by default (docs/adr/0013-materials). One attribute on the document root (`data-mode`) swaps the whole token set; no component knows the mode. The choice is stored per browser and painted before the first render, so the app never flashes the wrong mode. Controlled from the top bar toggle.

**Main menu**:
The gallery screen at `/` (the app's entry point). Shows saved **edits** as a grid of **Edit summaries** (their **thumbnails**), ordered by **savedAt**. Selecting a tile opens the **Editor** attached to that **Edit**. An **Open photo** action (header + empty state) fires the native file picker with multi-select on and creates one new **Edit** per picked photo (fresh **Edit id**, empty **edit chain**, source + thumbnail bytes) through the **Edit store**: a single pick opens the **Editor** on it — the same persist-then-open flow as the mobile main menu — while picking several photos keeps the user on the gallery, refreshing the grid in place instead of navigating (docs/adr/0010-editor-ui). Tile actions are **open** (the whole tile) and **delete** (a per-tile control that calls the **Edit store**); there is no rename. The **Options screen** affordance (storage info, "Clear all") anchors here. The grid reflows to two columns on a phone (docs/adr/0010-editor-ui); the offline card spans the viewport width below 768px.
_Avoid_: "Gallery" (ambiguous with the image-processing sense of the word), "landing page".

**Attached edit**:
The state of the **Editor** when it was opened from a **Main menu** tile: the editor is tied to that **Edit id**, its source image, and its **edit chain**. In this state, **Save** updates that Edit in place (source image untouched, thumbnail refreshed from the graded result) and **Save as** forks. When the editor is instead seeded from a fresh in-editor file pick, there is no attached edit and **Save** creates a new one. Opening a photo from the **Main menu** is persist-first: the gallery creates the **Edit** (fresh id, empty chain) and navigates the editor onto it, so the editor always has an attached edit there. The attached edit is model data (id + source bytes), not a new editor phase — an opened Edit is the existing `Idle` phase. Through the **Edit store** seam both write modes are the same call: **Save** is `save(edit)` with the existing id, **Save as** is `save(edit)` with a freshly generated id and duplicated source bytes.
_Avoid_: "opened edit" (ambiguous), "edit session".

### Future (not in v1)

- **Options screen** — settings surface with storage info (usage/quota from `navigator.storage.estimate()`, per-edit size from each **Edit summary**'s `byteLength`) and a "Clear all" action (the **Edit store**'s `clearAll`).
- Lift / gain / gamma, masks, blend modes per layer.
- **Storage management** — soft/hard caps on **edits**, per-edit storage info, cleanup suggestions.
- **Online storage** — an opt-in, login-gated store for **edits** (e.g. D1 or Turso with R2 for source-image blobs), reached through the same swappable storage seam as the local IndexedDB backend.

## Flagged ambiguities

- **"Layer"** in this project is exclusively an **adjustment layer** (sequential). It is not a Photoshop-style composited layer. If we ever introduce the latter, the term must change.
- **"Filter"** is reserved for a finished look / preset, not a single adjustment. An **adjustment** is a primitive; a **filter** (if added) would be a named, ordered set of adjustments applied as one.
- **Id format validation is NOT "make every id a UUID".** Only ids that are genuinely runtime-generated UUIDs (`LayerId`, the new **Edit id**) validate against the UUID pattern. `LutId` is a `.cube` **file path** and validates its path shape; `FieldKey` is a layer field name and stays a loose string. A UUID check on `LutId` would break the vendored LUT scheme.

## Example dialogue

> Dev: "The user added a saturation layer — where does it go in the edit chain?"
> Expert: "Wherever they put it. If it's after the channel mix, it tints the whole shifted image. If it's before, it tints the pre-look image. Order is part of the look."
>
> Dev: "The user picked a LUT from the picker — where does it go in the edit chain?"
> Expert: "It's a LUT layer like any other adjustment, with its own strength. Two LUT layers grade twice; order is part of the look."
