# LUT bar (bottom filmstrip picker)

Status: **Implemented** (2026-08-07) — see docs/adr/0012. Decided in the planning session; ready to implement.

## Goal

Replace the inline accordion LUT picker in the **layer drawer** with a dedicated
**bottom bar**: category tabs on the left, a horizontal thumbnail filmstrip on
the right, **hover to preview on the canvas, click to commit**. The LUT layer
itself stays in the drawer (summary + strength slider) — the bar only owns
browsing.

## Why (summary of the research + session)

- 296 LUTs across 9 categories (Instant Pro alone: 68). The accordion costs two
  interactions per browse and the 36px list rows make scanning density
  terrible.
- Every serious color tool (DaVinci LUT Browser, Lightroom/Photomator presets,
  LUTScope, Cinema Grade, VSCO) converged on the same pattern: **thumbnails of
  the LUT applied to an image + live preview on the actual photo + click to
  commit**. Cinema Grade's pitch says it best: "realtime previews … as
  thumbnails instead of as black boxes from a dropdown list".
- A bottom strip puts the thumbnails directly under the canvas — the picker's
  whole job is "see it on *your* photo" — and frees the drawer to stay a pure
  layer stack.
- The 500×500 square thumbnail assets are already ideal for a ~64px filmstrip.

## Current state (verified facts)

- `lutPicker` renders inside `layer-drawer.ts` in two places: the LUT **draft
  row** (dispatch `ChangedDraftLut`) and the **selected chain row** (dispatch
  `ChangedLayerLut`). `lutPickerOpen` in the model gates expansion; the selector
  row doubles as the toggle (`ToggledLutPicker`).
- `ToggledLutPicker` is gated to LUT draft / selected LUT layer; `SelectedTool`
  (lut) auto-opens the picker; `ConfirmedDraft` / `CancelledDraft` /
  `SelectedLayer` close it.
- The render pipeline already coalesces bursts: `renderNow` bumps `revision` and
  sets `renderPending`; an in-flight render re-triggers with the newest state
  when it completes (the slider-drag path). Hover scrubbing is the same shape
  as slider dragging — **no new render machinery needed**.
- Compare (`docs/adr/0011`) established the precedent for **presentation-only
  state living in the model** (`PresentState`, `previewLut` follows it).
- foldkit facts: `h.OnMouseEnter` / `h.OnMouseLeave` exist on the builder
  (hover needs no mount). Wheel-to-horizontal needs a small one-shot mount
  (precedent: `PanZoom`, `CompareDivider` in `canvas-stage.ts`). There is no
  keyboard infra yet (`OnKeyDownPreventDefault` is documented in plan 02 but
  unimplemented).
- Persistence precedent: `LoadExportSettings` / `SaveExportSettings` commands +
  `KeyValueStore` (`command.ts:484`), boot arrays in `init.ts:28` and
  `inform-route-changed.ts:33`, storage key `'exportSettings'`.

## Layout

```
+--------------------------------------------------+
| topBar                                            |
+--------+---------------------------+-------------+
| tool   | canvas (image)            | layer       |
| panel  |                           | drawer      |
|        |                           |  ▸ LUT  row:|
|        |                           |  name · 65% |
+--------+---------------------------+-------------+
| LUTs   | Kodak 2393 · Print          [name line] |
| Recents| [] [] [] [] [] [] [] [] []              |
| Print  | 64px thumbs, hover = preview,            |
| Bw     | click = commit, wheel = scroll           |
+--------+-----------------------------------------+
```

- **Left column** (`w-24`): `Recents` tab (only when non-empty) + the 9 catalog
  categories with counts. Active tab highlighted, `aria-pressed`.
- **Right column**: a slim name line (hovered or selected LUT name + category —
  replaces native tooltips, which are slow and a11y-hostile; `title` stays as
  backup) above the filmstrip.
- **Filmstrip**: `overflow-x-auto` row of 64px square thumbs; the current LUT
  of the active target gets the accent border; wheel scrolls horizontally via a
  `LutStripWheel` mount (deltaMode normalization copied from `PanZoom`).
- The bar renders as a third child of the editor's `flex-col` in `view.ts`
  (`h-16` thumbs + name line + padding ⇒ ≈ 110px when open). Canvas shrinks;
  the stage's `ResizeObserver` re-fits only while untouched — same as today's
  behavior, nothing to change.

