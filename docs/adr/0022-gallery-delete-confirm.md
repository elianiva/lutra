# Gallery delete confirmation: inline two-step

The gallery tile's ✕ deletes straight to the **Edit store** with no
confirmation. Make it a two-step inline confirm.

**Status**: partially superseded (see "Supersession", 2026-08-22). The
collage-card half was implemented as decided; the edit-tile half shipped as a
modal dialog instead of the inline two-step.

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

## Supersession (2026-08-22)

D1/D2 were written before either half was built. What actually shipped:

- **Collage cards** keep D1's inline two-step confirm exactly as decided
  (`confirmingCollageDelete`, `ToggledCollageDeleteConfirm`,
  `CollageDeleteConfirmCancelled`) — implemented earlier.
- **Edit tiles** use a **modal confirmation dialog** instead of the inline
  state: a `@foldkit/ui` Dialog submodel (`deleteDialog: Dialog.Model`) plus
  `pendingDelete: EditId | null`. The tile ✕ sends
  `DeleteConfirmRequested`; confirming sends `DeleteRequested`
  (store-call semantics preserved from D2); every dismissal path (Cancel,
  Esc, backdrop) arrives as `RequestedClose` and also clears
  `pendingDelete`. The native `confirm()` ban stands — this is an in-app
  dialog.

Rationale for the split: image deletion is destructive and irreversible, and
a modal makes the cost explicit; collage deletion stays inline since it is
recoverable-by-recreation (composition by reference, docs/adr/0030).

## Context

The sibling decision from the same planning session — the LUT tool's
disabled-state caption with tracked failure — was **absorbed** into the tool
panel cards (docs/adr/0016 D4). Only the delete confirm is pending here.
That pending item is now resolved as described above.

## Consequences

- ```40 lines across `gallery/model.ts`, `message.ts`, `update.ts`,
  `view.ts`~~ Realized as: collage inline confirm (shipped) + edit-tile
  dialog (`gallery/delete-dialog.ts`, model/message/update arms).
  ```

  ```
- Tests (gallery per-slice pattern): toggling confirm state, confirm deletes,
  cancel clears, delete from a different tile clears the first — covered for
  collages in `collage-section.test.ts`; the dialog paths are covered in
  `delete-dialog.test.ts`.
