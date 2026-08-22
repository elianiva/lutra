// The shared export dialog machine (docs/adr/0031): one implementation of
// the format/quality/scale dialog, the encode-on-press flow, and the frame
// slot — consumed by the editor (`lutra-edit.<fmt>`) and the collage
// (`lutra-collage.<fmt>`) screens. The owning screen supplies its snapshot
// and reports it via `FrameReady` / `FrameFailed`.

export { Model, init } from './model'
export {
  ExportDialogMessage as Message,
  ChangedFormat,
  ChangedQuality,
  ChangedScale,
  Downloaded,
  EncodeFailed,
  EncodePrepared,
  EncodeRequested,
  FrameFailed,
  FrameReady,
  GotDialogMessage,
  SettingsLoaded,
  SettingsSaved,
  UrlRevoked,
} from './message'
export {
  ExportDownload,
  LoadExportSettings,
  PrepareExport,
  RevokeExportUrl,
  SaveExportSettings,
  type Resource,
} from './command'
export { filenameFor, open, update, type UpdateReturn } from './update'
export { exportDialogView } from './view'
export { clearFrame, peekFrame, setFrame } from './frame'