## Visibility rule

The bar renders only when a **LUT target** exists:

```ts
type LutTarget =
  | { kind: 'draft' }                              // Drafting with a lut layer
  | { kind: 'layer'; id: LayerId }                 // Selected with a lut layer
  | null
```

(`lutTarget(model)` helper — used by the view to render, by update to gate
`PreviewedLut`, and by `ToggledLutPicker`; extracted from the inline checks
that exist today in `update.ts`.)

Visibility = `lutBarOpen && catalog !== null && lutTarget(model) !== null`.
The drawer's LUT rows keep the summary + sliders; the accordion picker is
deleted.

## Model changes (`model.ts`)

```ts
// Renamed: "Whether the bottom LUT bar is open." (was lutPickerOpen)
lutBarOpen: Schema.Boolean,
// Hover preview: the lutId hovered in the bar. Presentation-only, applied at
// render time to the active LUT target — never touches the chain or machine
// (docs/adr/0011 spirit). Cleared on every bar-closing transition.
previewLut: Schema.NullOr(LutIdSchema),
// Active tab: 'recents' or a catalog category name.
lutTab: Schema.Union([Schema.Literal('recents'), Schema.String]),
// Most-recently-applied lutIds, newest first, capped at 12, persisted.
lutRecents: Schema.Array(LutIdSchema),
```

Rename is mechanical (model.ts, update.ts, lut-flow.test.ts, plus the
`lutPickerOpen` comment in model.ts). `initialModel`: `lutBarOpen: false`,
`previewLut: null`, `lutTab: 'recents'`, `lutRecents: []`.

## Messages (`message.ts`)

```ts
// Hover enter/leave on a bar thumb. Presentation-only: sets previewLut and
// re-renders; the committed chain/draft is untouched.
export const PreviewedLut = Message.m('PreviewedLut', { lutId: S.NullOr(LutIdSchema) })
// Click on a category tab (or Recents).
export const SelectedLutTab = Message.m('SelectedLutTab', { tab: S.Union([S.Literal('recents'), S.String]) })
// Recents restored from localStorage (boot-time, mirrors ExportSettingsLoaded).
export const LutRecentsLoaded = Message.m('LutRecentsLoaded', { recents: S.Array(LutIdSchema) })
// Ack for SaveLutRecents (observability, mirrors ExportSettingsSaved).
export const LutRecentsSaved = Message.m('LutRecentsSaved')
```

`ChangedDraftLut` / `ChangedLayerLut` stay — they're the bar's commit messages,
and the bar is now their only dispatcher.

## Update handlers (`update.ts`)

1. **`PreviewedLut`** — `if (!model.source.bitmap) ignore` (mirror
   `ChangedCompareMode`); `if (model.previewLut === message.lutId) return
   unchanged` (scrub guard — no redundant renders); otherwise set `previewLut`
   and `renderNow`. `null` restores the committed look (also `renderNow`).
2. **`SelectedLutTab`** — set `lutTab`; presentation-only, no render.
3. **`LutRecentsLoaded`** — seed `lutRecents`.
4. **`ChangedDraftLut`** / **`ChangedLayerLut`** — existing behavior, plus:
   clear `previewLut` (the click commits the real value; a stale preview would
   otherwise double-apply), bump recents (`bumpRecents`: dedupe → prepend →
   cap 12), dispatch `SaveLutRecents({ recents })`.
5. **Clear `previewLut` at every bar-closing transition** (the careful part —
   a stale preview must never leak into an unrelated render):
   `SelectedTool` (new draft context), `ConfirmedDraft`, `CancelledDraft`,
   `SelectedLayer`, `RemovedLayer`, `ClearedImage`, `EditLoaded`, and
   `ToggledLutPicker` when closing. Belt-and-suspenders: `renderNow` only
   applies `previewLut` when a LUT target exists (below), so a leaked value can
   never corrupt a non-LUT render.
6. **Persistence-during-preview rule** (D7): `SaveRequested` /
   `SaveAsRequested` / `ExportRequested` while `previewLut` is set **dismiss
   the preview instead of acting** — clear `previewLut` + `renderNow`, return
   without saving/opening; the next click proceeds. Rationale: save and export
   snapshot from `model.lastRender` (thumbnail / export frame), which would
   otherwise capture the hovered look. One swallowed click in a rare case beats
   silently exporting a look the chain doesn't contain.

