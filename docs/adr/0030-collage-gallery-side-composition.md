# Collage: a gallery-side composition of Edits by reference, outside the edit chain

A collage arranges several graded photos into one shareable image. We decided it composes **Edits by reference** and lives entirely outside the edit chain: a new persisted record (`Collage`) owned by the Store package alongside `Edit`, holding only ids and layout numbers — never pixels, never layers. It is explicitly *not* an in-editor composite; the engine's single-source, strictly sequential chain is untouched.

## Why

The engine is single-source by construction (`RenderRequest.srcBitmap`), and the layer model forbids parallel compositing, blend modes, and masks (docs/adr/0002; the "Layer" flagged ambiguity in `context.md`). An editor-side composite would require a scene model, multi-image GPU sessions, and compositing primitives — a rewrite of the core constraint that limitation is the feature. Composing finished Edits instead reuses everything: each referenced Edit already carries its chain and source, so a collage renders by re-running existing chains, and the record stays tiny (ids + numbers) even though Edits are multi-MB.

### Considered options

- **Editor-side composite canvas** — rejected: an architectural rewrite that collides with the layer model and the film-simulation scope posture.
- **Ephemeral export-time arrangement (no persistence)** — rejected: browsing and reopening collages is a stated goal; ephemeral contradicts it.
- **Storing rendered pixels per tile** — rejected: duplicates data Edits already own; references keep the record cheap and previews live.

### Consequences

- Deleting an Edit can dangle a reference. Resolved **on load**: tiles whose Edit no longer exists are dropped with a notice; saving persists the cleaned set. Collages are derived views and never pin Edits alive.
- The store gains a sibling `CollageStore` service (same contract shape as `EditStore`: save/load/list/delete/clearAll) backed by a `collages` object store in the same `"lutra"` IndexedDB database, added via an `IndexedDbVersion.add` step so existing installs migrate.
- Collages have no Save/Save as: creation is persist-first (from a gallery multi-select) and layout changes auto-save — unlike the editor, nothing expensive or iterative is at stake.
