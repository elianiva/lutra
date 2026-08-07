# Back navigation + dirty state

Status: **decided** — all questions resolved. Ready to implement.

## Goal

Two top-bar improvements:

1. **Back to the gallery** — the editor (`/edit/:id`) is currently a dead end:
   the only way back is the browser back button. The top bar shows LUTRA
   (an `h1`, not a link) + Save / Save as / Export / New.
2. **Unsaved-changes indicator** — the top bar shows "Saved h:mm" after a save
   but nothing signals that the chain has diverged from the last saved state.

## Facts (verified)

- The wordmark is `h.h1` in `editor/top-bar.ts`; the editor surfaces facts to
  the root via `EditorOutMessage` (today: only `EditCreated`), and the root
  owns navigation — `root/update.ts` reacts to `EditCreated` by pushing
  `/edit/:id` via the `NavigateToEdit` command (`pushUrl` from
  `foldkit/navigation`).
- `EditSaved { id, savedAt }` is where the last-saved chain can be captured
  (the arm already runs on every successful save).
- `ClearedImage`, `ImageDecoded`, `EditLoaded` are the chain-resetting arms
  (they already reset `saveStatus` / `attachedEdit` etc.).

## Recommended design

### D1 — Wordmark becomes the back affordance

- LUTRA stays visually identical but becomes a `h.button` with
  `aria-label="Back to gallery"`. The visible `h1` goes away (resolved): the
  document `<title>` names the app, the gallery keeps its own h1, and the
  wordmark is a navigation control, not a page heading.
- New editor OutMessage `BackToGallery` (extend `EditorOutMessage` union in
  `editor/message.ts`); `root/update.ts` gains a `NavigateToGallery` command
  mirroring `NavigateToEdit` (`pushUrl('/')`), wired in the `GotEditorMessage`
  arm alongside the existing `EditCreated` handling.
- Rationale: wordmark = home is a universal convention; no new chrome in an
  already-crowded bar. Nothing in the app relies on the top-bar h1.

### D2 — Dirty dot on Save

- Model field `savedChain: Layer[]` (defined in `01-undo-redo.md` D4 — this
  feature shares it; implement both together or land 01 first).
- `dirty = !chainEqual(chain, savedChain)` — derived, no separate flag.
- UI: a small accent dot before/on the Save button when dirty, plus
  `title="Unsaved changes"`. The "Saved h:mm" text stays as-is. When a save
  lands, the dot disappears automatically (derivation).
- The dot is the **signal**, not a block: Save stays a plain button.

## Resolved questions

- **Q1 — confirm on navigating away with unsaved changes?** → **No.** The
  dirty dot is the signal; Save is one prominent click; a modal contradicts
  the "intentionally limited" philosophy, and browser-back is outside our
  control anyway (no `beforeunload` in this pass). Revisit if users lose
  work in practice.
- **Q2 — wordmark semantics.** The top bar keeps no visible `h1`; the
  wordmark is a `h.button` with `aria-label="Back to gallery"`. The document
  `<title>` names the app; the gallery header's h1 is unaffected.

## Tests

- Editor: `BackToGallery` surfaces from the wordmark click (message-level);
  dirty derivation across `EditSaved` / undo / new-image reset — lives in
  `undo-flow.test.ts` per `01-undo-redo.md`.
- Root: `GotEditorMessage` with `BackToGallery` pushes `/` (mirror the
  existing `EditCreated` root test if one exists; else add a small one).
