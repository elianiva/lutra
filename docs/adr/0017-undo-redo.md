# Undo / redo: snapshot stack, not a command log

Revert committed chain changes — add layer, remove, reorder, visibility toggle,
LUT pick, finished slider adjustments. One undo step per *gesture*, never per
slider tick.

**Status**: decided (2026-08-07 planning session); not yet implemented.

## Decisions

### D1 — Snapshot stack in the editor model

`history: { past: Layer[][], future: Layer[][], pending: Layer[] | null }`.
Each undoable op pushes a **deep copy of the chain before the change**; undo
pops `past` into the chain and pushes the current chain onto `future`; redo
mirrors it. Layers are plain JSON (Schema structs), so a snapshot is a few
hundred bytes — no dedup, no inverse-op bookkeeping, no interplay with the
phase machine.

- Cap `past`/`future` at 100 (drop oldest).
- **Session-only**: `ClearedImage`, `ImageDecoded`, `EditLoaded` reset the
  whole stack. Never persisted into the Edit.
- `pending` holds the pre-drag chain during a slider gesture (D3).

### D2 — What pushes

Every **committed** chain mutation in `update.ts` (the arms that call
`renderNow`), pushing the *pre-mutation* chain: `ConfirmedDraft`,
`RemovedLayer`, `ReorderedLayer` (skip when `from === to`),
`ToggledLayerVisibility`, `ChangedLayerLut`, and `UpdatedLayerParam` on
release (D3). Draft param tweaks never push — the draft is still
transactional; only its confirm is undoable. Each push clears `future` (a new
mutation invalidates the redo branch) and clears `pending`.

### D3 — Slider drags: capture at start, commit at release

`input` fires per tick, `change` on release; undo must restore the *pre-drag*
value. `StartedLayerDrag` fires on pointerdown/keydown and stores the chain in
`history.pending`; `EndedLayerDrag` on `change` pushes `pending` if the chain
changed (click without a move discards). Draft sliders never dispatch
`StartedLayerDrag` (gated on a `committed` prop — draft params are machine
state, not chain). Undo while a drag is in flight reverts to `pending` and
clears it; the drag's later `change` finds no `pending` and is ignored.

### D4 — Dirty state derives from the stack

`savedChain: Layer[]` — the chain as of the last successful save/load/new
image (`EditSaved` → chain at save time; `EditLoaded`/`ImageDecoded` →
loaded/empty; `ClearedImage` → `[]`). `dirty = !chainEqual(chain,
savedChain)`; undo back to the saved state clears dirty automatically. The UI
lives in docs/adr/0020.

### D5 — Undo/redo are data branches, not machine edges

The phase machine gets **no** undo edges: the affected messages are already
pure data branches that carry the phase forward, and machine guards can't see
model data. Phase rules: `Idle`/`Selected` apply the pop then `renderNow`;
`Drafting` ignores (a draft has no history entry; `Esc` cancels it);
`Empty`/`Loading`/`Error` ignore. After a restore from `Selected`, stay
`Selected` only if the restored chain still contains `phase.layerId`, else
fall back to `Idle` (and prune orphaned `activeFieldIndex` entries, the same
cleanup `RemovedLayer` does).

### D6 — Redo included

`RedoRequested` pops `future` — nearly free once the stack exists.

### D7 — Saves do not clear the stack

Undoing past a save is harmless (the gallery copy is untouched until the next
save) and users expect Ctrl+Z to keep working after saving.

### D8 — `chainEqual` is `JSON.stringify` comparison

Schema-built structs have stable key order, so stringify is a faithful
deep-equal for this shape. No hand-rolled compare.

## Consequences

- New messages: `UndoRequested`, `RedoRequested`, `StartedLayerDrag`,
  `EndedLayerDrag`; `sliderControl` gains three handler props.
- Memory: bounded at 100 snapshots; a few hundred bytes each.
- Test surface: new `undo-flow.test.ts` following the per-slice pattern.
