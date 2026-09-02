import { Schema as S } from 'effect'
import { AsyncData } from 'foldkit'
import * as DragAndDrop from '@/components/ui/drag-and-drop'
import { Collage, CollageTile, EditIdSchema, StoreError, TileFraming } from '@lutra/store'
import * as ExportDialog from '../export-dialog'

/**
 * The Collage Submodel's model (docs/adr/0006-frontend-architecture, docs/adr/0009-collage): the loaded
 * collage as AsyncData, the preview thumbnails for its tiles (+ their pixel
 * sizes, for framing math), the interaction mode, the shared drag-and-drop
 * machine, transient framing-gesture state, an undo slot, a notice, and the
 * shared export-dialog machine. There is no phase machine and no draft in
 * the editor sense — every arrangement mutation auto-saves immediately, so
 * the record is always the truth; only in-flight gestures hold unsaved state.
 */
/** The loaded collage, held as AsyncData (a missing id lands as a failure). */
export const LoadedCollage = AsyncData.Schema(Collage, StoreError)
/** The schema's typed constructors (`LoadedCollage.Success` etc.). */
export const loadedCollage = LoadedCollage

/**
 * Layout control bounds — the record stores plain numbers; this screen
 * clamps columns/rows/gutter/frameRatio to its control ranges on every
 * mutation edge.
 */
export const LAYOUT_BOUNDS = {
  minColumns: 1,
  maxColumns: 6,
  minRows: 1,
  maxRows: 6,
  minGutter: 0,
  maxGutter: 32,
  /** Custom W:H clamps here — wide enough for any share target, narrow
   * enough that cells stay usable. */
  minFrameRatio: 0.5,
  maxFrameRatio: 3,
} as const

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/** One HD source photo for the collage preview (full-resolution bytes). */
export const CollagePhoto = S.Struct({
  id: EditIdSchema,
  source: S.Uint8Array,
})
export type CollagePhoto = typeof CollagePhoto.Type

/** The measured pixel size of one source photo (for aspect math). */
export const ThumbSize = S.Struct({
  editId: EditIdSchema,
  width: S.Number,
  height: S.Number,
})

export const Model = S.Struct({
  collage: LoadedCollage.schema,
  /** Full-resolution source bytes per referenced Edit (HD preview). */
  photos: S.Array(CollagePhoto),
  /** Decoded pixel sizes per referenced Edit — framing math needs aspects. */
  sizes: S.Array(ThumbSize),
  // A transient banner (dangling references dropped on load, a failed save,
  // a failed export), null when clean.
  notice: S.NullOr(S.String),
  selectedTile: S.NullOr(S.Number),
  // The shared drag-and-drop machine (@foldkit/ui/dragAndDrop).
  drag: DragAndDrop.Model,
  /** A framing gesture in flight: which tile, and its next framing. */
  framingDraft: S.NullOr(S.Struct({ index: S.Number, framing: TileFraming })),
  /** The live pan gesture: which tile, and the last pointer screen point. */
  pan: S.NullOr(S.Struct({ index: S.Number, screenX: S.Number, screenY: S.Number })),
  /**
   * One-slot undo (docs/adr/0009-collage): the tiles array as it was before the last
   * destructive tile op, with a sequence token so a stale expiry timer can't
   * clear a newer undo.
   */
  undo: S.NullOr(S.Struct({ seq: S.Number, tiles: S.Array(CollageTile) })),
  undoLabel: S.NullOr(S.String),
  undoSeq: S.Number,
  zoomSeq: S.Number,
  /** True only when the user themselves removed every photo (vs dangling refs). */
  userEmptied: S.Boolean,
  /** Measured CSS-pixel size of one preview cell (ResizeObserver-fed). */
  cellPx: S.NullOr(S.Struct({ width: S.Number, height: S.Number })),
  // The shared export-dialog machine (docs/adr/0009-collage).
  exportDialog: ExportDialog.Model,
})
export type Model = typeof Model.Type

export const initialModel = (): Model => ({
  collage: LoadedCollage.Idle(),
  photos: [],
  sizes: [],
  notice: null,
  selectedTile: null,
  drag: DragAndDrop.init({ id: 'collage-grid', orientation: 'Horizontal' }),
  framingDraft: null,
  pan: null,
  undo: null,
  undoLabel: null,
  undoSeq: 0,
  zoomSeq: 0,
  userEmptied: false,
  cellPx: null,
  exportDialog: ExportDialog.init({
    id: 'collage-export-dialog',
    fileStem: 'lutra-collage',
  }),
})
