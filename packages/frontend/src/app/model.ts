import { Schema } from 'effect'
import { EditorRoute } from '../route'
import { SourceImage } from './message'
import { Layer } from '@lutra/engine'

// Surfaced layers (committed) render through the chain; a draft layer renders
// on top in preview and is discarded on cancel, per context.md's draft flow.
// Both the chain and the draft render live in the GPU pipeline; the model
// keeps draft null whenever no tool is mid-creation.

// Which field a toggled layer (White Balance, Vignette) currently shows in the
// drawer. Keyed by layer id so each toggled layer remembers its own selection.
const ActiveFieldIndex = Schema.Record(Schema.String, Schema.Number)

export const Model = Schema.Struct({
  route: EditorRoute,
  source: SourceImage,
  // The committed edit chain. Laptop-visible order = render order.
  chain: Schema.Array(Layer),
  // The transactional preview layer; not part of `chain` until confirmed.
  draft: Schema.NullOr(Layer),
  // Which committed layer the drawer is focused on (the draft takes priority
  // when present).
  selectedLayerId: Schema.NullOr(Schema.String),
  // Per-layer index into the toggled layer's two fields.
  activeFieldIndex: ActiveFieldIndex,
  // Canvas pan/zoom driven by wheel + drag on the center stage.
  scale: Schema.Number,
  offsetX: Schema.Number,
  offsetY: Schema.Number,
  // True while a RenderChain command is in flight; renderNow skips dispatch
  // while pending so the GPU queue never backs up (the in-flight render
  // re-triggers with the newest state when it completes).
  renderPending: Schema.Boolean,
  // Stamp of the chain+draft the currently displayed frame was rendered for;
  // lets update ignore renders that arrived after a newer mutation.
  renderedStamp: Schema.Number,
  // Monotonic counter hashed into the render trigger stamp.
  revision: Schema.Number,
})

export type Model = typeof Model.Type

export const initialModel = (): Model => ({
  route: EditorRoute(),
  source: {
    status: 'empty',
    bitmap: null,
    width: 0,
    height: 0,
    error: null,
  },
  chain: [],
  draft: null,
  selectedLayerId: null,
  activeFieldIndex: {},
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  renderPending: false,
  renderedStamp: 0,
  revision: 0,
})