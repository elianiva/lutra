# Keyboard shortcuts: editor-scoped, machine-gated

Make the core editor loop usable without the mouse: select a layer, adjust,
toggle, remove, undo, compare.

**Status**: decided (2026-08-07 planning session); not yet implemented.

## Decisions

### D1 — The binding set

All bindings are **editor-scoped**: they dispatch `EditorMessage`s, and the
existing machine gating does the rest (no `SelectedTool`/`SelectedLayer` edge
from `Drafting` means number keys naturally do nothing mid-draft).

| Key                              | Action                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `1`–`9`, `0`                     | Select layer by drawer position — 1 = newest (top of stack)                  |
| `[` / `]`                        | Nudge the selected layer's active field (or the draft's first field) by 0.05 |
| `/`                              | Toggle visibility of the selected layer                                      |
| `Backspace` / `Delete`           | Remove the selected layer (prevents browser back-on-Backspace)               |
| `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` | Undo / redo (docs/adr/0017)                                                  |
| `\`                              | Compare flip: `Off` ↔ `Toggle` (Lightroom muscle memory)                     |
| `Enter`                          | Confirm the draft                                                            |
| `Esc`                            | Priority: LUT picker open → close it; draft active → cancel it; else nothing |

Deliberately **not** in this pass: space-to-pan, `+`/`-` zoom, per-channel
nudges, split-divider arrow keys (pointer-only; a11y follow-up).

### D2 — Wiring

`h.OnKeyDownPreventDefault((key, modifiers) => Option<Message>)` on the editor
layout root (`editor/view.ts`), returning `none` for unhandled keys and
preventing default only for handled ones (important for Backspace). The
mapping is a **pure function** — `editor/shortcuts.ts`:
`shortcut(model, key, modifiers) => Option<EditorMessage>` — unit-testable
without a DOM.

### D3 — Gating rules

1. **Dialog open**: when `model.exportDialog.isOpen`, return `none` for
   everything — Enter on a focused dialog button must not confirm a draft
   underneath (draft + dialog can coexist).
2. **Inputs**: the app has no text inputs (only range inputs, and no bound
   key has native behavior on a range) — no target check today; note it in a
   comment so a future text input doesn't silently break.
3. **Everything else is the machine's job**: `Drafting` blocks
   `SelectedLayer`/`SelectedTool`; `Empty`/`Loading`/`Error` block everything
   chain-adjacent; `UndoRequested` from `Drafting` is ignored by design
   (docs/adr/0017 D5).

### D4 — Nudge step

`[`/`]` step is **0.05** — the "meaningful nudge"; 0.01 fine steps stay on
focused-slider arrows. While `Drafting`, the nudge targets the draft's first
field (`phase.layer`, `fields[0]`); remembering the last-touched draft field
is a later refinement.

## Consequences

- Number keys on an already-selected layer just move the selection (the
  machine's `SelectedLayer` self-transition covers it) — no toggle behavior.
- Tests: table-driven `editor/shortcuts.test.ts` (key × phase × dialog state
  → expected message or `none`); machine gating already covered by
  `phase.test.ts`.
