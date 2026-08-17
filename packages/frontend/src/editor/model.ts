import { Schema } from 'effect'
import { Dialog } from '@foldkit/ui'
import { RenderHandle } from '../gpu/backend'
import { SourceImage, CompareMode, Catalog, SaveError, ExportError } from './message'
import {
  ExportSettings,
  defaultExportSettings,
  LayerIdSchema,
  LutIdSchema,
  Layer,
} from '@lutra/engine'
import { EditIdSchema } from '@lutra/store'
import { EditorPhase, editorMachine } from './phase'
import { DownloadState } from '../offline/model'
import { LutLoadError } from '../luts/store'

// The editor's interaction mode is a foldkit Machine (./phase.ts): the
// `phase` field is its state. The image lifecycle (Empty/Loading/Error), the
// draft (Drafting), and the focused layer (Selected) are machine states, not
// model flags — the machine makes "no draft without an image" structural.
// The model keeps the data those states reference: the chain, the source
// bitmap, per-layer UI state, and the render/export bookkeeping.

// Which field a toggled layer (White Balance, Vignette) currently shows in the
// drawer. Keyed by layer id so each toggled layer remembers its own selection.
const ActiveFieldIndex = Schema.Record(LayerIdSchema, Schema.Number)

// Which of the 8 hue ranges (0..7 into MIXER_COLORS) a Color Mixer layer's
// drawer currently shows — the range whose three sliders are open. Keyed by
// layer id, exactly like activeFieldIndex.
const ActiveMixerColor = Schema.Record(LayerIdSchema, Schema.Number)

// The persisted record identity of the current image (CONTEXT.md "Attached
// edit"): the Edit id it is attached to — null when the image was picked
// fresh in-editor — and the source image in its stored byte encoding (the
// picked file's bytes or the attached Edit's stored bytes). Save writes
// through this: in place when the id is present, creating a new Edit when
// null. Null while no image is loaded.
const AttachedEdit = Schema.NullOr(
  Schema.Struct({
    id: Schema.NullOr(EditIdSchema),
    source: Schema.Uint8Array,
  }),
)

// The save flow's bookkeeping: idle, an in-flight save, the last successful
// save (the top bar shows its time), or the last failure (the top bar shows
// the reason). Reset to idle when a new image loads.
const SaveStatus = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal('idle') }),
  Schema.Struct({ _tag: Schema.Literal('saving') }),
  Schema.Struct({ _tag: Schema.Literal('saved'), at: Schema.Number }),
  Schema.Struct({ _tag: Schema.Literal('failed'), error: SaveError }),
])

