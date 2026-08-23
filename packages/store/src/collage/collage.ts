import { Effect, Schema as S } from 'effect'
import { EditIdSchema } from '../edit/edit-id'
import { CollageIdSchema } from './collage-id'

/**
 * **Tile framing** — the part of a referenced Edit's image one Collage tile
 * shows (docs/adr/0009-collage): a zoom over the photo plus the image point (as
 * fractions of width/height) centered in the cell. Applied identically by
 * the collage screen preview, the main menu's mini-previews, and export.
 *
 - `zoom` is relative to cover-fit: 1 = cover (the smallest zoom that fills
   the cell), the UI's minimum is fit (the whole photo visible), its maximum
   4×. The record stores plain numbers; ranges live with the UI controls.
 * The default is cover, centered — every tile without explicit framing looks
 * exactly as it did before framing existed, which is also what legacy records
 * decode to (`framing` is absent in rows saved before docs/adr/0009-collage).
 *
 * Framing never alters the Edit's pixels; it is a view transform, not a crop.
 */
export const TileFraming = S.Struct({
  /** Zoom relative to cover-fit: `1` = cover. */
  zoom: S.Number,
  /** Horizontal center of the visible region, as a fraction of image width (0–1). */
  focusX: S.Number,
  /** Vertical center of the visible region, as a fraction of image height (0–1). */
  focusY: S.Number,
})
export type TileFraming = typeof TileFraming.Type

/** Cover-fit, centered — the look every pre-framing collage renders with. */
export const defaultTileFraming = (): TileFraming => ({
  zoom: 1,
  focusX: 0.5,
  focusY: 0.5,
})

/**
 * One placed **Edit** within a **Collage**: the referenced Edit id plus that
 * tile's **tile framing** (docs/adr/0009-collage).
 *
 * Position is the tile's array index in reading order — a fixed grid has no
 * separate order field. Tiles support remove, reorder, and reframing only; an
 * Edit deleted after being placed is dropped from the Collage on load, with a
 * notice (docs/adr/0009-collage). A tile saved before framing existed decodes with
 * the default (cover, centered).
 */
export const CollageTile = S.Struct({
  /** The referenced Edit — by id, never pixels (docs/adr/0009-collage). */
  editId: EditIdSchema,
  framing: TileFraming.pipe(S.withDecodingDefaultTypeKey(Effect.sync(defaultTileFraming))),
})
export type CollageTile = typeof CollageTile.Type

/** The cell background behind the grid: dark or light. */
export const CollageBackground = S.Union([S.Literal('dark'), S.Literal('light')])
export type CollageBackground = typeof CollageBackground.Type

/**
 * The fixed-grid layout parameters. Numbers are unconstrained here (the
 * engine's precedent: numeric ranges live with the UI controls, not the
 * record); the collage screen clamps columns/rows/gutter/frameRatio to its
 * control ranges on every mutation edge.
 *
 * `rows` is the grid's explicit row count (docs/adr/0009-collage): the user sets an
 * M×N grid rather than deriving rows from the tile count. Consumers compute
 * the **effective** rows as `max(rows, ceil(tiles/columns))` — legacy records
 * (no `rows`, decoding default 1) therefore derive rows exactly as before,
 * explicit M×N is honored whenever capacity suffices, and extra photos grow
 * the grid instead of vanishing. Empty trailing cells compose as background.
 *
 * `frameRatio` is the composed frame's width:height (docs/adr/0009-collage) — chosen
 * from presets or custom W:H. Cell shapes derive from it together with
 * columns, rows, and gutter; they are not set independently. Legacy rows
 * recorded square-only cells under `tileAspect` (always 1); that field is gone and
 * decodes to the same look via the `frameRatio` default of 1.
 */
export const CollageLayout = S.Struct({
  /** Grid columns (1–6 in the v2 controls). */
  columns: S.Number,
  /** Grid rows (1–6 in the v2 controls); 1 = derive from the tile count (legacy look). */
  rows: S.Number.pipe(S.withDecodingDefaultTypeKey(Effect.sync(() => 1))),
  /** Gutter width between and around cells, in px. */
  gutter: S.Number,
  /** The composed frame's width:height; 1 = square. */
  frameRatio: S.Number.pipe(S.withDecodingDefaultTypeKey(Effect.sync(() => 1))),
  background: CollageBackground,
})
export type CollageLayout = typeof CollageLayout.Type

/** The v1 defaults: 3 columns, derived rows, 8px gutter, square frame, dark background. */
export const defaultCollageLayout = (): CollageLayout => ({
  background: 'dark',
  columns: 3,
  rows: 1,
  gutter: 8,
  frameRatio: 1,
})

/**
 * A gallery-side composition of several **Edits** into one shareable image:
 * a stable UUID, its savedAt, the fixed-grid layout (columns × rows, docs/adr/0009-collage), and the ordered tiles.
 *
 * A Collage owns **no pixels** — it references Edits by id. Previews draw
 * each referenced Edit's stored thumbnail through its tile framing; export
 * re-renders each Edit's full chain (docs/adr/0009-collage). Created
 * persist-first from a gallery multi-select; layout changes auto-save; there
 * is no Save/Save as.
 */
export const Collage = S.Struct({
  id: CollageIdSchema,
  /** Timestamp ordering the main menu's Collages section. */
  savedAt: S.Number,
  layout: CollageLayout,
  tiles: S.Array(CollageTile),
})
export type Collage = typeof Collage.Type
