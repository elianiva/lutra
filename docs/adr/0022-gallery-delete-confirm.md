# Gallery delete confirmation: inline two-step

The gallery tile's ✕ deletes straight to the **Edit store** with no
confirmation. Make it a two-step inline confirm.

**Status**: decided (2026-08-07 planning session); not yet implemented.

## Decisions

### D1 — Inline two-step confirm; no modal, no `confirm()`

First ✕ click turns the tile into a confirm state (red confirm ✕ + cancel ✗,
rendered over the tile); the second click deletes; cancel — or clicking
another tile's ✕ — clears the state. No native `confirm()` (ugly, off-brand),
no unguarded delete (destructive with no trash; a one-step guard is worth
it). Rides the a11y tile restructure (docs/adr/0021 D3) for free: the ✕
becomes a sibling overlay there, and the confirm controls live in the same
overlay.

### D2 — Model shape

Gallery model gains `confirmingDelete: EditId | null`; new messages
`ToggledDeleteConfirm({ id })` and `DeleteConfirmCancelled`. `DeleteRequested`
keeps its current semantics (the store call) — the confirm state gates it in
the view + update.

## Context

The sibling decision from the same planning session — the LUT tool's
disabled-state caption with tracked failure — was **absorbed** into the tool
panel cards (docs/adr/0016 D4). Only the delete confirm is pending here.

## Consequences

- ~40 lines across `gallery/model.ts`, `message.ts`, `update.ts`, `view.ts`.
- Tests (gallery per-slice pattern): toggling confirm state, confirm deletes,
  cancel clears, delete from a different tile clears the first.
