# LUT bar: bottom filmstrip picker with presentation-only preview

The LUT chooser moves out of the **layer drawer** into a dedicated bottom bar: category tabs on the left, a horizontal thumbnail filmstrip on the right, **hover to preview on the canvas, click to commit**. The LUT layer itself stays in the drawer (summary + strength slider); the bar only owns browsing.

## Why

296 LUTs across 9 categories (Instant Pro alone: 68). The drawer accordion cost two interactions per browse and its 36px list rows made scanning density terrible. Every serious color tool (DaVinci LUT Browser, Lightroom/Photomator presets, LUTScope, Cinema Grade, VSCO) converged on the same pattern: **thumbnails of the LUT applied to an image + live preview on the actual photo + click to commit**. A bottom strip puts the thumbnails directly under the canvas — the picker's whole job is "see it on _your_ photo" — and frees the drawer to stay a pure layer stack. The 500×500 square thumbnail assets were already ideal for a ~64px filmstrip.

## Decisions

### D1 — The bar replaces the drawer accordion; `lut-picker.ts` is deleted

No shims, no fallback path. The bar is the only dispatcher of `ChangedDraftLut` / `ChangedLayerLut`. The drawer's LUT rows keep the summary + strength slider and gain a chevron toggle (`ToggledLutPicker`, `aria-expanded`) that opens/closes the bar. The bar auto-opens when a LUT draft is created and auto-closes on confirm/cancel/select; selecting an existing LUT layer does **not** auto-open (canvas real estate; explicit is predictable).

### D2 — Hover preview is presentation-only model state

Hovering a thumb dispatches `PreviewedLut({ lutId })`, which sets `previewLut` in the model and re-renders. This extends the philosophy of docs/adr/0011 (compare's `PresentState`): presentation-only state lives in the model, is applied at render time, and never touches the committed chain or the phase machine. `null` (mouse leave) restores the committed look. A same-value guard skips redundant renders while scrubbing across the strip. The render coalescing machinery (`renderNow` / `renderPending` / revision re-trigger) already handles the hover-scrub burst shape — no new render machinery.

### D3 — The preview applies via `renderNow` composition, never machine steps

`renderNow` swaps the active LUT target's `lutId` at render time — the drafting LUT layer (`{ kind: 'draft' }`) or the focused chain LUT layer (`{ kind: 'layer' }`) — by composing the draft/chain arrays it hands to `RenderChain`. The machine-owned draft keeps its committed `lutId`; the chain is untouched. Belt-and-suspenders: the composition only applies when a LUT target exists, so a leaked `previewLut` can never corrupt a non-LUT render. `lutTarget(model)` is the single helper for "is there a LUT to preview/commit" — used by the view (visibility), by `PreviewedLut` (gate), and by `ToggledLutPicker` (gate).

Compare interacts for free: in Toggle/Split the before side still shows the source while the after side shows the previewed grade — comparing _while choosing_ is desirable.

### D4 — `lutPickerOpen` renamed to `lutBarOpen`

Mechanical rename (model, update, tests, docs) so the docs stay honest.

### D5 — Tabs are `'recents' | category`; no "All" tab

296 items in one strip is a miserable scroll. The Recents tab renders only when the list is non-empty; a stale `lutTab: 'recents'` (list emptied since) falls back to the first catalog category for content and highlight. Recents entries whose `lutId` vanished from the catalog are dropped at render.

### D6 — Recents: dedupe-prepend, cap 12, persisted via KeyValueStore

`lutRecents` (newest first, capped at 12) bumps only on real picks — the `catalog[0]` auto-default in `SelectedTool` never bumps. Persistence mirrors the export-settings pair exactly (`LoadLutRecents` / `SaveLutRecents`, key `'lutRecents'`, both boot arrays, missing/corrupt → `[]`), fired on every bump (localStorage is cheap).

### D7 — Save/export while a preview is active dismisses the preview first

Save and export snapshot from `model.lastRender` (thumbnail / export frame), which would otherwise capture the hovered look. While `previewLut` is set, `SaveRequested` / `SaveAsRequested` / `ExportRequested` clear the preview and re-render instead of acting; the next click proceeds. One swallowed click in a rare case beats silently exporting a look the chain doesn't contain.

### D8 — One live name line instead of per-thumb labels

The bar shows the hovered entry's name + category while hovering, else the target's current LUT — live, no tooltip latency (native tooltips are slow and a11y-hostile; `title` stays as backup on the thumbs).

### D9 — Bar open/close lifecycle

Auto-open on LUT draft creation; auto-close on confirm/cancel/select; chevron on the drawer LUT row toggles manually. `previewLut` is cleared at every bar-closing transition (`SelectedTool` new-draft, `ConfirmedDraft`, `CancelledDraft`, `SelectedLayer`, `RemovedLayer`, `ClearedImage`, `EditLoaded`, `ToggledLutPicker` closing) — a stale preview must never leak into an unrelated render, and the `renderNow` target check backstops any missed site.

### D10 — Keyboard scrub is deliberately deferred

Arrow-key strip scrubbing needs `OnKeyDownPreventDefault` with event-target gating (docs/adr/0018, unimplemented — a root-level ←/→ handler would fight the range sliders' native arrow behavior). When 0018 lands, add: ←/→ move a "hover" index, Enter commits. The mouse path is complete without it.

## Layout

The bar renders as a third child of the editor's `flex-col` in `view.ts` (full-width, `border-t`): a `w-24` tab column on the left (Recents + the catalog categories with counts, active tab highlighted with `aria-pressed`), and on the right a slim name line above a 64px-square thumbnail filmstrip (`overflow-x-auto`, lazy `img`s). The current LUT of the active target gets the accent border. Wheel scrolls the strip horizontally via a one-shot `LutStripWheel` mount (deltaMode normalization copied from `PanZoom`; ack message for DevTools/Scene observability like `CanvasRegistered`). Canvas shrinks while the bar is open; the stage's `ResizeObserver` re-fits only while untouched — same as today.

## Consequences

- The drawer is a pure layer stack again; LUT rows are summary + slider + chevron.
- Hover preview cost is one render per hovered thumb, coalesced like slider drags; the committed chain/draft is never mutated by browsing.
- Recents persist across sessions and are the fastest path back to frequently used looks.
- Save/export while hovering swallows one click (rare, deliberate).
- The bar's height (~110px with the name line) is a first pass; the name line can overlay the strip instead of adding a row if it feels tall on small windows. Thumb size 64px is the default; 72px is the fallback if it feels small.
