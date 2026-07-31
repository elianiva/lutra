import { Schema as S } from 'effect'
import { Message } from 'foldkit'
import { Dialog } from '@foldkit/ui'
import { AppRoute } from '../route'
import { RenderHandle } from '../gpu/backend'
import {
  ExportFormat,
  ExportQuality,
  ExportScale,
  ExportSettings,
  FieldKeySchema,
  LAYER_TYPES,
  LayerIdSchema,
  LutIdSchema,
} from '@lutra/engine'

export const ChangedRoute = Message.m('ChangedRoute', { route: AppRoute })
export const Navigated = Message.m('Navigated', { request: S.Unknown })

// A decoded source bitmap plus its pixel size. The bitmap is held in the model
// as a plain ImageBitmap (`instanceOf` bypasses structural validation) so the
// render command can hand it to WebGPU without re-decoding. Which phase the
// image is in (empty/loading/loaded/error) is the editor machine's state
// (app/phase.ts), not model data — the source only carries the payload.
export const SourceImage = S.Struct({
  bitmap: S.NullOr(S.instanceOf(ImageBitmap)),
  width: S.Number,
  height: S.Number,
  error: S.NullOr(S.String),
})
export type SourceImage = typeof SourceImage.Type

export const FilePickRequested = Message.m('FilePickRequested')
export const FilePickCancelled = Message.m('FilePickCancelled')

export const SelectedImageFile = Message.m('SelectedImageFile', {
  file: S.instanceOf(File),
})
export const ImageDecoded = Message.m('ImageDecoded', {
  bitmap: S.instanceOf(ImageBitmap),
  width: S.Number,
  height: S.Number,
})
export const ImageFailedToDecode = Message.m('ImageFailedToDecode', {
  error: S.String,
})
export const ClearedImage = Message.m('ClearedImage')

// ---- LUT library ----

// The catalog shape from the vendored film_luts.json (schema mirrors the
// store's LutCatalogEntry type so the message can cross the foldkit
// boundary as a validated value). lut_file is the LUT library reference —
// the lutId brand rides it through the message boundary.
const CatalogEntry = S.Struct({
  name: S.String,
  lut_file: LutIdSchema,
  category: S.String,
  thumbnail: S.String,
})
export const Catalog = S.Array(CatalogEntry)
export type Catalog = typeof Catalog.Type

export const CatalogLoaded = Message.m('CatalogLoaded', { catalog: Catalog })
export const CatalogFailed = Message.m('CatalogFailed', { error: S.String })

// ---- canvas interaction ----

export const ScaledCanvas = Message.m('ScaledCanvas', {
  scale: S.Number,
  // Pan offset in canvas pixels.
  offsetX: S.Number,
  offsetY: S.Number,
})

// ---- tool panel / draft lifecycle ----

export const SelectedTool = Message.m('SelectedTool', {
  // Literal union so handlers get a narrowed LayerType without casts.
  type: S.Literals(LAYER_TYPES),
})
export const ConfirmedDraft = Message.m('ConfirmedDraft')
export const CancelledDraft = Message.m('CancelledDraft')
export const UpdatedDraftParam = Message.m('UpdatedDraftParam', {
  field: FieldKeySchema,
  value: S.Number,
})
/** Pick a different LUT on the active LUT draft. */
export const ChangedDraftLut = Message.m('ChangedDraftLut', { lutId: LutIdSchema })

// ---- committed chain ----

export const SelectedLayer = Message.m('SelectedLayer', { id: S.NullOr(LayerIdSchema) })
export const RemovedLayer = Message.m('RemovedLayer', { id: LayerIdSchema })
export const ReorderedLayer = Message.m('ReorderedLayer', {
  from: S.Number,
  to: S.Number,
})
export const ToggledLayerVisibility = Message.m('ToggledLayerVisibility', {
  id: LayerIdSchema,
})
export const UpdatedLayerParam = Message.m('UpdatedLayerParam', {
  id: LayerIdSchema,
  field: FieldKeySchema,
  value: S.Number,
})
/** Pick a different LUT on a committed, selected LUT layer. */
export const ChangedLayerLut = Message.m('ChangedLayerLut', {
  id: LayerIdSchema,
  lutId: LutIdSchema,
})
/** Expand/collapse the inline LUT picker in the layer drawer. */
export const ToggledLutPicker = Message.m('ToggledLutPicker')
/** For toggled layers (White Balance, Vignette): cycle the active field shown in the drawer. */
export const CycledToggledField = Message.m('CycledToggledField', { id: LayerIdSchema })

// ---- layer drawer reorder (drag) ----

export const StartedLayerReorder = Message.m('StartedLayerReorder', { id: LayerIdSchema })
export const MovedLayerReorder = Message.m('MovedLayerReorder', { over: S.Number })

// ---- rendering ----

