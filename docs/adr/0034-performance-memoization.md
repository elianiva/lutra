# ADR 0034 — Fix 2.2 s `View` and make the app feel instant

- Status: **Draft — Plan for review**
- Date: 2026-08-22
- Trigger: `[foldkit] Slow view: 2207.6ms (budget: 16ms), triggered by ReceivedInspectedState`
- Context: `docs/adr/0009` (root + Gallery/Editor/Collage submodels), `docs/adr/0011` (compare present), `docs/adr/0012` (LUT bar), `docs/adr/0013` (per-photo LUT thumbs)

## 1. What the warning actually means

Foldkit instruments four synchronous phases (`Update`, `View`, `Patch`, `SubscriptionDependencies`) — `packages/foldkit/src/runtime/runtime.ts:__resolveSlowConfig`, `defaultSlowCallback`.  
`View` default budget is `16 ms` (one frame at 60 fps). 2207 ms is **~138× over budget**; the UI froze for >2 frames.

The payload the hook printed:

```
{_tag:'View', model:{…}, message:{_tag:'ReceivedInspectedState', …}, durationMs: 2207.6}
```

`ReceivedInspectedState` is **not a Lutra message** (`packages/frontend/src/root/message.ts` has no such tag). It is the DevTools overlay's own message (`packages/devtools/src/overlay.ts:Message.ReceivedInspectedState`). Two things pile up:

1. **Live path** — Any Lutra message that mutates `EditorModel` (hover `PreviewedLut`, drag `ScaledCanvas`/`CurvePointDragged`/`PanMoved`, `ChangedSplitPosition`) currently rebuilds the _entire_ editor + gallery + collage VNode tree with **zero** `createLazy`/`createKeyedLazy` (`grep -r createLazy packages/frontend/src` returns 0 hits outside `node_modules`). The lustre benchmark inside foldkit shows the unoptimized vs optimized delta alone is ~3× (`internal/lustre-benchmark/README.md`, `internal/lustre-benchmark/src/main.optimised.ts`). Lutra's catalog is ~300+ entries (`public/luts/film_luts.json`, 1781 lines) and each editor render does `groupByCategory` (`Array.groupBy` + `Record.toEntries`) + `visibleEntries` + `recentsEntries` + histogram polygon string allocs — repeated on **every** 60 Hz pointer move.

2. **DevTools path** — Clicking a history row in `Inspect`/`TimeTravel` runs `store.getModelAtIndex` → replay from the nearest keyframe → `JumpToAndInspect` → `ReceivedInspectedState({ model: <Lutra RootModel snapshot>, ... })` inside the overlay. The overlay then does `flattenTree(toInspectableValue(inspectedModel))` with `lazyTreeNode = createKeyedLazy()` per node. `inspectedModel` _is_ Lutra's root model, which currently carries `source: { bitmap: ImageBitmap, source: Uint8Array(5–15 MB) }`, `catalog: LutCatalogEntry[] (~300)`, `thumbs` maps, `chain: Layer[]`, `bins: Uint32Array(256)`. `Record.toEntries` on a `Uint8Array` enumerates every byte; `Array.isArray` check fails, so the overlay walks it as an object (thousands of keys) unless `toInspectableValue` special-cases it. Even with truncation, the tree for a full catalog + summaries is thousands of nodes. That plus a cold `flattenTree` explains a one-off 2 s spike when the inspector first opens.

Either path proves the same thing: **the view is doing far too much per render and has no stable-slot cache to skip**.

Verification before any code change:

- Reproduce: open editor with an image, open DevTools overlay, click a message row, confirm `Slow view` fires. Also hover the LUT filmstrip continuously and observe `Slow view` on `PreviewedLut`.
- Baseline: `performance.now()` around `view` (already done by `slow`), plus Chrome Performance → "JavaScript" flame for `view` and `patch`.

---

## 2. Map — where state lives vs where render happens

### Root (`src/root/*`)