### `renderNow` composition

```ts
const draft = model.phase._tag === 'Drafting' ? model.phase.layer : null
let layers = model.chain
let draftLayer = draft
if (model.previewLut) {
  if (draft?.type === 'lut') draftLayer = { ...draft, lutId: model.previewLut }
  else if (model.phase._tag === 'Selected') {
    const sel = layers.find((l) => l.id === model.phase.layerId)
    if (sel?.type === 'lut') layers = layers.map((l) =>
      l.id === sel.id ? { ...l, lutId: model.previewLut } : l)
  }
}
RenderChain({ layers, draft: draftLayer, ... }) // unchanged otherwise
```

No interaction with compare: in Toggle/Split the before side still shows the
source; the after side shows the previewed grade — comparing *while choosing*
is desirable and free.

## Commands (`command.ts`)

Mirror the export-settings pair exactly (`command.ts:484`):
`LoadLutRecents` (boot, key `'lutRecents'`, missing/corrupt → `[]`) and
`SaveLutRecents` (fire on every bump; localStorage is cheap). Add
`LoadLutRecents()` to both boot arrays (`init.ts:28`, `inform-route-changed.ts:33`)
next to `LoadExportSettings()`.

## Bar view (`lut-bar.ts`, new file)

- `lutTarget(model)` helper (see Visibility rule).
- `lutBar(h, model)` → `null` unless visible. Left tab column (Recents tab only
  when `lutRecents.length > 0`; when `lutTab === 'recents'` and recents are
  empty, the render falls back to the first catalog category for content and
  highlight). Right column: name line + filmstrip.
- Thumb button: `h-16 w-16` square, `rounded border object-cover`, lazy-loaded
  img, `title` tooltip, `OnMouseEnter` → `PreviewedLut({ lutId })`,
  `OnMouseLeave` → `PreviewedLut({ lutId: null })`, `OnClick` → commit
  (`ChangedDraftLut` / `ChangedLayerLut` per target kind), accent border when
  the target's current lutId matches.
- Recents tab content resolves lutIds against the catalog; entries whose lutId
  vanished from the catalog are dropped at render.
- `LutStripWheel`: one-shot mount on the filmstrip (precedent `RegisterCanvas`;
  same ack-message pattern for DevTools observability). Normalizes
  `deltaMode` exactly like `PanZoom` and does `el.scrollLeft += delta`.
- Name line shows the hovered entry's name while hovering, else the target's
  current LUT name (live, no tooltip latency; fixes the a11y gap too).

## Drawer changes (`layer-drawer.ts`)

- Delete both `lutPicker` call sites and the import. LUT draft row keeps
  label + strength slider; LUT chain row keeps summary + slider.
