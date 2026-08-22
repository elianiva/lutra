# Collage framing: frame-level ratio and per-tile pan/zoom

The collage gains two capabilities that reshape its record: a **frame ratio** on the layout (presets `1:1` / `4:5` / `9:16` / `16:9` plus custom W:H, replacing the dormant square-only `tileAspect`) and per-tile **tile framing** — a persisted zoom + pan over each referenced Edit's image. Reorder becomes pointer drag-and-drop with an insertion gap behind an **Arrange/Frame mode toggle**, and tile removal gains an undo toast.

## Why

Aspect ratio was ambiguous between the cell and the composed frame. Share targets think in frame terms — "make this a 4:5 post" — and with a uniform grid the cell shape is _derived_ (columns + rows + gutter + frame ratio ⇒ cell aspect), so the two cannot be set independently. Frame-level wins; `tileAspect`, which was always pinned to 1 and reserved "for a future aspect picker", is retired rather than activated.

"Fit" (cover vs contain) was originally imagined as a global toggle. Per-tile pan/zoom dissolves it into one mechanism: zoom's range runs from fit (whole image visible, background bars) up to 4× cover, defaulting to cover — the smallest zoom that fills the cell — so every existing collage renders pixel-identically after migration. No toggle, no second concept.

Drag-and-drop reorder collides with drag-to-pan framing on the same surface: one gesture, two meanings. An Arrange/Frame mode toggle keeps both gestures full-surface and unambiguous. A modal per-tile crop view was rejected because framing is judged _relative to the neighboring tiles_ — hiding the composition defeats the purpose. Undo covers destructive tile ops only (remove, reorder, reframe); layout parameters stay un-undone because the control that changed them is still right there.

### Considered options

- **Cell-level aspect ratio (activate `tileAspect`)** — rejected: users pick share-target shapes, not cell shapes; the derived-cell model makes independent cell control incoherent.
- **Global cover/contain fit toggle** — rejected once framing landed: zoom range subsumes it per tile with strictly more freedom.
- **Per-tile popover crop editor (Instagram-style)** — rejected: hides the neighbors while framing.
- **Grab-handle reorder (drag pans by default)** — rejected: shrinks the reorder target and buries the primary arrangement gesture behind an affordance hunt.
- **Two-step delete confirm (ADR-0022 pattern)** — rejected here: removals are frequent during composition and fully reversible via undo; confirm friction fits rare destructive acts, not iterative arranging.

### Consequences

- `CollageTile` carries `{ editId, framing }`; `CollageLayout` swaps `tileAspect` for the frame ratio. Decodes default missing framing to cover, so old records load unchanged.
- One pure geometry/framing module becomes the single source of truth for three consumers: the screen preview (CSS transforms), the gallery mini-preview (mirrors framing), and export (canvas compose at cell resolution).
- Export resolution derives from the frame ratio instead of assuming square cells; tiles render through their framing at that resolution.
- Removing the last tile needs a distinct empty state ("All photos removed") separate from the dangling-reference message, plus an escape hatch to undo or delete the collage.
- Framing changes auto-save like every other arrangement mutation; the undo window restores the prior tiles array.