- **Model:** `editor: EditorModel`, `gallery: GalleryModel`, `collage: CollageModel`, `offline: Offline { phase, online, saveData, downloaded, total, persisted, readyToast }`, `route`, `webgpu`. Delegates via `Got*Message`.
- **View:** `view.ts` builds `readyToast` + `offlineCard` (only under `GalleryRoute`) + `activeRoute` which embeds **one** submodel via `h.submodel({ slotId, model, view, toParentMessage })`. No memoization — every `RootMessage` rebuilds toast + card + submodel wrapper even when only `scale` changed in the editor.

### Editor — the God model (`src/editor/model.ts` + `phase.ts` machine)

`Model` has **~28 fields**:

```
source{bitmap, error, width, height}, chain: Layer[], phase: EditorPhase,
activeFieldIndex, activeMixerColor, scale/offsetX/offsetY,
catalog/catalogError, attachedEdit{ id, source: Uint8Array },
saveStatus, lutBarOpen/previewLut/lutTab/lutRecents/lutThumbs/lutDownloads/online/offlineLutNotice,
compareMode/compareSplitAt/compareToggleBefore, mobileSheet,
renderPending/renderedStamp/lastRender/bins/revision, exportDialog
```

Interaction mode is a `Machine` (`src/editor/phase.ts:editorMachine`) with states `Empty|Loading|Error|Idle|Creating|Drafting|Selected`. Every `update` steps the machine first — the canonical Effekt+TEA pattern — and `renderNow` / `PresentFrame` drive GPU work.

**View split (`src/editor/view.ts:layout`):** always builds `topBar(h, model, hasImage)`, `toolPanel(h, model, ...)`, `canvasStage(h, model)`, `layerDrawer(h, model, ...)`, `lutBar(h, model)`, `mobileTabBar(h, model)`, `ExportDialog.view`. All are plain function calls — no lazy boundary.

**Hot subtrees inside:**

| Subtree                 | File                                                       | Cost driver                                                                                                                                                                                                                                                                                       | Fires at                                                                                      |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `toolPanel`             | `src/editor/tool-panel.ts`                                 | `LAYER_TYPES_ORDER.map` (11 cards) × `chain.filter(...).length` per card (O(chains × types)), plus `lutName` formatting                                                                                                                                                                           | every `PreviewedLut`, `ScaledCanvas`, `UpdatedDraftParam`                                     |
| `canvasStage`           | `src/editor/canvas-stage.ts`                               | `histogramOverlay` loops 256 bins, `toFixed(1)` ×256, two `join(' ')` large strings, SVG `<polygon>/<polyline>` points; `loadedStage` reads `contentWidth` and rebuilds canvas attrs; `compareControl` rebuilds 4 buttons                                                                         | every slider tick (`UpdatedDraftParam` at 60–120 Hz), every `HistogramComputed`               |
| `layerDrawer`           | `src/editor/layer-drawer.ts`                               | `chain.slice().reverse().map(chainRow)` (alloc + reverse), per-row `summary` (`lutName` + `formatValue` + hue formatting), per-row `CycledToggledField`/`SelectedMixerColor`; rows use `DataAttribute('layer-id')` **without `h.Key`** → positional diff                                          | every chain reorder, every `SelectedLayer`                                                    |
| `lutBar`                | `src/editor/lut-bar/bar.ts` + `catalog.ts:groupByCategory` | `Option.all`, `groupByCategory` (`groupBy` + `Record.toEntries`), `recentsEntries`, `visibleEntries`, then `entries.map(thumb)` (categories hold up to ~70 thumbs; filmstrip wraps). Tabs list and thumb list have no memoization; thumb uses `h.Key` (good) but bar recomputes groups per render | `PreviewedLut` hover (every `mouseenter`/`mouseleave`), `SelectedLutTab`, `LutThumbGenerated` |
| `topBar`/`mobileTabBar` | `top-bar.ts`                                               | `DateTime.formatLocal` per render, icon helpers                                                                                                                                                                                                                                                   | every save status tick                                                                        |

Update is not the villain — `Update` budget is `4 ms` and `editorMachine.step` is cheap — but **view does derived work that belongs in cached slots**.

### Gallery (`src/gallery/view.ts`)

