import { Schema as S } from 'effect'
import { EditIdSchema } from '../edit/edit-id'
import { CollageIdSchema } from './collage-id'

/**
 * One placed **Edit** within a **Collage**: the referenced Edit id.
 *
 * Position is the tile's array index in reading order — a fixed grid has no
 * separate order field. Tiles support remove and reorder only; an Edit
 * deleted after being placed is dropped from the Collage on load, with a
 * notice (docs/adr/0030).
 */
export const CollageTile = S.Struct({
  /** The referenced Edit — by id, never pixels (docs/adr/0030). */
  editId: EditIdSchema,
})
export type CollageTile = typeof CollageTile.Type

/** The cell background behind the grid: dark or light. */
export const CollageBackground = S.Union([S.Literal('dark'), S.Literal('light')])
export type CollageBackground = typeof CollageBackground.Type

/**
 * The fixed-grid layout parameters. Numbers are unconstrained here (the
 * engine's precedent: numeric ranges live with the UI controls, not the
 * record); the collage screen clamps columns/gutter to its control ranges.
 *
 * `tileAspect` exists for a future aspect picker but is 1 in v1 — square
 * cells, center-cropped tiles.
 */
export const CollageLayout = S.Struct({
  /** Grid columns (2–6 in the v1 controls). */
  columns: S.Number,
  /** Gutter width between and around cells, in px. */
  gutter: S.Number,
  /** Cell aspect ratio (width/height); 1 = square. */
  tileAspect: S.Number,
  background: CollageBackground,
})
export type CollageLayout = typeof CollageLayout.Type

/** The v1 defaults: 3 columns, 8px gutter, square cells, dark background. */
export const defaultCollageLayout = (): CollageLayout => ({
  background: 'dark',
  columns: 3,
  gutter: 8,
  tileAspect: 1,
})

/**
 * A gallery-side composition of several **Edits** into one shareable image:
 * a stable UUID, its savedAt, the fixed-grid layout, and the ordered tiles.
 *
 * A Collage owns **no pixels** — it references Edits by id. Previews draw
 * each referenced Edit's stored thumbnail; export re-renders each Edit's
 * full chain (docs/adr/0030, 0031). Created persist-first from a gallery
 * multi-select; layout changes auto-save; there is no Save/Save as.
 */
export const Collage = S.Struct({
  id: CollageIdSchema,
  /** Timestamp ordering the main menu's Collages section. */
  savedAt: S.Number,
  layout: CollageLayout,
  tiles: S.Array(CollageTile),
})
export type Collage = typeof Collage.Type
