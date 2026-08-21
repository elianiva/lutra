import { Schema as S } from 'effect'
import { Message } from 'foldkit'
import { Dialog } from '@foldkit/ui'
import { Collage, EditSummary, StoreError } from '@lutra/store'
import { ExportSettings } from '@lutra/engine'

/**
 * The Collage Submodel's message union (docs/adr/0009). Internal to the
 * collage — the root sees them wrapped as `GotCollageMessage`. The collage
 * surfaces no navigation facts to the root: its back button and the
 * bare-route redirect push URLs through commands directly.
 */

// ---- load ----
/**
 * The requested collage landed, pruned of dangling references. `dropped` is
 * how many tiles referenced edits that no longer exist; `thumbs` carries the
 * preview bytes for the surviving tiles.
 */
export const CollageLoaded = Message.m('CollageLoaded', {
  collage: Collage,
  thumbs: S.Array(EditSummary),
  dropped: S.Number,
})
/** The store failed the load (backend unavailable, quota, corruption). */
export const LoadFailed = Message.m('LoadFailed', { error: StoreError })
/** The id is well-formed but no such collage exists (deleted elsewhere). */
export const CollageMissing = Message.m('CollageMissing')

// ---- arrangement (auto-saves on every mutation, docs/adr/0030) ----
export const ChangedColumns = Message.m('ChangedColumns', { columns: S.Number })
export const ChangedGutter = Message.m('ChangedGutter', { gutter: S.Number })
export const ToggledBackground = Message.m('ToggledBackground')
export const RemovedTile = Message.m('RemovedTile', { index: S.Number })
export const MovedTile = Message.m('MovedTile', { from: S.Number, to: S.Number })

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

// ---- export (docs/adr/0031: compose on open, encode on press) ----
export const ExportRequested = Message.m('ExportRequested')
/**
 * The composed grid landed (all tiles rendered + drawn). The pixels stay in
 * the export-frame cache — megabytes of ImageData never ride through the
 * model; only the readiness flag and the failed-tile count do.
 */
export const CollageExportSnapshotted = Message.m('CollageExportSnapshotted', {
  failedTiles: S.Number,
})
export const CollageExportSnapshotFailed = Message.m('CollageExportSnapshotFailed', {
  message: S.String,
})
/** Wraps the @foldkit/ui Dialog submodel's messages for the export dialog. */
export const GotCollageExportDialogMessage = Message.m('GotCollageExportDialogMessage', {
  message: Dialog.Message,
})
export const ChangedCollageExportFormat = Message.m('ChangedCollageExportFormat', {
  format: S.Literals(['png', 'jpeg', 'webp', 'avif']),
})
export const ChangedCollageExportQuality = Message.m('ChangedCollageExportQuality', {
  quality: S.Number,
})
export const ChangedCollageExportScale = Message.m('ChangedCollageExportScale', {
  scale: S.Literals([1, 0.75, 0.5, 0.25]),
})
export const CollageEncodePrepared = Message.m('CollageEncodePrepared', {
  sizeBytes: S.Number,
  url: S.String,
})
export const CollageEncodeFailed = Message.m('CollageEncodeFailed', { message: S.String })
export const CollageDownloadRequested = Message.m('CollageDownloadRequested')
export const CollageDownloaded = Message.m('CollageDownloaded', { url: S.String })
export const CollageExportSettingsLoaded = Message.m('CollageExportSettingsLoaded', {
  settings: ExportSettings,
})
export const CollageExportSettingsSaved = Message.m('CollageExportSettingsSaved')
export const CollageExportUrlRevoked = Message.m('CollageExportUrlRevoked')

export const CollageMessage = S.Union([
  CollageLoaded,
  LoadFailed,
  CollageMissing,
  ChangedColumns,
  ChangedGutter,
  ToggledBackground,
  RemovedTile,
  MovedTile,
  CollageSaved,
  SaveFailed,
  BackRequested,
  NavigatedBack,
  ExportRequested,
  CollageExportSnapshotted,
  CollageExportSnapshotFailed,
  GotCollageExportDialogMessage,
  ChangedCollageExportFormat,
  ChangedCollageExportQuality,
  ChangedCollageExportScale,
  CollageEncodePrepared,
  CollageEncodeFailed,
  CollageDownloadRequested,
  CollageDownloaded,
  CollageExportSettingsLoaded,
  CollageExportSettingsSaved,
  CollageExportUrlRevoked,
])
export type CollageMessage = typeof CollageMessage.Type