- Model holds `grid: AsyncData<EditSummary[]>`, `selection: EditId[]`, `collages: AsyncData<Collage[]>`, `collageThumbSizes`, `pendingDelete`, `settingsDialog/deleteDialog`. Boot via `ListEdits + ListCollages` (parallel, persisted cross-route).
- View maps `summaries.map(tile)` and `collages.map(collageCard)` **without `h.Key`** (only `DataAttribute('edit-id')`/`'collage-id'`). `tileThumb` does `thumbnailUrl` lookup per tile, `DateTime.formatLocal` per tile per render, `cellSize` + `placement` math per collage tile. `photoMap` (`new Map(model.photos.map)`) and `byId` maps are allocated per render per card. With 100–300 saved edits, diffing an unkeyed list after an insert at index 0 touches every DOM node (positional patch).

### Collage (`src/collage/view.ts` + `model.ts` + `subscriptions.ts`)

- Model holds `collage: AsyncData<Collage>`, `photos: CollagePhoto[]` (full `Uint8Array` source per tile — unbounded growth), `sizes: ThumbSize[]`, `notice`, `mode`, `drag: DragAndDrop.Model`, `framingDraft/pan/undo/cellPx`, `exportDialog`.
- View rebuilds `header` + `controls` (`frameRatioControl` with 4 presets + ratio inputs + column/gutter steppers + background + mode toggle) + `grid` (`collage.tiles.map(tileCell)`) on every `PanMoved`/`WheelZoomed` (≈60 Hz). `tileCell` does `photoMap` alloc, `DragAndDrop.maybeDropTarget`, `aspectOfPhoto`, `placement` per tile. `ghost` also allocates `photoMap`. Subscriptions for `panTracking`/`wheelZoom`/`cellSize` are correctly lifted into root but their messages still trigger full `collage/view` rebuild. No keys on `collage.tiles.map`.

### Cross-cutting

- **No `slow` / `devTools` config** — `src/main.ts:Runtime.makeApplication` passes `devTools: { Message: RootMessage, overlay }` defaults only. High-frequency messages (`ScaledCanvas`, `CurvePointDragged`, `PanMoved`, `ChangedSplitPosition`, `PreviewedLut`, `PanMoved`, `WheelZoomed`, `MovedLayerReorder`) flood `DevToolsStore` history (each retains a full Model snapshot → linear memory with `maxEntries=100` default, large `Model` with `Uint8Array`/`ImageBitmap` inside) and make time-travel replay expensive (`keyframeInterval=31` default, 31 `update` replays per jump).
- **`evo` reference discipline** is mostly correct (`evo(model, {...})` preserves unchanged top-level refs), but some branches spread inline objects (e.g. `source: { bitmap, error: null, ... }`) that create new refs for memoized views unless the slot is scoped to the right granularity.

Foldkit's guidance (`packages/website/src/page/core/viewMemoization.md`, `packages/website/src/page/performance.md:23`) is explicit:

> "Memoize expensive subtrees with `createLazy` and `createKeyedLazy`. This is the single highest-leverage tool."

> "`evo` walks the struct's own enumerable keys once — that reference preservation is what lets `createLazy` hit its `===` check."

---

## 3. What "fast" should mean here

Borrow Foldkit's budgets (`runtime.ts:DEFAULT_SLOW_*`), but scope them to Lutra UX:

- **Interactivity:** drag a slider / scrub LUT filmstrip / pinch-zoom canvas / pan a collage tile at 60 fps → `View + Patch < 16 ms` on a mid-range M1/M2 or Snapdragon 8g3. Today a single hover is 2 s.
- **Navigation:** gallery → editor → collage route transitions feel instant; grid with 200 edits paints <100 ms first paint, <16 ms incremental.
- **Memory:** `DevToolsStore` with defaults must not retain 100× multi-MB `Uint8Array` snapshots; time-travel jump to an arbitrary entry should be <50 ms.

We will measure via `slow.onSlow` callback (forward to console + analytics) and Chrome Performance flame. No new test harness needed up front; existing unit tests (`vitest`) must stay green.

---

## 4. Fixes — prioritized, smallest diff first

### 4.1 Foldkit memoization — the one change that buys back the 100×

Foldkit's API (`packages/foldkit/src/html/lazy.ts`):

