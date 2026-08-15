# Back navigation + dirty-state indicator

Two top-bar improvements: an escape hatch from the editor (the only way back
was the browser back button), and a signal that the chain diverged from the
last saved state.

**Status**: decided (2026-08-07 planning session); not yet implemented.

## Decisions

### D1 — The wordmark becomes the back affordance

LUTRA stays visually identical but becomes a `h.button` with
`aria-label="Back to gallery"`. The visible `h1` goes away — the document
`<title>` names the app, the gallery keeps its own `h1`, and the wordmark is a
navigation control, not a page heading. New editor OutMessage `BackToGallery`;
the root gains a `NavigateToGallery` command (`pushUrl('/')`) mirroring
`NavigateToEdit`, wired in the `GotEditorMessage` arm. Wordmark = home is a
universal convention; no new chrome in an already-crowded bar.

### D2 — Dirty dot on Save

`dirty = !chainEqual(chain, savedChain)` — derived from the `savedChain`
field (docs/adr/0017 D4), no separate flag. UI: a small accent dot before the
Save button when dirty, `title="Unsaved changes"`; the "Saved h:mm" text stays.
When a save lands, the dot disappears automatically (derivation).

### D3 — No confirm on navigating away

The dirty dot is the signal, not a block: Save is one prominent click, a
modal contradicts the "intentionally limited" philosophy, and browser-back is
outside our control anyway (no `beforeunload` in this pass). Revisit if users
lose work in practice.

## Consequences

- Implement together with docs/adr/0017 (shared `savedChain`), or land 0017
  first.
- Tests: wordmark surfaces `BackToGallery`; root pushes `/` on it; dirty
  derivation across `EditSaved` / undo / new-image reset lives in
  `undo-flow.test.ts`.
