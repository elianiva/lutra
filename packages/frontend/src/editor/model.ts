import { Schema } from 'effect'
import { RenderHandle } from '../gpu/backend'
import { SourceImage, CompareMode, Catalog, SaveError, PresentState } from './message'
import { LayerIdSchema, LutIdSchema, Layer, LAYER_TYPES } from '@lutra/engine'
import { EditIdSchema } from '@lutra/store'
import * as ExportDialog from '../export-dialog'
import { EditorPhase, editorMachine } from './phase'
import { DownloadState } from '../offline/model'
import { LutLoadError } from '../luts/store'
import { LayerCreationError } from '../errors'


const ActiveFieldIndex = Schema.Record(LayerIdSchema, Schema.Number)

const ActiveMixerColor = Schema.Record(LayerIdSchema, Schema.Number)

const AttachedEdit = Schema.NullOr(
  Schema.Struct({
    id: Schema.NullOr(EditIdSchema),
    source: Schema.Uint8Array,
  }),
)

const SaveStatus = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal('idle') }),
  Schema.Struct({ _tag: Schema.Literal('saving') }),
  Schema.Struct({ _tag: Schema.Literal('saved'), at: Schema.Number }),
  Schema.Struct({ _tag: Schema.Literal('failed'), error: SaveError }),
])

export const Model = Schema.Struct({
  source: SourceImage,
  chain: Schema.Array(Layer),
  // clears it.
  layerCreationError: Schema.NullOr(LayerCreationError),
  phase: EditorPhase,
  activeFieldIndex: ActiveFieldIndex,
  activeMixerColor: ActiveMixerColor,
  scale: Schema.Number,
  offsetX: Schema.Number,
  offsetY: Schema.Number,
  catalog: Schema.NullOr(Catalog),
  catalogError: Schema.NullOr(LutLoadError),
  attachedEdit: AttachedEdit,
  saveStatus: SaveStatus,
  // canvas — docs/adr/0002-lut-library). The drawer's LUT rows keep summary + sliders
  lutBarOpen: Schema.Boolean,
  // LUT layer) — never touches the chain or the machine (docs/adr/0010-editor-ui
  previewLut: Schema.NullOr(LutIdSchema),
  // category at render.
  lutTab: Schema.Union([Schema.Literal('recents'), Schema.String]),
  lutRecents: Schema.Array(LutIdSchema),
  // rendered by the thumb worker (docs/adr/0002-lut-library). Presentation-only — the
  lutThumbs: Schema.Record(Schema.String, Schema.String),
  // Per-LUT offline library states (docs/adr/0007-offline): lutId → the cube's
  lutDownloads: Schema.Record(Schema.String, DownloadState),
  online: Schema.Boolean,
  offlineLutNotice: Schema.NullOr(Schema.String),
  compareMode: CompareMode,
  compareSplitAt: Schema.Number,
  compareToggleBefore: Schema.Boolean,
  // Which bottom sheet is open on mobile (docs/adr/0010-editor-ui.md): under the `lg`
  // hidden.
  mobileSheet: Schema.NullOr(Schema.Union([Schema.Literal('tools'), Schema.Literal('layers')])),
  // while pending so the GPU queue never backs up (the in-flight render
  renderPending: Schema.Boolean,
  presentPending: Schema.Boolean,
  pendingPresent: Schema.NullOr(PresentState),
  renderedStamp: Schema.Number,
  // The GPU frame handle of the last rendered frame; export snapshots from
  lastRender: Schema.NullOr(Schema.instanceOf(RenderHandle)),
  // read back asynchronously from the GPU (null until the first readback
  bins: Schema.NullOr(Schema.instanceOf(Uint32Array)),
  revision: Schema.Number,
  // The shared export-dialog machine (docs/adr/0004-export): settings, encode
  exportDialog: ExportDialog.Model,
  hoveredTool: Schema.NullOr(Schema.Literals(LAYER_TYPES)),
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
  layerCreationError: null,
  compareSplitAt: 0.5,
  compareToggleBefore: false,
  exportDialog: ExportDialog.init({ id: 'export-dialog', fileStem: 'lutra-edit' }),
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
  presentPending: false,
  pendingPresent: null,
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
  hoveredTool: null,
})
