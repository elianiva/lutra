# Keyboard shortcuts

Status: **decided** — the set below was confirmed in the planning session;
all open questions resolved. Ready to implement.

## Goal

Make the editor usable without the mouse for the core loop: select a layer,
adjust it, toggle it, remove it, undo it, compare before/after.

## Proposed set

All bindings are **editor-scoped**: they dispatch `EditorMessage`s, and the
existing machine gating does the rest (no `SelectedTool`/`SelectedLayer` edge
from `Drafting` means number keys naturally do nothing mid-draft).

| Key | Action | Message |
|---|---|---|
| `1`–`9`, `0` | Select layer by drawer position — **1 = newest (top of stack)**, matching how the drawer renders (chain index `total − n`) | `SelectedLayer({ id })` |
| `[` / `]` | Nudge by 0.05: the selected layer's active field, or — while `Drafting` — the draft's first field (focused-slider arrows already give 0.01 fine steps natively) | `UpdatedLayerParam` / `UpdatedDraftParam` |
| `/` | Toggle visibility of the selected layer | `ToggledLayerVisibility` |
| `Backspace` / `Delete` | Remove the selected layer (also prevents the browser's back-on-Backspace) | `RemovedLayer` |
| `Ctrl+Z` / `Ctrl+Shift+Z` (also `Cmd` on Mac: `metaKey`) | Undo / redo | `UndoRequested` / `RedoRequested` |
| `\` | Compare flip: `Off` ↔ `Toggle` (Lightroom's before/after muscle memory; any other mode → `Toggle`) | `ChangedCompareMode` |
| `Enter` | Confirm the draft | `ConfirmedDraft` |
| `Esc` | Cancel the draft; if the LUT picker is open, close it first | `CancelledDraft` / `ToggledLutPicker` |

**Deliberately not in this pass**: space-to-pan, `+`/`-` zoom, per-channel
nudges, arrow-key support for the split divider (pointer-only today — a11y
follow-up, noted in `05-a11y-pass.md`).

## Wiring (foldkit facts, verified)

- `h.OnKeyDownPreventDefault((key, modifiers) => Option<Message>)` exists on
  the HTML builder — one attachment on the editor layout root div
  (`editor/view.ts` `layout`), returning `Option.none()` for unhandled keys and
  preventing default only for handled ones (important for Backspace).
- `modifiers` is `{ shiftKey, ctrlKey, altKey, metaKey }` (boolean flags).
- The mapping is a **pure function** — `editor/shortcuts.ts`:
  `shortcut(model: Model, key: string, modifiers: KeyboardModifiers) => Option<EditorMessage>`
  — unit-testable without a DOM (matches the per-slice test pattern).

## Gating rules

1. **Dialog open**: when `model.exportDialog.isOpen`, return `none` for
   everything — the dialog is a submodel with its own focus and key handling;
   without this gate, Enter on a focused dialog button would also confirm a
   draft underneath (draft + dialog can coexist: the export button is enabled
   in `Drafting`).
2. **Ignore events from inputs**: the builder's keydown handlers don't receive
   the event target, but the app has no text inputs — the only form controls
   are range inputs, and none of the bound keys have native behavior on a
   range (arrows aren't bound). So no target check is needed today; note it in
   a comment so a future text input doesn't silently break.
3. **Everything else is the machine's job**: `Drafting` blocks `SelectedLayer`
   and `SelectedTool`; `Empty`/`Loading`/`Error` block everything chain-adjacent;
   `UndoRequested` from `Drafting` is ignored by design (`01-undo-redo.md` D5).

## Esc priority

Recommendation, in order: (1) LUT picker open → close it; (2) draft active →
cancel it; (3) otherwise nothing (the export dialog handles its own Esc —
verify foldkit's `Dialog` does; if not, that's a small addition to the dialog
submodel wiring in `export-dialog.ts`).

## Resolved questions

- **Q1 — the set itself.** Approved as-is (each binding maps to exactly one
  message; extend later from real usage).
- **Q2 — `[`/`]` step size.** 0.05 — the "meaningful nudge"; 0.01 fine steps
  stay on focused-slider arrows.
- **Q3 — draft nudge.** Yes: while `Drafting`, `[`/`]` nudge the draft's first
  field (`phase.layer`, `fields[0]`) via `UpdatedDraftParam`. Refinement for
  later: remember the last-touched draft field.
- **Q4 — number keys on an already-selected layer.** No toggle behavior;
  pressing a number just moves the selection (the machine's `SelectedLayer`
  self-transition already covers it).

## Tests

`editor/shortcuts.test.ts` — table-driven: each key × phase × (dialog
open/closed) maps to the expected message or `none`. Pure function, no DOM
needed. The machine's gating is already covered by `phase.test.ts`
(`unreachableStates()` / `deadTransitions()` stay asserted empty).
