import { Schema as S } from 'effect'
import { Message } from 'foldkit'
import { Dialog } from '@foldkit/ui'
import { RenderHandle } from '../gpu/backend'
import { EditIdSchema, StoreError } from '@lutra/store'
import { LutLoadError } from '../luts/store'
import {
  EncodeError,
  ExportFormat,
  ExportQuality,
  ExportScale,
  ExportSettings,
  FieldKeySchema,
  GpuError,
  LAYER_TYPES,
  Layer,
  LayerIdSchema,
  LutIdSchema,
  LutParseError,
} from '@lutra/engine'
import {
  CanvasUnavailableError,
  EditNotFoundError,
  ImageDecodeError,
  ThumbnailEncodeError,
} from '../errors'

// ---- the editor's message union ----
// The Editor is a foldkit Submodel (docs/adr/0009): it owns its own Model,
// Message, update, and Commands behind a `GotEditorMessage` boundary. These
// Messages are all internal to the editor — routing (`ChangedRoute`,
// `Navigated`) lives at the root, and the editor surfaces its domain facts
// upward via an `OutMessage` when it needs to.

// A failure message carries its tagged error, never a flattened string
// (docs/adr/0010). The unions below name the failure sets; the model
// reuses them (model.ts) so a stored failure stays typed end to end.

/** Every error the editor can land in `source.error` (decode, load, render). */
export const SourceError = S.Union([
  ImageDecodeError,
  EditNotFoundError,
  StoreError,
  GpuError,
  LutLoadError,
  LutParseError,
  CanvasUnavailableError,
])
export type SourceError = typeof SourceError.Type

/** Every failure a Save can surface: snapshot, thumbnail encode, or store. */
export const SaveError = S.Union([GpuError, StoreError, ThumbnailEncodeError])
export type SaveError = typeof SaveError.Type

/** Every failure the export dialog can surface: snapshot readback or encode. */
export const ExportError = S.Union([GpuError, EncodeError])
export type ExportError = typeof ExportError.Type

// A decoded source bitmap plus its pixel size. The bitmap is held in the model
// as a plain ImageBitmap (`instanceOf` bypasses structural validation) so the
// render command can hand it to WebGPU without re-decoding. Which phase the
// image is in (empty/loading/loaded/error) is the editor machine's state
// (./phase.ts), not model data — the source only carries the payload.
export const SourceImage = S.Struct({
  bitmap: S.NullOr(S.instanceOf(ImageBitmap)),
  width: S.Number,
  height: S.Number,
  error: S.NullOr(SourceError),
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
  // The picked file's stored byte encoding — the Edit's source image. Read
  // at pick time so a later Save (which creates a new Edit for a fresh pick)
  // can persist it without holding the File (the store's carrier is bytes,
  // docs/adr/0007).
  source: S.Uint8Array,
})
export const ImageFailedToDecode = Message.m('ImageFailedToDecode', {
  error: ImageDecodeError,
})
export const ClearedImage = Message.m('ClearedImage')

// ---- attached edit (opened from the gallery) ----

// The Edit attached to this editor route (`/edit/:id`) finished loading: its
// chain and its source image decoded from the stored bytes. Seeding happens
// in update (source + chain + phase), exactly as a fresh `ImageDecoded`
// would — an opened Edit is the existing Idle phase, never a new one
// (CONTEXT.md "Attached edit").
export const EditLoaded = Message.m('EditLoaded', {
  // The attached Edit's identity + stored source bytes: the model keeps them
  // so Save writes back through the same id (in place) or forks it
  // (CONTEXT.md "Attached edit" — id + source bytes are model data).
  id: EditIdSchema,
  chain: S.Array(Layer),
  bitmap: S.instanceOf(ImageBitmap),
  width: S.Number,
  height: S.Number,
  source: S.Uint8Array,
})
export const EditLoadFailed = Message.m('EditLoadFailed', {
  error: S.Union([EditNotFoundError, StoreError, ImageDecodeError]),
})

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
export const CatalogFailed = Message.m('CatalogFailed', { error: LutLoadError })

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
export const RenderFailed = Message.m('RenderFailed', {
  error: S.Union([CanvasUnavailableError, GpuError, LutLoadError, LutParseError]),
})

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
export const HistogramFailed = Message.m('HistogramFailed', { error: GpuError })

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
  error: GpuError,
})
// An encode completed: size + object URL of the encoded blob. The download
// is triggered from here — encoding happens on Export press, not on
// settings change (encoding for a live size preview was too slow).
export const ExportPrepared = Message.m('ExportPrepared', {
  sizeBytes: S.Number,
  url: S.String,
})
export const ExportEncodeFailed = Message.m('ExportEncodeFailed', {
  error: EncodeError,
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

// ---- save ----

// The user pressed Save: persist the committed chain through the Edit store
// — in place when the editor has an attached Edit, as a new Edit (fresh id,
// duplicated source) when the image was picked fresh in-editor.
export const SaveRequested = Message.m('SaveRequested')
// The user pressed Save as: always fork a new Edit, even when attached.
export const SaveAsRequested = Message.m('SaveAsRequested')
// A save completed. `id` is the persisted Edit's id — update attaches the
// model to it (a fresh-pick Save creates the attachment; Save as re-points
// it) and emits `EditCreated` when that id is new. `savedAt` is the
// timestamp written to the record, which the top bar shows.
export const EditSaved = Message.m('EditSaved', { id: EditIdSchema, savedAt: S.Number })
export const SaveFailed = Message.m('SaveFailed', { error: SaveError })

export const EditorMessage = S.Union([
  FilePickRequested,
  FilePickCancelled,
  SelectedImageFile,
  ImageDecoded,
  ImageFailedToDecode,
  ClearedImage,
  EditLoaded,
  EditLoadFailed,
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
  SaveRequested,
  SaveAsRequested,
  EditSaved,
  SaveFailed,
])
export type EditorMessage = typeof EditorMessage.Type

/**
 * The fact the editor surfaces to the root (docs/adr/0009). Narrow and
 * semantic, like the gallery's `OpenedEdit`: a Save created a NEW Edit (a
 * fresh-pick Save or a Save as) — the root pushes the `/edit/:id` URL so a
 * reload re-attaches the editor to the saved Edit. In-place saves (Save on
 * an attached Edit) emit nothing — the URL already addresses the Edit.
 */
export const EditCreated = Message.m('EditCreated', { id: EditIdSchema })
export type EditorOutMessage = typeof EditCreated.Type

export { Layer, type LayerType } from '@lutra/engine'
