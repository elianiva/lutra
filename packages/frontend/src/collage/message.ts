import { Schema as S } from 'effect'
import { Message } from 'foldkit'
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

// ---- load ----
/**
 * The requested collage landed, pruned of dangling references. `dropped` is
 * how many tiles referenced edits that no longer exist; `photos` carries the
 * full-resolution source bytes for the surviving tiles (HD preview).
 */
export const CollageLoaded = Message.m('CollageLoaded', {
  collage: Collage,
  photos: S.Array(CollagePhoto),
  dropped: S.Number,
})
/** The store failed the load (backend unavailable, quota, corruption). */
export const LoadFailed = Message.m('LoadFailed', { error: StoreError })
/** The id is well-formed but no such collage exists (deleted elsewhere). */
export const CollageMissing = Message.m('CollageMissing')
/** The referenced thumbnails' pixel sizes landed — framing math needs aspects. */
export const ThumbsMeasured = Message.m('ThumbsMeasured', {
  sizes: S.Array(S.Struct({ editId: EditIdSchema, width: S.Number, height: S.Number })),
})

// ---- layout (each change auto-saves, docs/adr/0030) ----
export const ChangedColumns = Message.m('ChangedColumns', { columns: S.Number })
export const ChangedGutter = Message.m('ChangedGutter', { gutter: S.Number })
/** The composed frame's width:height (docs/adr/0033), from a preset or custom W:H. */
export const ChangedFrameRatio = Message.m('ChangedFrameRatio', { frameRatio: S.Number })
export const ToggledBackground = Message.m('ToggledBackground')

// ---- mode ----
/** The Arrange/Frame toggle moved (docs/adr/0033). Leaving Frame commits any in-flight framing gesture. */
export const ModeChanged = Message.m('ModeChanged', { mode: S.Literals(['arrange', 'frame']) })

// ---- arrangement (auto-saves on every mutation, docs/adr/0030) ----
export const RemovedTile = Message.m('RemovedTile', { index: S.Number })
/** A drag-and-drop gesture finished with a reorder — the DnD machine's fact. */
export const GotDragMessage = Message.m('GotDragMessage', { message: DragAndDrop.Message })

// ---- tile framing (docs/adr/0033) ----
/** A pan gesture started on a tile (Frame mode only). */
export const PanStarted = Message.m('PanStarted', {
  index: S.Number,
  screenX: S.Number,
  screenY: S.Number,
})
/** The pan gesture moved; deltas are applied to that tile's framing draft. */
export const PanMoved = Message.m('PanMoved', { screenX: S.Number, screenY: S.Number })
/** The pan gesture ended — the draft framing commits and auto-saves. */
export const PanEnded = Message.m('PanEnded')
/** One wheel tick over a tile in Frame mode; zooms that tile's draft. */
export const WheelZoomed = Message.m('WheelZoomed', { index: S.Number, deltaY: S.Number })
/** The wheel went quiet — the drafted zoom commits and auto-saves. */
export const ZoomSettled = Message.m('ZoomSettled', { seq: S.Number })
/** Reset one tile's framing to cover-centered (the tile's reset button). */
export const ResetFraming = Message.m('ResetFraming', { index: S.Number })
/** One preview cell's CSS-pixel size was measured (ResizeObserver). */
export const CellMeasured = Message.m('CellMeasured', {
  width: S.Number,
  height: S.Number,
})

// ---- undo (docs/adr/0033) ----
/** The user pressed Undo on the toast: restore the snapshotted tiles array. */
export const UndoPressed = Message.m('UndoPressed')
/** The toast expired without an undo; the slot clears (sequence-guarded). */
export const UndoExpired = Message.m('UndoExpired', { seq: S.Number })

// ---- auto-save ----
/** The mutated record persisted. Observability only. */
export const CollageSaved = Message.m('CollageSaved')
export const SaveFailed = Message.m('SaveFailed', { error: StoreError })

// ---- navigation ----
/** The user pressed the back control; a command pushes the menu URL. */
export const BackRequested = Message.m('BackRequested')
/** The menu URL was pushed. Observability only — the URL change itself
 *  drives the route transition (mirrors the root's `NavigatedTo`). */
export const NavigatedBack = Message.m('NavigatedBack')

// ---- export (docs/adr/0031) ----
export const ExportRequested = Message.m('ExportRequested')
/**
 * The composed grid landed in the export-dialog's frame slot — all tiles
 * rendered + drawn. `failedTiles` counts the photos that could not be
 * rendered so the screen can say so.
 */
export const CollageExportSnapshotted = Message.m('CollageExportSnapshotted', {
  failedTiles: S.Number,
})
export const CollageExportSnapshotFailed = Message.m('CollageExportSnapshotFailed', {
  message: S.String,
})
/** Wraps the shared export-dialog machine's messages (docs/adr/0031). */
export const GotCollageExportDialogMessage = Message.m('GotCollageExportDialogMessage', {
  message: ExportDialog.Message,
})

export const CollageMessage = S.Union([
  CollageLoaded,
  LoadFailed,
  CollageMissing,
  ThumbsMeasured,
  ChangedColumns,
  ChangedGutter,
  ChangedFrameRatio,
  ToggledBackground,
  ModeChanged,
  RemovedTile,
  GotDragMessage,
  PanStarted,
  PanMoved,
  PanEnded,
  WheelZoomed,
  ZoomSettled,
  ResetFraming,
  CellMeasured,
  UndoPressed,
  UndoExpired,
  CollageSaved,
  SaveFailed,
  BackRequested,
  NavigatedBack,
  ExportRequested,
  CollageExportSnapshotted,
  CollageExportSnapshotFailed,
  GotCollageExportDialogMessage,
])
export type CollageMessage = typeof CollageMessage.Type