- Add a chevron button (`ChevronDown`/`ChevronUp`, dispatch `ToggledLutPicker`,
  `aria-expanded={lutBarOpen}`) on LUT rows — draft row header (before the
  confirm/cancel cluster) and chain row (next to the reorder/delete cluster),
  following the existing nested-button pattern (visibility/reorder/delete
  buttons already live inside the row's clickable div).
- `lut-picker.ts` is **deleted** (clean cutover — no shims).

## Keyboard: deliberately deferred

Arrow-key strip scrubbing needs `OnKeyDownPreventDefault`, which is
documented in plan 02 but unimplemented, and plan 02 already notes the builder
doesn't give the event target — a root-level ←/→ handler would fight the
range sliders' native arrow behavior. When plan 02 lands with target gating,
add: ←/→ move a "hover" index, Enter commits. Noted as a follow-up; the mouse
path is complete without it.

## Decisions

| # | Decision |
|---|----------|
| D1 | Bottom bar (tabs + filmstrip) replaces the drawer accordion; `lut-picker.ts` deleted. |
| D2 | Hover = `PreviewedLut` (presentation-only model state), click = existing commit messages; same-value guard skips redundant renders. |
| D3 | Preview applies to the **draft** and to the **focused chain LUT layer** alike, via `renderNow` composition — never via machine steps (the draft's lutId stays machine-owned). |
| D4 | `lutPickerOpen` → `lutBarOpen` rename (docs stay honest; mechanical). |
| D5 | Tab = `'recents' \| category`; no "All" tab (296 items in one strip is a miserable scroll); recents tab hidden when empty, with first-category fallback. |
| D6 | Recents: dedupe-prepend, cap 12, persisted via `KeyValueStore` mirroring export settings, bumped only by real picks (the `catalog[0]` auto-default in `SelectedTool` never bumps). |
| D7 | Save/Export while a preview is active dismisses the preview first (one swallowed click) — never snapshots the hovered look. |
| D8 | Labels: one live name line in the bar (hovered/selected), `title` tooltip as backup — no label under every thumb. |
| D9 | Bar opens/closes: auto-open on LUT draft creation, auto-close on confirm/cancel/select, chevron on the drawer LUT row toggles manually. Selecting a LUT layer does **not** auto-open (canvas real estate; explicit is predictable). |
| D10 | Keyboard scrub deferred to plan 02 (needs event-target gating infra). |

## Files

| File | Change |
|------|--------|
| `editor/message.ts` | +`PreviewedLut`, +`SelectedLutTab`, +`LutRecentsLoaded`, +`LutRecentsSaved` |
| `editor/model.ts` | rename `lutBarOpen`; +`previewLut`, +`lutTab`, +`lutRecents` |
| `editor/command.ts` | +`LoadLutRecents`, +`SaveLutRecents` (mirror export-settings pair, key `'lutRecents'`) |
| `editor/init.ts`, `editor/inform-route-changed.ts` | add `LoadLutRecents()` to boot arrays |
| `editor/update.ts` | new handlers; clear sites; recents bump; `renderNow` composition; dismiss rule in save/export |
| `editor/lut-bar.ts` (new) | bar view + `LutStripWheel` mount + `lutTarget` helper |
| `editor/view.ts` | render `lutBar` as third flex-col child |
| `editor/layer-drawer.ts` | remove picker; chevron toggle on LUT rows |
| `editor/lut-picker.ts` | **deleted** |
| `editor/lut-flow.test.ts` | update + new cases (below) |
| `editor/attach-edit.test.ts` | extend boot-command assertion with `LoadLutRecents` |
| `CONTEXT.md` | update **LUT picker** entry, **Editor phase machine** bullet ("LUT picker expansion"), layout description, glossary "LUT library" |
| `docs/adr/0012-lut-bar.md` | written after implementation: presentation-only preview state (extends adr/0011's philosophy), recents persistence, layout change |

## Tests

Update `lut-flow.test.ts` (rename `lutPickerOpen` → `lutBarOpen`; existing
draft/confirm/toggle assertions stay) and add, in the same file:

- `PreviewedLut` sets `previewLut` and dispatches `RenderChain` whose
  `draft.lutId` is the previewed id (assert via the
  `commands.find((c) => c.name === 'RenderChain')` style used in
  `compare-flow.test.ts`).
- `PreviewedLut(null)` restores the committed lutId; same-value hover does not
  bump `revision`; no-op without an image; no-op when no LUT target exists.
- Preview on a **selected chain layer**: `RenderChain` carries the swapped
  layer, `model.chain` is untouched.
- `SelectedLutTab` sets `lutTab`.
- Commit via bar: `ChangedLayerLut` / `ChangedDraftLut` clear `previewLut`,
  bump recents (dedupe, cap 12), and dispatch `SaveLutRecents`.
- `SelectedTool` (lut) does **not** bump recents; `lutBarOpen` true.
- Every bar-closing transition clears `previewLut` (parametrized).
- Dismiss rule: `SaveRequested` / `ExportRequested` with `previewLut` set clear
  it and dispatch no save/open; second dispatch proceeds.
- `LutRecentsLoaded` seeds; recents tab render falls back to first category
  when empty (scene-level, see below).
- Scene-level (foldkit `scene`, style of `compare-flow.test.ts`): bar renders
  tabs + thumbs for a draft and for a selected LUT layer; hover dispatch;
  click commits; chevron toggles `lutBarOpen`.

## Open questions

All resolved above; two left as judgment calls for the implementer (defaults
noted, both low-risk to change later):

1. Thumb size 64px vs 72px — 64 default; tune after seeing it on screen.
2. Bar height (~110px with name line) — if it feels tall on small windows, the
   name line can overlay the strip instead of adding a row.
