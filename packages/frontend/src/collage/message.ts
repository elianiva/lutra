import { Schema as S } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { DragAndDrop } from '@foldkit/ui'
import * as ExportDialog from '../export-dialog'
import { Collage, EditIdSchema, StoreError } from '@lutra/store'
import { CollagePhoto } from './model'

/**
 * The Collage Submodel's message union (docs/adr/0009, 0033). Internal to the
 * collage — the root sees them wrapped as `GotCollageMessage`. The collage
 * surfaces no navigation facts to the root: its back button and the
 * bare-route redirect push URLs through commands directly.
 */
export const CollageMessage = defineMessageUnion({
  // ---- load ----
  /**
   * The requested collage landed, pruned of dangling references. `dropped` is
   * how many tiles referenced edits that no longer exist; `photos` carries the
   * full-resolution source bytes for the surviving tiles (HD preview).
   */
  CollageLoaded: {
    collage: Collage,
    photos: S.Array(CollagePhoto),
    dropped: S.Number,
  },
  /** The store failed the load (backend unavailable, quota, corruption). */
  LoadFailed: { error: StoreError },
  /** The id is well-formed but no such collage exists (deleted elsewhere). */
  CollageMissing: {},
  /** The referenced thumbnails' pixel sizes landed — framing math needs aspects. */
  ThumbsMeasured: {
    sizes: S.Array(S.Struct({ editId: EditIdSchema, width: S.Number, height: S.Number })),
  },

  // ---- layout (each change auto-saves, docs/adr/0030) ----
  ChangedColumns: {
    columns: S.Number,
  },
  /** The grid's explicit row count (docs/adr/0035) — an M×N grid, not count-derived. */
  ChangedRows: { rows: S.Number },
  ChangedGutter: { gutter: S.Number },
  /** The composed frame's width:height (docs/adr/0033), from a preset or custom W:H. */
  ChangedFrameRatio: {
    frameRatio: S.Number,
  },
  ToggledBackground: {},

  // ---- mode ----
  /** The Arrange/Frame toggle moved (docs/adr/0033). Leaving Frame commits any in-flight framing gesture. */
  ModeChanged: {
    mode: S.Literals(['arrange', 'frame']),
  },

  // ---- arrangement (auto-saves on every mutation, docs/adr/0030) ----
  RemovedTile: { index: S.Number },
  /** A drag-and-drop gesture finished with a reorder — the DnD machine's fact. */
  GotDragMessage: {
    message: DragAndDrop.Message,
  },

  // ---- tile framing (docs/adr/0033) ----
  /** A pan gesture started on a tile (Frame mode only). */
  PanStarted: {
    index: S.Number,
    screenX: S.Number,
    screenY: S.Number,
  },
  /** The pan gesture moved; deltas are applied to that tile's framing draft. */
  PanMoved: {
    screenX: S.Number,
    screenY: S.Number,
  },
  /** The pan gesture ended — the draft framing commits and auto-saves. */
  PanEnded: {},
  /** One wheel tick over a tile in Frame mode; zooms that tile's draft. */
  WheelZoomed: {
    index: S.Number,
    deltaY: S.Number,
  },
  /** The wheel went quiet — the drafted zoom commits and auto-saves. */
  ZoomSettled: { seq: S.Number },
  /** Reset one tile's framing to cover-centered (the tile's reset button). */
  ResetFraming: { index: S.Number },
  /** One preview cell's CSS-pixel size was measured (ResizeObserver). */
  CellMeasured: {
    width: S.Number,
    height: S.Number,
  },

  // ---- undo (docs/adr/0033) ----
  /** The user pressed Undo on the toast: restore the snapshotted tiles array. */
  UndoPressed: {},
  /** The toast expired without an undo; the slot clears (sequence-guarded). */
  UndoExpired: { seq: S.Number },

  // ---- auto-save ----
  /** The mutated record persisted. Observability only. */
  CollageSaved: {},
  SaveFailed: { error: StoreError },

  // ---- navigation ----
  /** The user pressed the back control; a command pushes the menu URL. */
  BackRequested: {},
  /** The menu URL was pushed. Observability only — the URL change itself
   *  drives the route transition (mirrors the root's `NavigatedTo`). */
  NavigatedBack: {},

  // ---- export (docs/adr/0031) ----
  ExportRequested: {},
  /**
   * The composed grid landed in the export-dialog's frame slot — all tiles
   * rendered + drawn. `failedTiles` counts the photos that could not be
   * rendered so the screen can say so.
   */
  CollageExportSnapshotted: {
    failedTiles: S.Number,
  },
  CollageExportSnapshotFailed: {
    message: S.String,
  },
  /** Wraps the shared export-dialog machine's messages (docs/adr/0031). */
  GotCollageExportDialogMessage: {
    message: ExportDialog.Message,
  },
})
export type CollageMessage = typeof CollageMessage.Type
