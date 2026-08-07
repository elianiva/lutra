# Undo / redo

Status: **decided** — the design below was grilled and agreed; all open items
resolved. Ready to implement.

## Goal

Revert committed chain changes: add layer, remove layer, reorder, visibility
toggle, LUT pick, and finished slider adjustments. One undo step per *gesture*,
never per slider tick.

## Decisions made

### D1 — Snapshot stack, not command log

`history: { past: Array<Layer[]>, future: Array<Layer[]>, pending: Layer[] | null }`
in the editor model (`packages/frontend/src/editor/model.ts`). Each undoable op
pushes a **deep copy of the chain before the change**; undo pops the top of
`past` into the chain and pushes the current chain onto `future`; redo mirrors
it. Layers are plain JSON (Schema structs) so a snapshot is a few hundred bytes
at most — no dedup, no inverse-op bookkeeping, no interplay with the phase
machine.

- Cap `past`/`future` at **100 entries** (drop oldest on overflow).
- **Session-only**: never persisted into the Edit. `ClearedImage`,
  `ImageDecoded`, and `EditLoaded` reset the whole stack.
- `pending` holds the pre-drag chain during a slider gesture (D3).

### D2 — What pushes

Every **committed** chain mutation in `update.ts` (the same arms that call
`renderNow`), pushing the *pre-mutation* chain:

| Message | update.ts arm |
|---|---|
| `ConfirmedDraft` | push, then `chain: [...chain, from.layer]` |
| `RemovedLayer` | push, then filter |
| `ReorderedLayer` | push (skip when `from === to`) |
| `ToggledLayerVisibility` | push, then map |
| `ChangedLayerLut` | push, then map |
| `UpdatedLayerParam` **on release** | see D3 |

Draft param tweaks never push — the draft is still transactional; only its
confirm is undoable. Each push also clears `future` (a new mutation invalidates
the redo branch) and clears `pending` (a committed op supersedes an in-flight
drag).

### D3 — Slider drags: capture at start, commit at release

`input` fires per tick; `change` fires on release. To make undo restore the
*pre-drag* value:

- **Capture**: the `sliderControl` input in `layer-drawer.ts` gains
  `h.OnPointerDown` → `StartedLayerDrag({ id, field })` and
  `h.OnKeyDown` → `StartedLayerDrag(...)` (keyboard arrows have no pointerdown;
  the keydown fires before the native value change). The handler stores the
  current chain into `history.pending`.
- **Commit**: `h.OnChange` (foldkit has it; fires on release, and per arrow
  press — each arrow press is one undo step, matching Lightroom) →
  `EndedLayerDrag({ id, field })`. If the current chain differs from
  `history.pending`, push `pending` onto `past`, clear `future`. If equal
  (click without a move), discard.
- A change event with no `pending` is a no-op (defensive; pointerdown/keydown
  always precede change in practice).

**Undo while a drag is in flight** (`pending !== null`): `UndoRequested`
reverts the chain to `pending` and clears it — the in-flight drag is treated as
uncommitted, and the controlled `h.Value` re-render snaps the thumb back. The
drag's later `change` event then finds no `pending` and is ignored.

### D4 — Dirty state derives from the stack

New model field `savedChain: Layer[]` — the chain as of the last successful
save / load / new image:

- `EditSaved` → `savedChain = chain` at save time.
- `EditLoaded` / `ImageDecoded` → `savedChain = loaded chain` / `[]`.
- `ClearedImage` → `savedChain = []`.

`dirty = !chainEqual(model.chain, model.savedChain)` — undo back to the saved
state clears dirty automatically; no separate bookkeeping. `chainEqual` is a
tiny structural compare (see O2). See `04-navigation-and-dirty-state.md` for
the UI.

### D5 — Undo/redo are data branches, not machine edges

The phase machine does **not** get undo edges. Rationale: `UpdatedLayerParam`,
`ReorderedLayer`, `ToggledLayerVisibility`, `ChangedLayerLut` are already pure
data branches in `update.ts` that "ignore the machine result and just carry the
(unchanged) phase forward" — undo/redo are the same shape, and the machine
cannot make the survive-vanish call anyway (machine guards only see state +
message, and the chain is model data).

Phase rules in the `UndoRequested` / `RedoRequested` handlers:

- `Idle` / `Selected`: apply the pop, then `renderNow`.
- `Drafting`: **ignore** — a draft is uncommitted and has no history entry;
  `Esc` cancels it (02-keyboard-shortcuts.md).
- `Empty` / `Loading` / `Error`: ignore.
- **Selection after restore**: if the phase was `Selected` and the restored
  chain still contains `phase.layerId`, stay `Selected`; otherwise set
  `phase = Idle()`. While we're at it, prune `activeFieldIndex` entries whose
  layer id vanished (same cleanup `RemovedLayer` does).

### D6 — Redo included

`RedoRequested` pops `future`. Nearly free once the stack exists.

### D7 — Saves do not clear the stack

`EditSaved` leaves `past`/`future` untouched (decided; the only reset points are
`ClearedImage`, `ImageDecoded`, and `EditLoaded`). Undoing past a save is
harmless — the gallery copy is untouched until the next Save — and users expect
Ctrl+Z to keep working after saving.

### D8 — `chainEqual` is `JSON.stringify` comparison

Layers are schema-built structs with stable key order, so stringify is a
faithful deep-equal for this shape (decided; no hand-rolled compare needed).

## Resolved questions

- **O1 — save clears the stack?** → **No** (D7).
- **O2 — `chainEqual` implementation.** → `JSON.stringify` (D8).

## Implementation sketch

- `model.ts`: `history` + `savedChain` fields, both `Schema.Array(Layer)`-based;
  init in `initialModel`.
- `message.ts`: `UndoRequested`, `RedoRequested`, `StartedLayerDrag { id,
  field }`, `EndedLayerDrag { id, field }` — add all four to `EditorMessage`.
- `update.ts`: new arms per D2/D3/D5; a small `pushHistory(model)` / `popHistory`
  helper pair; the `RemovedLayer` arm's field-index cleanup pattern reused in
  the undo arm.
- `layer-drawer.ts`: `sliderControl` gains the three handler props (D3). It is
  shared by draft and committed sliders — draft sliders must **not** dispatch
  `StartedLayerDrag` (draft params are machine state, not chain; `pending`
  would go stale). Gate on a `committed: boolean` prop.
- `view.ts`: top-bar Save button gets the dirty dot (04).
- Tests: new `editor/undo-flow.test.ts` following the per-slice pattern
  (`reorder.test.ts`, `save-edit.test.ts`): push on each op, drag capture/commit
  (unchanged drag pushes nothing), redo invalidation on new op, undo restores
  pre-drag value, selection survive/vanish, stack cap, dirty derivation across
  save/undo.

## Out of scope (visual polish, next pass)

Motion, histogram RGB/upgrade, LUT picker search, image info in the editor —
see `docs/plans/README.md`.
