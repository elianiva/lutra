# Open photo: multi-select; only a single pick opens the editor

The gallery's **Open photo** picker accepted exactly one file and always
navigated straight into the editor. Support multiple picks: every picked
photo becomes its own persisted **Edit**, but only a single pick opens the
**Editor** — a batch stays on the gallery.

**Status**: decided (2026-08-22); implemented in the same change.

## Decisions

### D1 — Multi-select on; single pick keeps the classic flow

`OpenPhoto` uses foldkit's `File.selectMultiple` (`input.multiple = true`),
which resolves `[]` on dismissal. One pick behaves exactly as before:
persist the Edit, surface `PhotoCreated`, root pushes the editor URL.
Several picks never navigate — they land as tiles, and the user edits one by
clicking it later. Opening the editor on a batch has no defined meaning (the
editor is attached to exactly one Edit), so "stay put" is the honest default;
the empty-state CTA inherits both behaviors for free.

### D2 — Per-file isolation; failures aggregate into one report

Each pick runs through the same `createEdit` effect (read bytes → seed
thumbnail → `store.save`) under `Effect.partition`: one bad file never loses
the rest of the batch. The result message carries the failure tally and the
first failure for the notice:

- all landed → no notice; the growing grid is the feedback;
- partial → `Added N photos, M could not be opened: <reason>`;
- none landed → the existing `Could not open photo: <reason>` wording.

### D3 — The fresh listing rides in the result message

The command lists the store after saving and embeds the summaries in
`PhotosAdded` rather than having update dispatch a follow-up `ListEdits`.
Ordering matters: messages from one command resolve before any new Command's
result lands, and `EditsListed` clears the notice banner — a dispatched
re-list would wipe the failure report this same flow just set. Embedding the
listing makes the grid refresh and the notice land atomically. If that post-
save listing itself fails, `summaries` is None and the grid keeps its state;
the report still shows.

## Consequences

- Gallery gains the `PhotosAdded` message; `OpenPhotoRequested`,
  `PhotoCreated`, `PhotoPickCancelled`, `PhotoCreateFailed` unchanged.
- Grid application + selection pruning extracted as `withSummaries`, shared
  by `EditsListed` and `PhotosAdded`.
- The editor's own fresh-pick flow (`editor/command.ts`) stays single-file —
  it seeds an editing session, not a gallery import.
- Tests: batch stays put (no OutMessage), grid refresh, partial/full-failure
  notices, failed-listing fallback.
