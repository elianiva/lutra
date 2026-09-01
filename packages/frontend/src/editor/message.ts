import { Schema as S } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as ExportDialog from '../export-dialog'
import { RenderHandle } from '../gpu/backend'
import { EditIdSchema, StoreError } from '@lutra/store'
import { LutLoadError } from '../luts/store'
import {
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
  LayerCreationError,
  ThumbnailEncodeError,
} from '../errors'

// The Editor is a foldkit Submodel (docs/adr/0006-frontend-architecture): it owns its own Model,

// (docs/adr/0006-frontend-architecture). The unions below name the failure sets; the model

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

// render command can hand it to WebGPU without re-decoding. Which phase the
export const SourceImage = S.Struct({
  bitmap: S.NullOr(S.instanceOf(ImageBitmap)),
  error: S.NullOr(SourceError),
  height: S.Number,
  width: S.Number,
})
export type SourceImage = typeof SourceImage.Type

const CatalogEntry = S.Struct({
  category: S.String,
  lut_file: LutIdSchema,
  name: S.String,
  thumbnail: S.String,
})
export const Catalog = S.Array(CatalogEntry)
export type Catalog = typeof Catalog.Type

// mobile (bottom sheets + tab bar, docs/adr/0010-editor-ui.md)

export const MobileSheet = S.Union([S.Literal('tools'), S.Literal('layers')])
export type MobileSheet = typeof MobileSheet.Type

export const CompareMode = S.Literals(['off', 'toggle', 'split', 'side-by-side'])
export type CompareMode = typeof CompareMode.Type

// blit-only PresentFrame command (docs/adr/0010-editor-ui): the mode, the split
export const PresentState = S.Struct({
  mode: CompareMode,
  showBefore: S.Boolean,
  splitAt: S.Number,
})
export type PresentState = typeof PresentState.Type

