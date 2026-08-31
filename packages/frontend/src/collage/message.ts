import { Schema as S } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as DragAndDrop from '@/components/ui/drag-and-drop'
import * as ExportDialog from '../export-dialog'
import { Collage, EditIdSchema, StoreError } from '@lutra/store'
import { CollagePhoto } from './model'

/**
 * The Collage Submodel's message union (docs/adr/0006-frontend-architecture, docs/adr/0009-collage). Internal to the
 * collage — the root sees them wrapped as `GotCollageMessage`. The collage
 * surfaces no navigation facts to the root: its back button and the
 * bare-route redirect push URLs through commands directly.
 */
export const CollageMessage = defineMessageUnion({
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
  LoadFailed: { error: StoreError },
  /** The id is well-formed but no such collage exists (deleted elsewhere). */
  CollageMissing: {},
  ThumbsMeasured: {
    sizes: S.Array(S.Struct({ editId: EditIdSchema, width: S.Number, height: S.Number })),
  },

  // layout (each change auto-saves, docs/adr/0009-collage)
  ChangedColumns: {
    columns: S.Number,
  },
  /** The grid's explicit row count (docs/adr/0009-collage) — an M×N grid, not count-derived. */
  ChangedRows: { rows: S.Number },
  ChangedGutter: { gutter: S.Number },
  /** The composed frame's width:height (docs/adr/0009-collage), from a preset or custom W:H. */
  ChangedFrameRatio: {
    frameRatio: S.Number,
  },
  ToggledBackground: {},

  /** The Arrange/Frame toggle moved (docs/adr/0009-collage). Leaving Frame commits any in-flight framing gesture. */
  ModeChanged: {
    mode: S.Literals(['arrange', 'frame']),
  },

  // arrangement (auto-saves on every mutation, docs/adr/0009-collage)
  RemovedTile: { index: S.Number },
  GotDragMessage: {
    message: DragAndDrop.Message,
  },

  // tile framing (docs/adr/0009-collage)
  PanStarted: {
    index: S.Number,
    screenX: S.Number,
    screenY: S.Number,
  },
  PanMoved: {
    screenX: S.Number,
    screenY: S.Number,
  },
  /** The pan gesture ended — the draft framing commits and auto-saves. */
  PanEnded: {},
  WheelZoomed: {
    index: S.Number,
    deltaY: S.Number,
  },
  /** The wheel went quiet — the drafted zoom commits and auto-saves. */
  ZoomSettled: { seq: S.Number },
  ResetFraming: { index: S.Number },
  CellMeasured: {
    width: S.Number,
    height: S.Number,
  },

  // undo (docs/adr/0009-collage)
  UndoPressed: {},
  /** The toast expired without an undo; the slot clears (sequence-guarded). */
  UndoExpired: { seq: S.Number },

  CollageSaved: {},
  SaveFailed: { error: StoreError },

  BackRequested: {},
  NavigatedBack: {},

  // export (docs/adr/0009-collage)
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
  GotCollageExportDialogMessage: {
    message: ExportDialog.Message,
  },
})
export type CollageMessage = typeof CollageMessage.Type
