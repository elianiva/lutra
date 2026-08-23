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

// A decoded source bitmap plus its pixel size. The bitmap is held in the model
// as a plain ImageBitmap (`instanceOf` bypasses structural validation) so the
// render command can hand it to WebGPU without re-decoding. Which phase the
// image is in (empty/loading/loaded/error) is the editor machine's state
// (./phase.ts), not model data — the source only carries the payload.
export const SourceImage = S.Struct({
  bitmap: S.NullOr(S.instanceOf(ImageBitmap)),
  error: S.NullOr(SourceError),
  height: S.Number,
  width: S.Number,
})
export type SourceImage = typeof SourceImage.Type

// ---- LUT library ----

// The catalog shape from the vendored film_luts.json (schema mirrors the
// store's LutCatalogEntry type so the message can cross the foldkit
// boundary as a validated value). lut_file is the LUT library reference —
// the lutId brand rides it through the message boundary.
const CatalogEntry = S.Struct({
  category: S.String,
  lut_file: LutIdSchema,
  name: S.String,
  thumbnail: S.String,
})
export const Catalog = S.Array(CatalogEntry)
export type Catalog = typeof Catalog.Type

// ---- mobile (bottom sheets + tab bar, docs/adr/0024-mobile-ui) ----

// The two mobile bottom sheets: the tool panel ('tools') and the layer
// drawer ('layers'). Under the `lg` breakpoint both panels collapse into
// full-width bottom sheets toggled by the mobile tab bar; this message
// toggles one open (tapping the active tab closes it). Inert on desktop.
export const MobileSheet = S.Union([S.Literal('tools'), S.Literal('layers')])
export type MobileSheet = typeof MobileSheet.Type

// ---- compare (before/after viewing) ----

// The editor's compare modes (CONTEXT.md "Compare"): Off is the normal
// view; Toggle flips the whole canvas between the source image and the
// graded output; Split shows both separated by a draggable divider; Side by
// side shows both next to each other in the canvas.
export const CompareMode = S.Literals(['off', 'toggle', 'split', 'side-by-side'])
export type CompareMode = typeof CompareMode.Type