export const EditorMessage = defineMessageUnion({
  FilePickRequested: {},
  FilePickCancelled: {},
  SelectedImageFile: {
    file: S.instanceOf(File),
  },
  ImageDecoded: {
    bitmap: S.instanceOf(ImageBitmap),
    width: S.Number,
    height: S.Number,
    // docs/adr/0005-storage).
    source: S.Uint8Array,
  },
  ImageFailedToDecode: {
    error: ImageDecodeError,
  },
  ClearedImage: {},
  EditLoaded: {
    id: EditIdSchema,
    chain: S.Array(Layer),
    bitmap: S.instanceOf(ImageBitmap),
    width: S.Number,
    height: S.Number,
    source: S.Uint8Array,
  },
  EditLoadFailed: {
    error: S.Union([EditNotFoundError, StoreError, ImageDecodeError]),
  },
  CatalogLoaded: { catalog: Catalog },
  CatalogFailed: { error: LutLoadError },
  // Root-owned facts delegated into the editor (docs/adr/0007-offline): the root's

  OfflineFileFetching: {
    lutId: LutIdSchema,
  },
  OfflineFileDownloaded: {
    lutId: LutIdSchema,
  },
  OfflineConnectivityChanged: {
    online: S.Boolean,
  },
  OfflineLutUnavailable: {
    lutId: LutIdSchema,
  },

  ScaledCanvas: {
    scale: S.Number,
    offsetX: S.Number,
    offsetY: S.Number,
  },

  ToggledMobileSheet: { sheet: MobileSheet },

  SelectedTool: {
    type: S.Literals(LAYER_TYPES),
  },

  LayerCreated: { layer: Layer },
  LayerCreationFailed: {
    error: LayerCreationError,
  },

  ConfirmedDraft: {},
  CancelledDraft: {},
  UpdatedDraftParam: {
    field: FieldKeySchema,
    value: S.Number,
  },
  ChangedDraftLut: { lutId: LutIdSchema },

  SelectedLayer: { id: S.NullOr(LayerIdSchema) },
  RemovedLayer: { id: LayerIdSchema },
  ReorderedLayer: {
    from: S.Number,
    to: S.Number,
  },
  ToggledLayerVisibility: {
    id: LayerIdSchema,
  },
  UpdatedLayerParam: {
    field: FieldKeySchema,
    id: LayerIdSchema,
    value: S.Number,
  },
  ChangedLayerLut: {
    id: LayerIdSchema,
    lutId: LutIdSchema,
  },
  ToggledLutPicker: {},

  // LUT bar (bottom filmstrip picker, docs/adr/0002-lut-library)

  PreviewedLut: {
    lutId: S.NullOr(LutIdSchema),
  },
  SelectedLutTab: {
    tab: S.Union([S.Literal('recents'), S.String]),
  },
  LutRecentsLoaded: {
    recents: S.Array(LutIdSchema),
  },
  LutRecentsSaved: {},

  // per-photo LUT thumbnails (filmstrip previews, docs/adr/0002-lut-library)

  LutThumbGenerated: {
    bitmap: S.instanceOf(ImageBitmap),
    lutId: LutIdSchema,
    url: S.String,
  },
  // presentation-only, so failures are not user-visible (docs/adr/0002-lut-library).
  // never user-visible (docs/adr/0002-lut-library).
  LutThumbFailed: { lutId: LutIdSchema },
  LutThumbsRevoked: {},
  CycledToggledField: { id: LayerIdSchema },
  SelectedMixerColor: {
    id: LayerIdSchema,
    color: S.Number,
  },

  // tone curve widget (docs/adr/0003-adjustment-layers)

  CurvePointDragged: {
    index: S.Number,
    x: S.Number,
    y: S.Number,
  },
  // plain data.
  CurveReset: {},
  StartedLayerReorder: { id: LayerIdSchema },
  MovedLayerReorder: { over: S.Number },
  ChangedCompareMode: { mode: CompareMode },
  ChangedSplitPosition: { position: S.Number },
  FramePresented: {},
  // The rendered frame is presented directly to the canvas by the GPU backend;
  RenderedFrame: {
    handle: S.instanceOf(RenderHandle),
    stamp: S.Number,
  },
  RenderFailed: {
    error: S.Union([CanvasUnavailableError, GpuError, LutLoadError, LutParseError]),
  },
  // just rendered, read back from the GPU asynchronously — the display path
  HistogramComputed: {
    bins: S.instanceOf(Uint32Array),
    stamp: S.Number,
  },
  HistogramFailed: { error: GpuError },
  CanvasRegistered: {},
  ExportRequested: {},
  // The shared export-dialog machine's messages arrive wrapped (docs/adr/0004-export);
  GotExportDialogMessage: {
    message: ExportDialog.Message,
  },
  HoveredToolChanged: {
    type: S.NullOr(S.Literals(LAYER_TYPES)),
  },
  /**
   * The GPU readback landed. The pixels stay in the shared export-dialog
   * frame slot — megabytes of ImageData never ride through the model; only
   * the readiness flag does (docs/adr/0004-export).
   */
  ExportSnapshotted: {},
  ExportSnapshotFailed: {
    error: GpuError,
  },
  SaveRequested: {},
  SaveAsRequested: {},
  EditSaved: { id: EditIdSchema, savedAt: S.Number },
  SaveFailed: { error: SaveError },
})
export type EditorMessage = typeof EditorMessage.Type

/**
 * The fact the editor surfaces to the root (docs/adr/0006-frontend-architecture). Narrow and
 * semantic, like the gallery's `OpenedEdit`: a Save created a NEW Edit (a
 * fresh-pick Save or a Save as) — the root pushes the `/edit/:id` URL so a
 * reload re-attaches the editor to the saved Edit. In-place saves (Save on
 * an attached Edit) emit nothing — the URL already addresses the Edit.
 */
export const EditorOutMessage = defineMessageUnion({
  EditCreated: { id: EditIdSchema },
})
export type EditorOutMessage = typeof EditorOutMessage.Type

export { Layer, type LayerType } from '@lutra/engine'
