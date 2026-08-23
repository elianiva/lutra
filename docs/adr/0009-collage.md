# Collage

A collage arranges several finished Edits into one shareable image.

## Composition by reference, outside the edit chain

A collage composes **Edits by reference** and lives entirely outside the edit chain: a persisted `Collage` record holding ids and layout numbers — never pixels, never layers — owned by the store package alongside Edit (same seam, same database, added by an IndexedDB migration). The engine stays single-source and strictly sequential: an editor-side composite was rejected as a rewrite of the core constraint that limitation is the feature. Storing rendered pixels per tile was rejected (duplicates data Edits already own); ephemeral export-time-only arrangement was rejected (browsing and reopening collages are goals).

- Deleting an Edit dangles references — resolved on load: tiles whose Edit no longer exists drop with a notice, and saving persists the cleaned set. Collages are derived views and never pin Edits alive.
- Creation is persist-first from a gallery multi-select; layout changes auto-save; there is no Save/Save-as (nothing iterative or expensive is at stake, unlike the editor).

## Previews and export

Previews draw each tile's stored thumbnail — instant, free, and consistent with what the menu shows. Only Export renders pixels: each referenced Edit's full chain re-runs at cell resolution through a temporary scoped GPU session on an offscreen canvas, frames composite on a plain 2D canvas grid, and the result encodes through the shared engine encoder (docs/adr/0004-export). Consequence: a saved collage always reflects the referenced Edits' _current_ chains; the record never goes stale.

`compose.ts` — pure geometry and framing math — is the single source of truth for three consumers: the screen preview (CSS transforms), the gallery mini-preview, and export (canvas compose).

## Layout model

- **Frame-level ratio** (presets `1:1` / `4:5` / `9:16` / `16:9` plus custom W:H): users pick share-target shapes, not cell shapes. Cell aspect derives from columns × rows × gutter × frame ratio; the dormant square-only `tileAspect` was retired rather than activated.
- **Per-tile framing**: persisted zoom + pan per tile. Zoom ranges from fit up to 4× cover, defaulting to cover — the smallest zoom that fills the cell — so legacy records render pixel-identically after migration. This dissolves any global cover/contain toggle into one mechanism with strictly more freedom.
- **Arrange/Frame mode toggle** keeps reorder-drag and pan-drag unambiguous on one surface. A modal per-tile crop editor was rejected: framing is judged relative to neighboring tiles — hiding the composition defeats the purpose.
- **Explicit rows**: the layout carries a row count (1–6) alongside columns. Effective rows = max(requested, ceil(count / columns)): explicit M×N grids are honored whenever capacity suffices (spare cells render as background), surplus photos grow the grid instead of vanishing, and legacy records decode unchanged (missing rows defaults to 1 and the derived term wins).
- **Undo covers destructive tile ops only** (remove, reorder, reframe) via undo toast; layout parameters stay un-undone — the control that changed them is still right there. Tile removal needs no confirmation because undo recovers it; Edit deletion gets a modal instead (see docs/adr/0010-editor-ui).