// The presentation state the blit needs, carried by every render and by the
// blit-only PresentFrame command (docs/adr/0011): the mode, the split
// position in image space (0..1), and which side Toggle currently shows.
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
    // The picked file's stored byte encoding — the Edit's source image. Read
    // at pick time so a later Save (which creates a new Edit for a fresh pick)
    // can persist it without holding the File (the store's carrier is bytes,
    // docs/adr/0007).
    source: S.Uint8Array,
  },
  ImageFailedToDecode: {
    error: ImageDecodeError,
  },
  ClearedImage: {},

  // The Edit attached to this editor route (`/edit/:id`) finished loading: its
  // chain and its source image decoded from the stored bytes. Seeding happens
  // in update (source + chain + phase), exactly as a fresh `ImageDecoded`
  // would — an opened Edit is the existing Idle phase, never a new one
  // (CONTEXT.md "Attached edit").
  EditLoaded: {
    // The attached Edit's identity + stored source bytes: the model keeps them
    // so Save writes back through the same id (in place) or forks it
    // (CONTEXT.md "Attached edit" — id + source bytes are model data).
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

  // ---- offline library (the LUT bar's per-row download states) ----
  // Root-owned facts delegated into the editor (docs/adr/0015): the root's
  // offline slice owns the fill machine and counters; these carry the per-LUT
  // states the LUT bar renders — a row's spinner while its cube is being
  // fetched, the dimmed "not downloaded" badge while offline, and the notice
  // when the user tries to apply a cube that isn't cached yet.

  // A cube file's fetch began — the bar row shows its spinner.
  OfflineFileFetching: {
    lutId: LutIdSchema,
  },
  // A cube file landed in the offline library — the row is downloadable.
  OfflineFileDownloaded: {
    lutId: LutIdSchema,
  },
  // The browser's online state flipped — the bar dims undownloaded rows while
  // offline. Absence of a row in the download map means "not downloaded".
  OfflineConnectivityChanged: {
    online: S.Boolean,
  },
  // The user clicked a bar row that isn't downloaded while offline: the bar
  // shows the distinct "connect once" notice instead of committing.
  OfflineLutUnavailable: {
    lutId: LutIdSchema,
  },

  ScaledCanvas: {
    scale: S.Number,
    // Pan offset in canvas pixels.
    offsetX: S.Number,
    offsetY: S.Number,
  },

  ToggledMobileSheet: { sheet: MobileSheet },

  SelectedTool: {
    // Literal union so handlers get a narrowed LayerType without casts.
    type: S.Literals(LAYER_TYPES),
  },

  // Layer creation runs as a Command because the engine factory now exposes an
  // Effect. The phase machine waits in Creating until one of these messages
  // arrives, so a failed factory never throws through update.
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

  // ---- committed chain ----

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

  // ---- LUT bar (bottom filmstrip picker, docs/adr/0012) ----

  // Hover enter/leave on a bar thumb. Presentation-only: sets `previewLut`
  // and re-renders; the committed chain/draft is untouched. null restores
  // the committed look. The bar is the only dispatcher of
  // ChangedDraftLut / ChangedLayerLut — the drawer accordion picker is gone.
  PreviewedLut: {
    lutId: S.NullOr(LutIdSchema),
  },
  // Click on a category tab (or Recents). Presentation-only, no render.
  SelectedLutTab: {
    tab: S.Union([S.Literal('recents'), S.String]),
  },
  // Recents restored from localStorage (boot-time, like the export settings load).
  LutRecentsLoaded: {
    recents: S.Array(LutIdSchema),
  },
  // Ack for SaveLutRecents (observability, like the export settings save).
  LutRecentsSaved: {},

  // ---- per-photo LUT thumbnails (filmstrip previews, docs/adr/0013) ----

  // A per-photo LUT thumbnail finished rendering in the thumb worker: lutId →
  // the blob URL of the 200×200 JPEG (the bar's thumb prefers it over the
  // vendored generic jpg). `bitmap` is the photo the preview belongs to — the
  // staleness guard, exactly like RenderedFrame's stamp: a thumb that lands
  // after a new image loaded is revoked and dropped (the model's map only
  // ever holds the current photo's thumbs).
  LutThumbGenerated: {
    bitmap: S.instanceOf(ImageBitmap),
    lutId: LutIdSchema,
    url: S.String,
  },
  // A per-photo LUT thumbnail failed (cube fetch, downscale, worker render, or
  // encode). The bar silently keeps the vendored generic jpg — previews are
  // presentation-only, so failures are not user-visible (docs/adr/0013).
  LutThumbFailed: { lutId: LutIdSchema },
  // Ack for RevokeLutThumbs (observability, like the export URL revoke ack).
  LutThumbsRevoked: {},

  /** For toggled layers (White Balance, Vignette): cycle the active field shown in the drawer. */
  CycledToggledField: { id: LayerIdSchema },

  /** For Color Mixer layers: select which hue range the drawer shows — the
   *  range's three sliders replace the previous range's. Presentation-only
   *  (no render), exactly like CycledToggledField. */
  SelectedMixerColor: {
    id: LayerIdSchema,
    // 0..7 into MIXER_COLORS; clamped in update.
    color: S.Number,
  },

  // ---- tone curve widget (docs/adr/0028) ----

  // The curve widget (editor/tone-curve.ts) emits pointer positions in unit
  // space (0..1, y up). The mount owns hit-testing and the drag session; the
  // engine's moveCurvePoint clamps and applies the move (x stays between the
  // point's neighbors, y in [0, 1]) to the toneCurve draft — through the
  // machine's Drafting edge — or to the focused chain toneCurve layer. The
  // widget only renders while a toneCurve draft or selection exists, so the
  // target is unambiguous.
  CurvePointDragged: {
    // 0..CURVE_POINT_COUNT - 1; rounded and clamped in the engine.
    index: S.Number,
    x: S.Number,
    y: S.Number,
  },
  // The widget's reset button: every point back to the identity curve
  // (docs/adr/0019's one-gesture reset convention applied to the whole
  // curve). Draft drags go through the machine, chain layers are plain data.
  CurveReset: {},

  // ---- layer drawer reorder (drag) ----

  StartedLayerReorder: { id: LayerIdSchema },
  MovedLayerReorder: { over: S.Number },

  // ---- compare (before/after viewing) ----

  // Selecting a compare mode. Selecting Toggle while already in Toggle flips
  // the view (the segment is the flip button); entering Toggle reveals the
  // source image first (CONTEXT.md "Compare"). Presentation-only — dispatches
  // PresentFrame, never a chain render.
  ChangedCompareMode: { mode: CompareMode },
  // The divider was dragged (or double-clicked to reset): the split position
  // in image space, 0..1. Presentation-only, like ChangedCompareMode.
  ChangedSplitPosition: { position: S.Number },
  // Ack for the blit-only present command (observability, like
  // CanvasRegistered) — the frame was re-presented without re-rendering.
  FramePresented: {},

  // ---- rendering ----

  // The rendered frame is presented directly to the canvas by the GPU backend;
  // the message carries the model revision it was rendered for (so update can
  // drop — or re-trigger — renders that arrived after a newer mutation) and
  // the RenderHandle export snapshots from. The handle makes the backend's
  // data flow explicit: `snapshot` reads the frame the app handed it, never an
  // implicit "last session".
  RenderedFrame: {
    handle: S.instanceOf(RenderHandle),
    stamp: S.Number,
  },
  RenderFailed: {
    error: S.Union([CanvasUnavailableError, GpuError, LutLoadError, LutParseError]),
  },

  // ---- histogram overlay ----

  // The luminance histogram bins (256 u32 Rec.709 luma counts) of the frame
  // just rendered, read back from the GPU asynchronously — the display path
  // never waits on the readback. The stamp guards staleness exactly like
  // RenderedFrame: bins that land after a newer mutation are dropped.
  HistogramComputed: {
    bins: S.instanceOf(Uint32Array),
    stamp: S.Number,
  },
  // Bins readback failure — observability only (the frame itself is already
  // on the canvas; a 1KB map cannot be retried or shown).
  HistogramFailed: { error: GpuError },

  // ---- canvas registration ----

  // One-shot acknowledgment from the canvas mount: the side effect (registering
  // the element in the CanvasRef service) already happened in the mount; this
  // message exists so the mount stays observable (DevTools, Scene, replay).
  CanvasRegistered: {},

  // ---- export dialog ----

  // Opens the export dialog instead of downloading immediately.
  ExportRequested: {},

  // The shared export-dialog machine's messages arrive wrapped (docs/adr/0031);
  // update delegates to its update. Snapshot outcomes are fed in through
  // ExportSnapshotted / ExportSnapshotFailed below.
  GotExportDialogMessage: {
    message: ExportDialog.Message,
  },

  // The tool rail's custom hover tooltip: one fact carries which tool card is
  // currently hovered or keyboard-focused (null = none). The panel renders
  // straight from this field — no submodel, no show-delay machinery.
  HoveredToolChanged: {
    type: S.NullOr(S.Literals(LAYER_TYPES)),
  },

  /**
   * The GPU readback landed. The pixels stay in the shared export-dialog
   * frame slot — megabytes of ImageData never ride through the model; only
   * the readiness flag does (docs/adr/0031).
   */
  ExportSnapshotted: {},
  ExportSnapshotFailed: {
    error: GpuError,
  },

  // ---- save ----

  // The user pressed Save: persist the committed chain through the Edit store
  // — in place when the editor has an attached Edit, as a new Edit (fresh id,
  // duplicated source) when the image was picked fresh in-editor.
  SaveRequested: {},
  // The user pressed Save as: always fork a new Edit, even when attached.
  SaveAsRequested: {},
  // A save completed. `id` is the persisted Edit's id — update attaches the
  // model to it (a fresh-pick Save creates the attachment; Save as re-points
  // it) and emits `EditCreated` when that id is new. `savedAt` is the
  // timestamp written to the record, which the top bar shows.
  EditSaved: { id: EditIdSchema, savedAt: S.Number },
  SaveFailed: { error: SaveError },
})
export type EditorMessage = typeof EditorMessage.Type

/**
 * The fact the editor surfaces to the root (docs/adr/0009). Narrow and
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