export const Model = Schema.Struct({
  source: SourceImage,
  // The committed edit chain. Laptop-visible order = render order.
  chain: Schema.Array(Layer),
  // Editor phase machine state (./phase.ts): Empty | Loading | Error |
  // Idle | Drafting | Selected. Owns the image lifecycle, the draft, and the
  // selection — replaced the old draft/selectedLayerId/source.status flags.
  phase: EditorPhase,
  // Per-layer index into the toggled layer's two fields.
  activeFieldIndex: ActiveFieldIndex,
  // Per-layer index of the Color Mixer's active hue range (0..7).
  activeMixerColor: ActiveMixerColor,
  // Canvas pan/zoom driven by wheel + drag on the center stage.
  scale: Schema.Number,
  offsetX: Schema.Number,
  offsetY: Schema.Number,
  // The LUT library catalog; null until the startup fetch lands (the LUT
  // tool stays disabled while null).
  catalog: Schema.NullOr(Catalog),
  // Why the catalog is missing, when it is (plan 06): null while the
  // startup fetch is still in flight or after a successful load — the LUT
  // card shows "Loading LUTs…" / "LUTs unavailable" from this pair.
  catalogError: Schema.NullOr(LutLoadError),
  // The attached Edit's identity + stored source bytes (null while no image
  // is loaded — see AttachedEdit above).
  attachedEdit: AttachedEdit,
  // Save flow bookkeeping (see SaveStatus above).
  saveStatus: SaveStatus,
  // Whether the bottom LUT bar is open (the filmstrip picker under the
  // canvas — docs/adr/0012). The drawer's LUT rows keep summary + sliders
  // and carry a chevron toggle for this bar; the bar owns browsing.
  lutBarOpen: Schema.Boolean,
  // Hover preview: the lutId hovered in the bar. Presentation-only, applied
  // at render time to the active LUT target (the draft or the focused chain
  // LUT layer) — never touches the chain or the machine (docs/adr/0011
  // spirit). Cleared on every bar-closing transition.
  previewLut: Schema.NullOr(LutIdSchema),
  // Active tab in the bar: 'recents' or a catalog category name. A stale
  // 'recents' (the list emptied since) falls back to the first catalog
  // category at render.
  lutTab: Schema.Union([Schema.Literal('recents'), Schema.String]),
  // Most-recently-applied lutIds, newest first, capped at 12, persisted via
  // the KeyValueStore (LoadLutRecents / SaveLutRecents) and shown as the
  // bar's Recents tab (hidden while empty).
  lutRecents: Schema.Array(LutIdSchema),
  // Per-photo LUT preview thumbnails: lutId → blob URL of the 200×200 JPEG
  // rendered by the thumb worker (docs/adr/0013). Presentation-only — the
  // bar's thumbs prefer these over the vendored generic jpg. Generated
  // lazily per visible group (tab select / bar open), cleared and revoked
  // when a new image loads.
  lutThumbs: Schema.Record(Schema.String, Schema.String),
  // Per-LUT offline library states (docs/adr/0015): lutId → the cube's
  // mirroring state, fed by the root's delegation of offline fill events.
  // Absence means "not downloaded" — while offline, the LUT bar dims those
  // rows and blocks commits with a distinct notice.
  lutDownloads: Schema.Record(Schema.String, DownloadState),
  // The browser's online state (forwarded from the root's connectivity
  // facts) — the LUT bar's offline dimming.
  online: Schema.Boolean,
  // The transient "this LUT isn't downloaded yet" notice shown in the bar's
  // name line when an undownloaded row is clicked while offline.
  offlineLutNotice: Schema.NullOr(Schema.String),
  // Compare (before/after viewing) state — CONTEXT.md "Compare": the active
  // mode, the split position in image space (0..1), and which side Toggle
  // shows (entering Toggle reveals the source first). The mode persists
  // across image changes; a new image resets the split position to 50%.
  compareMode: CompareMode,
  compareSplitAt: Schema.Number,
  compareToggleBefore: Schema.Boolean,
  // Which bottom sheet is open on mobile (docs/adr/0024-mobile-ui): under the `lg`
  // breakpoint the tool panel and the layer drawer collapse into full-width
  // bottom sheets toggled by the mobile tab bar — this field tracks which
  // one is open (null = neither, the canvas gets the full screen). Inert on
  // desktop: both panels are always visible there and the sheets render
  // hidden.
  mobileSheet: Schema.NullOr(Schema.Union([Schema.Literal('tools'), Schema.Literal('layers')])),
  // True while a RenderChain command is in flight; renderNow skips dispatch
  // while pending so the GPU queue never backs up (the in-flight render
  // re-triggers with the newest state when it completes).
  renderPending: Schema.Boolean,
  // Stamp of the chain+draft the currently displayed frame was rendered for;
  // lets update ignore renders that arrived after a newer mutation.
  renderedStamp: Schema.Number,
  // The GPU frame handle of the last rendered frame; export snapshots from
  // exactly this frame (never an implicit backend "last session").
  lastRender: Schema.NullOr(Schema.instanceOf(RenderHandle)),
  // The luminance histogram bins (256 u32) of the frame currently displayed,
  // read back asynchronously from the GPU (null until the first readback
  // lands; cleared with the image). The Histogram overlay draws from this.
  bins: Schema.NullOr(Schema.instanceOf(Uint32Array)),
  // Monotonic counter hashed into the render trigger stamp.
  revision: Schema.Number,
  // ---- export dialog ----
  // The foldkit dialog submodel (open/close/animation state).
  exportDialog: Dialog.Model,
  // The export settings (format/quality/scale); persisted across sessions.
  exportSettings: ExportSettings,
  // The frame to export, read back from the GPU when the dialog opens and
  // cached for the dialog's lifetime — pressing Export encodes from it
  // without another readback.
  exportImage: Schema.NullOr(Schema.instanceOf(ImageData)),
  // True while an export encode is running (the Export button is disabled
  // and the dialog shows "Encoding…").
  exportEncoding: Schema.Boolean,
  // The encoded blob's size and object URL (the download target).
  exportSize: Schema.NullOr(Schema.Number),
  exportUrl: Schema.NullOr(Schema.String),
  // Encode failure reason, shown in the dialog.
  exportError: Schema.NullOr(ExportError),
  // True after a successful download, until the next settings change.
  exportDownloaded: Schema.Boolean,
})

export type Model = typeof Model.Type

export const initialModel = (): Model => ({
  activeFieldIndex: {},
  activeMixerColor: {},
  attachedEdit: null,
  bins: null,
  catalog: null,
  catalogError: null,
  chain: [],
  compareMode: 'off',
  compareSplitAt: 0.5,
  compareToggleBefore: false,
  exportDialog: Dialog.init({ id: 'export-dialog' }),
  exportDownloaded: false,
  exportEncoding: false,
  exportError: null,
  exportImage: null,
  exportSettings: defaultExportSettings(),
  exportSize: null,
  exportUrl: null,
  lastRender: null,
  lutBarOpen: false,
  lutDownloads: {},
  lutRecents: [],
  lutTab: 'recents',
  lutThumbs: {},
  mobileSheet: null,
  offlineLutNotice: null,
  offsetX: 0,
  offsetY: 0,
  online: true,
  phase: editorMachine.initial,
  previewLut: null,
  renderPending: false,
  renderedStamp: 0,
  revision: 0,
  saveStatus: { _tag: 'idle' },
  scale: 1,
  source: {
    bitmap: null,
    error: null,
    height: 0,
    width: 0,
  },
})
