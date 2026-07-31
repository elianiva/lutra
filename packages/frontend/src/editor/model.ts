import { Schema } from 'effect'
import { Dialog } from '@foldkit/ui'
import { RenderHandle } from '../gpu/backend'
import { SourceImage, Catalog } from './message'
import { ExportSettings, defaultExportSettings, LayerIdSchema, Layer } from '@lutra/engine'
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
  // Whether the inline LUT picker is expanded in the layer drawer.
  lutPickerOpen: Schema.Boolean,
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
  exportError: Schema.NullOr(Schema.String),
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
  lutPickerOpen: false,
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