```ts
export const createLazy = (): (<Args>(fn, args) => VNode|null) => { … }  // single slot, === on fn+dispatch+args
export const createKeyedLazy = (): (<Args>(key, fn, args) => VNode|null) => { … } // one slot per PropertyKey, never evicted
```

Rules (enforced by `oxlint-plugin-foldkit/lazy-view-stable-references`):

- Declare slots at **module scope** `const lazyX = createLazy()` / `createKeyedLazy()`.
- Define the wrapped `view` function at **module scope** with a stable `fn` reference.
- Pass dispatch-stable args (Model slices, primitives, `h`). Never pass a per-render closure as an arg — it defeats `===`.
- Keep `h` in args (the runtime hands every render the same builder, so it never invalidates).
- Keys are the DOM identity that already exists: `layer.id`, `edit.id`/`summary.id`, `lut_file`, `collage.id`, `tab id`.

**Editor — proposed slots (`src/editor/view.ts` + helpers):**

```ts
// module scope — one slot per stable position
const lazyTopBar = createLazy()
const lazyToolPanel = createLazy()
const lazyCanvasStage = createLazy()
const lazyLayerDrawer = createLazy()
const lazyLutBar = createLazy()
const lazyMobileTabBar = createLazy()
const lazyHistogram = createLazy() // inside canvas-stage.ts
const lazyCompareControl = createLazy()

// keyed — one slot per entity
const lazyToolCard = createKeyedLazy() // key: LayerType
const lazyLayerRow = createKeyedLazy() // key: LayerId  (drawer rows)
const lazyLutTab = createKeyedLazy() // key: tab id ("recents" | category)
const lazyLutThumb = createKeyedLazy() // key: lut_file — already keyed in vdom but not memoized
```

Wrapping shape (benchmark / pixel-art pattern, `internal/lustre-benchmark/src/main.optimised.ts:173–219`, `examples/pixel-art/src/view/view.ts:46–50`):

```ts
// helper defined at module scope, not inside view()
const toolPanelView = (chain: readonly Layer[], catalog: Catalog|null, phase: EditorPhase, h: HtmlBuilder<EditorMessage>) =>
  h.aside(... ) // existing body, but takes slices not whole Model

// in view()
lazyToolPanel(toolPanelView, [model.chain, model.catalog, model.phase, h])
```

For keyed lists, `internal/lustre-benchmark/src/main.optimised.ts:221` and `packages/website/src/snippet/createKeyedLazyEntity.ts` show the pattern: `lazyContact(contact.id, contactView, [name, email, isSelected, h])`.

**Gallery —**

```ts
const lazyGalleryHeader = createLazy()
const lazyTile = createKeyedLazy() // key: EditSummary.id
const lazyCollageCard = createKeyedLazy() // key: Collage.id
const lazyGalleryNotice = createLazy()
```

Each `tileView(model: TileViewModel, h)` should receive only `(id, thumbnailUrl, dateLabel, selected)` — not the whole `Model` + `selection` array, otherwise `===` misses every render because `selection` is a new array on each `ToggledSelection`. Pass `isSelected: boolean` derived before the memo call.

**Collage —**

```ts
const lazyCollageHeader = createLazy()
const lazyCollageControls = createLazy() // args: [columns, gutter, frameRatio, background, mode]
const lazyCollageCell = createKeyedLazy() // key: editId or `${index}:${editId}` (index needed for drag containers)
const lazyGhost = createLazy()
```

`tileCellView` takes `framing` slice, `cellAspect`, `imageAspect`, `mode`, `dragState` — not whole `Model`. During `PanMoved` only the single active `lazyCollageCell` recomputes; others hit cache.

**Root —** wrap the submodel embed sites, exactly as `packages/website/src/page/performance.md:74` and `packages/foldkit/src/html/submodel.test.ts` recommend for parent-side memoization:

```ts
const lazyGallerySubmodel = createLazy()
const lazyEditorSubmodel = createLazy()
const lazyCollageSubmodel = createLazy()

// inside root/view.ts activeRoute()
lazyGallerySubmodel((m, route, h) => h.submodel({ slotId:'gallery', model: m, view: Gallery.view, toParentMessage: … }), [model.gallery, model.route, h])
```