// The rendered frame is presented directly to the canvas by the GPU backend;
// the message carries the model revision it was rendered for (so update can
// drop — or re-trigger — renders that arrived after a newer mutation) and
// the RenderHandle export snapshots from. The handle makes the backend's
// data flow explicit: `snapshot` reads the frame the app handed it, never an
// implicit "last session".
export const RenderedFrame = Message.m('RenderedFrame', {
  stamp: S.Number,
  handle: S.instanceOf(RenderHandle),
})
export const RenderFailed = Message.m('RenderFailed', { reason: S.String })

// ---- histogram overlay ----

// The luminance histogram bins (256 u32 Rec.709 luma counts) of the frame
// just rendered, read back from the GPU asynchronously — the display path
// never waits on the readback. The stamp guards staleness exactly like
// RenderedFrame: bins that land after a newer mutation are dropped.
export const HistogramComputed = Message.m('HistogramComputed', {
  bins: S.instanceOf(Uint32Array),
  stamp: S.Number,
})
// Bins readback failure — observability only (the frame itself is already
// on the canvas; a 1KB map cannot be retried or shown).
export const HistogramFailed = Message.m('HistogramFailed', { reason: S.String })

// ---- canvas registration ----

// One-shot acknowledgment from the canvas mount: the side effect (registering
// the element in the CanvasRef service) already happened in the mount; this
// message exists so the mount stays observable (DevTools, Scene, replay).
export const CanvasRegistered = Message.m('CanvasRegistered')

// ---- export dialog ----

// Opens the export dialog (no longer an immediate download).
export const ExportRequested = Message.m('ExportRequested')

// The dialog is a foldkit submodel (@foldkit/ui). Its messages arrive
// wrapped; update delegates to `Dialog.update`.
export const GotExportDialogMessage = Message.m('GotExportDialogMessage', {
  message: Dialog.Message,
})

export const ChangedExportFormat = Message.m('ChangedExportFormat', {
  format: ExportFormat,
})
export const ChangedExportQuality = Message.m('ChangedExportQuality', {
  quality: ExportQuality,
})
export const ChangedExportScale = Message.m('ChangedExportScale', {
  scale: ExportScale,
})

// The frame to export, read back from the GPU once per dialog open (the
// dialog encodes from this cache when the user presses Export).
export const ExportSnapshotted = Message.m('ExportSnapshotted', {
  image: S.instanceOf(ImageData),
})
export const ExportSnapshotFailed = Message.m('ExportSnapshotFailed', {
  reason: S.String,
})
// An encode completed: size + object URL of the encoded blob. The download
// is triggered from here — encoding happens on Export press, not on
// settings change (encoding for a live size preview was too slow).
export const ExportPrepared = Message.m('ExportPrepared', {
  sizeBytes: S.Number,
  url: S.String,
})
export const ExportEncodeFailed = Message.m('ExportEncodeFailed', {
  reason: S.String,
})
// The user asked to download the current blob (the button in the dialog).
export const ExportDownloadRequested = Message.m('ExportDownloadRequested')
// The download was triggered.
export const ExportDownloaded = Message.m('ExportDownloaded', { url: S.String })
// Persisted settings restored from localStorage.
export const ExportSettingsLoaded = Message.m('ExportSettingsLoaded', {
  settings: ExportSettings,
})
// Acks for fire-and-forget export commands (observability, like
// CanvasRegistered).
export const ExportUrlRevoked = Message.m('ExportUrlRevoked')
export const ExportSettingsSaved = Message.m('ExportSettingsSaved')

export const AppMessage = S.Union([
  ChangedRoute,
  Navigated,
  FilePickRequested,
  FilePickCancelled,
  SelectedImageFile,
  ImageDecoded,
  ImageFailedToDecode,
  ClearedImage,
  CatalogLoaded,
  CatalogFailed,
  ScaledCanvas,
  SelectedTool,
  ConfirmedDraft,
  CancelledDraft,
  UpdatedDraftParam,
  ChangedDraftLut,
  SelectedLayer,
  RemovedLayer,
  ReorderedLayer,
  ToggledLayerVisibility,
  UpdatedLayerParam,
  ChangedLayerLut,
  ToggledLutPicker,
  CycledToggledField,
  StartedLayerReorder,
  MovedLayerReorder,
  RenderedFrame,
  RenderFailed,
  HistogramComputed,
  HistogramFailed,
  CanvasRegistered,
  ExportRequested,
  GotExportDialogMessage,
  ChangedExportFormat,
  ChangedExportQuality,
  ChangedExportScale,
  ExportSnapshotted,
  ExportSnapshotFailed,
  ExportPrepared,
  ExportEncodeFailed,
  ExportDownloadRequested,
  ExportDownloaded,
  ExportSettingsLoaded,
  ExportUrlRevoked,
  ExportSettingsSaved,
])
export type AppMessage = typeof AppMessage.Type

export { Layer, type LayerType } from '@lutra/engine'
