# Gallery + tool panel freebies

Status: **decided** — both items resolved (inline two-step confirm; tracked
failure + caption). Ready to implement. Note: §2 (LUT tool caption) landed
as part of [11-tool-panel-cards.md](./11-tool-panel-cards.md) (docs/adr/0016) —
the caption became the LUT card's status slot. §1 (gallery delete confirm)
is still pending.

## 1. Gallery delete confirmation

### Facts (verified)

- `gallery/view.ts` tile: delete is the ✕ button (10px text glyph) in the
  bottom gradient overlay; `DeleteRequested({ id })` goes straight to the
  Edit store — **no confirmation anywhere** (no `confirm()` in the codebase).
- The ✕ sits inside the tile button (invalid nesting — fixed in
  `05-a11y-pass.md` D3; this feature builds on that restructure).

### Decided — inline two-step delete confirm (option A)

First ✕ click turns the tile into a confirm state (red confirm ✕ + cancel ✗,
rendered over the tile); second click deletes; cancel (or clicking another
tile's ✕) clears the state. No modal, on-brand (hard corners, no dialogs
outside export), and it rides the a11y restructure (`05-a11y-pass.md` D3) for
free — the ✕ becomes a sibling overlay there, and the confirm controls live in
the same overlay.

Model: gallery model gains `confirmingDelete: EditId | null`; new messages
`ToggledDeleteConfirm({ id })` and `DeleteConfirmCancelled`; the view renders
the confirm state for the confirming tile. `DeleteRequested` keeps its current
semantics (the store call) — the confirm state gates it in the view + update.

Rejected: native `confirm()` (ugly, off-brand) and no confirmation (destructive
with no trash; one-step guard is worth it).

### Tests

Gallery slice tests (`gallery/` per-slice pattern): toggling confirm state,
confirm deletes, cancel clears, delete from a different tile clears the first.

## 2. LUT tool disabled-state hint

### Facts (verified)

- `tool-panel.ts` `toolRow`: the LUT row is `disabled` until `model.catalog`
  is non-null — with no explanation; it just sits at `opacity-40`.
- `update.ts` `CatalogFailed` **swallows the failure**: `[model, [], none]` —
  the model has no record of why the catalog is missing, so the tool row
  can't distinguish "still loading" from "failed".

### Decided — LUT tool caption with tracked failure (option A)

Editor model gains `catalogError: NullOr(LutLoadError)` — set in the
`CatalogFailed` arm (currently swallows the error: `[model, [], none]`),
cleared in `CatalogLoaded` and on init (`initialModel`). The tool row
(`tool-panel.ts` `toolRow`) shows a muted caption under the LUT label:
"Loading LUTs…" while `catalog === null && !catalogError`, and "LUTs
unavailable" (`title` = error message) on failure.

Rejected: silent failure (a broken LUT library looks like an eternal spinner
— bad first impression).

### Tests

`lut-flow.test.ts` (existing LUT slice tests): `CatalogFailed` sets
`catalogError`, `CatalogLoaded` clears it; view caption logic is a pure
derivation (unit-testable like the keyboard mapper).

## Both together

~60 lines total across `gallery/model.ts`, `gallery/message.ts`,
`gallery/update.ts`, `gallery/view.ts`, `editor/model.ts`, `editor/update.ts`,
`editor/tool-panel.ts`. No engine or store changes.
