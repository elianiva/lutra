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

// The editor's interaction mode is a foldkit Machine (./phase.ts): the
// `phase` field is its state. The image lifecycle (Empty/Loading/Error), the
// draft (Drafting), and the focused layer (Selected) are machine states, not
// model flags — the machine makes "no draft without an image" structural.
// The model keeps the data those states reference: the chain, the source
// bitmap, per-layer UI state, and the render/export bookkeeping.

// Which field a toggled layer (White Balance, Vignette) currently shows in the
// drawer. Keyed by layer id so each toggled layer remembers its own selection.
const ActiveFieldIndex = Schema.Record(LayerIdSchema, Schema.Number)

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
  // Canvas pan/zoom driven by wheel + drag on the center stage.
  scale: Schema.Number,
  offsetX: Schema.Number,
  offsetY: Schema.Number,
  // The LUT library catalog; null until the startup fetch lands (the LUT
  // tool stays disabled while null).
  catalog: Schema.NullOr(Catalog),
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
  // Compare (before/after viewing) state — CONTEXT.md "Compare": the active
  // mode, the split position in image space (0..1), and which side Toggle
  // shows (entering Toggle reveals the source first). The mode persists
  // across image changes; a new image resets the split position to 50%.
  compareMode: CompareMode,
  compareSplitAt: Schema.Number,
  compareToggleBefore: Schema.Boolean,
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
  source: {
    bitmap: null,
    width: 0,
    height: 0,
    error: null,
  },
  chain: [],
  phase: editorMachine.initial,
  activeFieldIndex: {},
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  catalog: null,
  attachedEdit: null,
  saveStatus: { _tag: 'idle' },
  lutBarOpen: false,
  previewLut: null,
  lutTab: 'recents',
  lutRecents: [],
  lutThumbs: {},
  compareMode: 'off',
  compareSplitAt: 0.5,
  compareToggleBefore: false,
  renderPending: false,
  renderedStamp: 0,
  lastRender: null,
  bins: null,
  revision: 0,
  exportDialog: Dialog.init({ id: 'export-dialog' }),
  exportSettings: defaultExportSettings(),
  exportImage: null,
  exportEncoding: false,
  exportSize: null,
  exportUrl: null,
  exportError: null,
  exportDownloaded: false,
})