Foldkit's `submodel` already keeps per-dispatch wraps; adding a parent-side lazy makes `===` on `model.*` sufficient to skip descending into the child's view at all (the benchmark's whole win).

Estimated impact: brings the 138× spike down to single-digit ms for hover/slider/zoom messages (benchmark's optimized vs unoptimized is the floor; Lutra's catalog/histogram amplification makes the real win larger).

### 4.2 Keys for every mapped list (patch perf)

Foldkit warns in `defaultSlowCallback` (`Patch` summary: "Key mapped lists by stable ids, split large views, or memoize stable subtrees").

Fix: for every `Array.map` that produces siblings under one parent, add the **stable** `h.Key(...)` or `h.keyed('tag')(key, ...)`:

- `src/gallery/view.ts:gridTiles` — `h.keyed('div')` per tile or `h.Key(summary.id)` on the tile root.
- `src/editor/layer-drawer.ts:chainRow` — `h.Key(layer.id)` (already `DataAttribute('layer-id')` but not a snabbdom key).
- `src/editor/tool-panel.ts` — `h.Key(type)` for each `toolCard`.
- `src/collage/view.ts:grid` — `h.Key(editId)` for each `tileCell`; `miniPreview` similarly.
- `src/editor/lut-bar/tab.ts` already does `h.Key(tab)` (good); `thumb.ts` already does `h.Key(entry.lut_file)` — keep.

Add `eslint: no-array-index-view-keys` (oxlint plugin) to CI — it flags index-keyed lists.

### 4.3 Keep render-only derivations out of `view` — or make them `createLazy` hits

Per `packages/website/src/page/core/slow.md:27`:

> "If a value exists only to decide what to draw, compute it from view inputs. Put an expensive, stable subtree behind `createLazy`/`createKeyedLazy`. Do not move the value into update only to avoid a View warning."

Two options; prefer #1 (memoized view) unless measurement proves the derivation itself is the bottleneck (then #2 — cache on Model).

**Histogram** (`src/editor/canvas-stage.ts:histogramOverlay`):

- Current: `for i 0..255 { max; x/y = (i/255)*W; curve.push(\`\${x},\${y}\`) }`plus two`join(' ')`string allocs **per render**. Most renders`bins` hasn't changed.
- Fix: extract `histogramSvgView(bins, h)` behind `const lazyHist = createLazy()`, args `[bins, h]`. `bins` is `Uint32Array | null` — reference only changes on `HistogramComputed`, so 99% of renders hit. That eliminates the tight loop and SVG string building from the hot path. Do not move `bins` stringification into `update`; the max/scale is render-only.

**LUT catalog grouping** (`src/editor/lut-bar/catalog.ts:groupByCategory`, `src/editor/lut-bar/bar.ts`):

- Current: `groupByCategory` (`Array.groupBy` + `Record.toEntries` + allocations) per `lutBar` render.
- Fix: either memoize via `createLazy` with `catalog` reference as arg (catalog never changes after load → hit forever), or precompute once in `update` on `CatalogLoaded` and store `catalogGroups` on `EditorModel`. Prefer the lazy path first — less model bloat. If profiler shows `groupByCategory` still >2 ms, add a cached field `catalogGroups: readonly {category, luts}[] | null` and keep `lutBar` lazy keyed on it.

**Gallery dates** (`src/gallery/view.ts:tile` → `DateTime.formatLocal`):

- Current: `Intl.DateTimeFormat` + format per tile per render (100+ formats per frame).
- Fix: precompute `shortDate: string` alongside `EditSummary` when `EditsListed`/`PhotosAdded` land, or memoize via `lazyTile` with `dateLabel` string arg (only changes when `savedAt` changes). The model cache is cheaper to fix permanently — a derived string per summary is trivial memory, avoids re-running Intl on every hover.

**Collage maps** (`src/collage/view.ts:photoMap`, `miniPreview`):

- Current: `new Map(model.photos.map(...))` per `ghost` + per card, plus `new Map(grid.data.map)` per `collageCard`.
- Fix: thread a `Map` from update (store `photoById: ReadonlyMap<EditId, CollagePhoto>` on model when `CollageLoaded`/`ThumbsMeasured`) or memoize the map builder behind a lazy slot keyed on `photos` reference. Same for `collageThumbSizes` lookup — replace `sizes.find(...)` O(n) inside inner loop with a `Map` lookup. Use `auro/search?q=collage` sizing if reused.

### 4.4 `evolve` discipline — preserve refs so lazy can hit

`createLazy` compares args with `===`. `Effect`'s `evo` (`foldkit/struct` re-export of `Struct.evolve`) copies only keys whose transform returned a new value; unchanged keys keep their ref. We already use `evo` at root — keep using it in `src/editor/update.ts` and `src/gallery/update.ts`.

Audit inline object spreads that create new refs for lazy args:

- Bad: `return [{ ...model, chain: [...model.chain, layer], phase }, …]` where `chain` is new but `catalog` ref preserved — `lazyToolPanel` with `[model.chain, model.catalog, model.phase, h]` still misses because `chain` is new (correct — it should). But a `ScaledCanvas` branch that does `{ ...model, scale, offsetX, offsetY, phase }` will create a new top-level `model` object (expected) but `model.chain` ref is preserved inside it. A `lazyLayerDrawer` keyed on `model.chain` will then hit, as desired. So the rule is: **never pass the whole `Model` into a lazy slot; pass the slice refs that the slot actually cares about**. That way a pan/zoom that touched only `scale/offset` doesn't invalidate the drawer.

- Bad anti-pattern to remove: `{ ...model, lutThumbs: { ... } }` on unrelated message — only do it on `LutThumbGenerated`.

Lint with `foldkit/oxlint-plugin: lazy-view-stable-references` (already in foldkit repo, `packages/oxlint-plugin-foldkit/test/rules/lazy-view-stable-references.test.ts`).

### 4.5 Submodel Decomposition — editor is one Model doing six jobs

`src/editor/model.ts` is 196 lines + `phase.ts`. It mixes canvas viewport, compare, histogram, LUT library, per-LUT download, save flow, export dialog, mobile sheets. Every small message invalidates every view helper even with lazy, because they share one `Model` reference (root's `h.submodel` for editor will still re-enter the child's view when `model.editor` identity changes — which it does on every `evo`).

Options:

- **A (minimal, planned for this ADR):** keep single `EditorModel` but make every editor helper a `createLazy` island keyed on its slice. Root's `h.submodel` for editor stays — the overhead is just dispatching through one editor boundary, which is cheap. This buys 90% of the win with ~30 lines of lazy wiring.

- **B (follow-up):** promote the editor's three high-churn surfaces to real foldkit Submodels (`CanvasSubmodel`, `LutBarSubmodel`, `LayerDrawerSubmodel`) composed via `Submodel.aggregate` / `Subscription.lift` so they get independent `modelToDependencies` and their own `update`. This isolates high-frequency messages (`ScaledCanvas` at 60–120 Hz, `PreviewedLut` hover, `CurvePointDragged`) to the submodel that owns them — parent editor view never runs for those messages at all. Follow `docs/adr/0009` informing convention (`informRouteChanged`) for shared `catalog` / `source.bitmap` ownership. Heavier refactor; defer until A's measurements show editor `Patch` still >8 ms.

We propose **A now, B as ADR-0035 if needed**.

### 4.6 DevTools & heavy fields

Add to `src/main.ts:Runtime.makeApplication` (respects `packages/foldkit/src/runtime/runtime.ts:DevToolsConfig`):

```ts
devTools: {
  Message: RootMessage,
  overlay,
  // High-frequency UI gestures flood history and retain large Model snapshots
  excludeFromHistory: [
    'ScaledCanvas',
    'CurvePointDragged',
    'ChangedSplitPosition',
    'PreviewedLut',
    'PanMoved',
    'WheelZoomed',
    'MovedLayerReorder',
  ],
  maxEntries: 60,            // down from 100 default — each entry stores full RootModel
  keyframeInterval: 12,      // down from 31 — cheaper jumpTo replay (more snapshots, less replay)
}
```

And `slow: { thresholdOverrides: { View: 32 } }` while profiling, or `slow: { onSlow: ctx => reportToAnalytics(ctx) }` replacing default `console.warn` via `slow.onSlow` (see `runtime.ts:SlowConfig`).

Longer term, heavy binary fields should not be in the Model snapshot that DevTools diffs:

- `source.bitmap: ImageBitmap` is opaque (not diffable) — consider `Schema.instanceOf(ImageBitmap)` with `UnknownByReference` equivalence already in `Model.ts`, else store in a `CanvasRef` managed resource.
- `attachedEdit.source: Uint8Array` (5–15 MB) is the serializable `Edit.source` bytes — keep on `EditorModel` only if save needs it synchronously; alternative is a `ManagedResource` keyed by `EditId` that loads bytes on `SaveEdit` demand. For now at least, ensure `Schema.Uint8Array` uses reference equality in `Model`'s `Equivalence` so DevTools / `modelEquivalence` doesn't walk bytes. Foldkit's overlay already uses `UnknownByReference` for `S.Unknown` exactly for this reason (`overlay.ts:UnknownByReference`).

The editor Model can also be reduced by moving `lutThumbs: Record<string, string>` (object URLs, presentation-only) and `bins: Uint32Array | null` (histogram) to view-derived caches behind lazy rather than persisted-on-model derived fields — `packages/website/src/page/performance.md:76` says cache on Model only "after `createLazy`".

### 4.7 Patch & layout

- Use CSS `contain: layout paint` on stable large containers (`toolPanel`, `layerDrawer`, `canvasStage`) to hint the browser that sibling patches don't relayout them.
- Keep `vdom.ts` dedupe in mind: "Memoized subtrees keep their fast path" (`CHANGELOG 6.0.0` entry) — sharing a single `VNode` const across positions will still be deduped now, but don't share; one lazy slot per position is the intended use.

---

## 5. Sequencing — make each step independently verifiable

**Phase 0 — Instrument (½ day).**

- Add `slow: { show: 'Always', onSlow: ctx => { console.warn(...); /* optional analytics */ } }` in dev.
- Run baseline: gallery with 200 mock edits (store seed), editor with image loaded, LUT filmstrip open, drag slider and hover thumbs; capture Performance trace.
- Confirm `grep -r createLazy packages/frontend/src` is 0 → this ADR's rationale.

**Phase 1 — Editor memoization (1–2 days, highest leverage).**

- Introduce `const lazy* = createLazy()/createKeyedLazy()` at module scope in `src/editor/view.ts`, `canvas-stage.ts`, `layer-drawer.ts`, `tool-panel.ts`, `lut-bar/bar.ts`.
- Extract module-scope view helpers per 4.1 (slices, not whole Model).
- Add `h.Key` to `layerDrawer` rows and `toolPanel` cards.
- Re-measure: hover `PreviewedLut` and slider drag must drop from >2 s to <16 ms `View`, <8 ms `Patch`. Chrome trace should show `resolveOrCache` cache-hit path (no `groupByCategory` flame).

**Phase 2 — Gallery & collage memoization (1 day).**

- `lazyTile`/`lazyCollageCard`/`lazyCollageCell`, add `h.Key` everywhere mapped; move `DateTime` formatting to `withSummaries` / `withSites`.
- Replace per-render `new Map(...)` + `find` with `Map` stored on model or lazy-built.
- Re-measure: gallery scroll + grid reflow <16 ms.

**Phase 3 — DevTools flood control (½ day).**

- Add `excludeFromHistory` + `maxEntries`/`keyframeInterval` per 4.6.
- Verify history no longer grows during slider drag, `JumpTo` near head is instant.

**Phase 4 — Polish & regression proof (½ day).**

- Run `pnpm check` (osslint + knip + tsc), `pnpm test`, and visual smoke across routes (Gallery → Editor `/edit/:id` → Collage `/collage/:id` → back).
- Re-run `lustre benchmark` harness on a foldkit TodoMVC fork that mimics Lutra's catalog size to sanity-check the pattern (optional).
- If editor `Patch` still >8 ms, promote to Phase 5.

**Phase 5 — (only if Phase 1 insufficient) Submodel decomposition.**

- Extract `CanvasSubmodel`/`LutBarSubmodel`/`LayerDrawerSubmodel` under `src/editor/*` with their own `Model/Message/update/view/subscriptions`, lifted via `Subscription.lift` and `h.submodel` in `src/editor/view.ts`. Follow `docs/adr/0009` pattern. This ADR would become ADR-0035.

Each phase yields a shippable diff; never ship a "v1" stub replacement for a later phase.

---

## 6. Risks & trade-offs

- `createKeyedLazy` never evicts (`lazy.ts:createKeyedLazy` → `Map cache`). Keys must be bounded — they are: `EditId` (store size), `LayerId` (chain length <20), `lut_file` (~300), `collageId` (<100). Do **not** key by transient values (search query, pixel coords). If later we paginate to unbounded histories, introduce an evicting variant that drops keys absent from latest render (noted in `CHANGELOG: 8d139ff`).

- Moving derivations to Model avoids view cost but adds sync burden (every branch that touches inputs must refresh the cache) — `performance.md:76` warns to prefer `createLazy` first. We follow that; Model cache only if lazy can't cover (e.g., `groupByCategory` still hot).

- Decomposing Editor into submodels adds indirection and more `Got*Message` wrapping — raises the "reduce scope only with explicit approval" bar. Phase 1 alone should be sufficient; submodels are escape hatch.

- Reducing `maxEntries` + `excludeFromHistory` hides high-frequency messages from DevTools history — acceptable, but document the excluded tags in `context.md` so debugging those gestures falls back to `console` / `onSlow` hook.

---

## 7. Open questions for review

- Do we want `slow: false` in production and `slow: { show: 'Development' }` locally, or keep `onSlow` reporting in prod? Current slow callback logs every over-budget frame; production noise may be high.
- Should `source: Uint8Array` move to a `ManagedResource` / `CanvasRef`-like service so DevTools snapshots never walk bytes? That avoids the overlay's 2 s spike at the source, rather than just filtering messages.
- Is the gallery's `grid: AsyncData<EditSummary[]>` ordering stable enough to key by `EditSummary.id` across `ListEdits` refreshes? Store contract says summaries are ordered by `savedAt` — order can change on save, but `h.Key` reorder is then correct (move, not patch).

---

## 8. References

- Foldkit view memoization: `packages/website/src/page/core/viewMemoization.md`, snippet `packages/website/src/snippet/createLazy.ts` / `createKeyedLazy.ts`, `packages/foldkit/src/html/lazy.ts:104–142`.
- Lustre benchmark optimised view: `internal/lustre-benchmark/src/main.optimised.ts:173–223`.
- Pixel-art example (stable `createLazy` slots per panel): `examples/pixel-art/src/view/view.ts:46–50`, `examples/pixel-art/src/view/canvas.ts:10`.
- Slow phases + budgets: `packages/foldkit/src/runtime/runtime.ts:__resolveSlowConfig`, `defaultSlowCallback`, `packages/website/src/page/core/slow.md:7–53`.
- Submodel / memoization interaction: `packages/foldkit/src/html/submodel.ts:submodel`, `packages/foldkit/src/html/submodel.test.ts:234–612`.
- DevTools overlay flatten + lazy: `packages/devtools/src/overlay.ts:makeView`, `buildOverlayView`, `packages/foldkit/src/devTools/*`.
- Lutra catalog (size): `packages/frontend/public/luts/film_luts.json` (300+ entries, 9 categories).

---

## 9. Acceptance criteria for this ADR's merge

- `Slow view` no longer fires for `PreviewedLut` hover, slider drag (`UpdatedDraftParam`), canvas pan/zoom (`ScaledCanvas`/`PanMoved`/`WheelZoomed`), or inspector click on a message adjacent to those.
- Gallery with 200 edits and filmstrip open stays <16 ms `View` / <8 ms `Patch` during continuous hover (measured via `slow`).
- No change to external behavior — routes, save/export, LUT download dimming, compare modes, collage framing all green; `pnpm test` passes.
