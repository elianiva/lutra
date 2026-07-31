import { Schema } from 'effect'
import { EditorRoute } from '../route'
import { RenderHandle } from '../gpu/backend'
import { SourceImage, Catalog } from './message'
import { LayerIdSchema, Layer } from '@lutra/engine'
import { EditorPhase, editorMachine } from './phase'

// The editor's interaction mode is a foldkit Machine (app/phase.ts): the
// `phase` field is its state. The image lifecycle (Empty/Loading/Error), the
// draft (Drafting), and the focused layer (Selected) are machine states, not
// model flags — the machine makes "no draft without an image" structural.
// The model keeps the data those states reference: the chain, the source
// bitmap, per-layer UI state, and the render/export bookkeeping.

// Which field a toggled layer (White Balance, Vignette) currently shows in the
// drawer. Keyed by layer id so each toggled layer remembers its own selection.
const ActiveFieldIndex = Schema.Record(LayerIdSchema, Schema.Number)

export const Model = Schema.Struct({
  route: EditorRoute,
  source: SourceImage,
  // The committed edit chain. Laptop-visible order = render order.
  chain: Schema.Array(Layer),
  // Editor phase machine state (app/phase.ts): Empty | Loading | Error |
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
  // Monotonic counter hashed into the render trigger stamp.
  revision: Schema.Number,
})

export type Model = typeof Model.Type

export const initialModel = (): Model => ({
  route: EditorRoute(),
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
  revision: 0,
})
