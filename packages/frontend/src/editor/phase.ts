import { Option, Schema as S } from 'effect'
import { Machine } from 'foldkit/experimental'
import { otherwise, to, when } from 'foldkit/experimental/machine'
import { taggedStruct } from 'foldkit/schema'
import { Layer, LayerIdSchema, moveCurvePoint, resetCurve } from '@lutra/engine'
import { CreateLayer, DecodeImage } from './command'
import { EditorMessage } from './message'

//

/** No image yet — the upload zone is showing and the editor is blocked. */
export const Empty = taggedStruct('Empty')
/** A decode is in flight — the editor is blocked. */
export const Loading = taggedStruct('Loading')
/** The decode failed — the error stage is showing and the editor is blocked. */
export const ErrorState = taggedStruct('Error')
/** An image is loaded and nothing is mid-flight — tools are available. */
export const Idle = taggedStruct('Idle')
/** A layer factory is running. Tool selection is blocked until the command
 *  reports either a constructed draft or a typed creation failure. */
export const Creating = taggedStruct('Creating', { selectedLayerId: S.NullOr(LayerIdSchema) })
/** A draft layer is active: the drawer shows its slider and tool/layer
 *  selection are blocked until the draft is confirmed or cancelled. The
 *  draft layer lives in the state (not the model) so the machine owns every
 *  draft mutation. */
export const Drafting = taggedStruct('Drafting', { layer: Layer })
/** A committed layer is focused in the drawer. */
export const Selected = taggedStruct('Selected', { layerId: LayerIdSchema })

export const EditorPhase = S.Union([Empty, Loading, ErrorState, Idle, Creating, Drafting, Selected])
export type EditorPhase = typeof EditorPhase.Type

export const editorMachine = Machine.define({
  message: EditorMessage,
  state: EditorPhase,
})({
  initial: Empty(),
  states: {
    Drafting: {
      on: {
        ConfirmedDraft: to('Selected', ({ state }) => Selected({ layerId: state.layer.id })),
        CancelledDraft: to('Idle', () => Idle()),
        UpdatedDraftParam: to('Drafting', ({ state, message }) =>
          Drafting({ layer: { ...state.layer, [message.field]: message.value } }),
        ),
        CurvePointDragged: to('Drafting', ({ state, message }) =>
          Drafting({
            layer: moveCurvePoint(state.layer, message.index, message.x, message.y),
          }),
        ),
        CurveReset: to('Drafting', ({ state }) => Drafting({ layer: resetCurve(state.layer) })),
        ChangedDraftLut: [
          when(
            (state) => (state.layer.type === 'lut' ? Option.some(state.layer) : Option.none()),
            'Drafting',
            ({ guardValue, message }) =>
              Drafting({ layer: { ...guardValue, lutId: message.lutId } }),
          ),
        ],
        ClearedImage: to('Empty', () => Empty()),
        EditLoaded: to('Idle', () => Idle()),
        EditLoadFailed: to('Error', () => ErrorState()),
      },
    },
    Empty: {
      on: {
        SelectedImageFile: to(
          'Loading',
          () => Loading(),
          ({ message }) => [DecodeImage({ file: message.file })],
        ),
        EditLoaded: to('Idle', () => Idle()),
        EditLoadFailed: to('Error', () => ErrorState()),
      },
    },
    Error: {
      on: {
        SelectedImageFile: to(
          'Loading',
          () => Loading(),
          ({ message }) => [DecodeImage({ file: message.file })],
        ),
        ImageDecoded: to('Idle', () => Idle()),
        ClearedImage: to('Empty', () => Empty()),
        EditLoaded: to('Idle', () => Idle()),
        EditLoadFailed: to('Error', () => ErrorState()),
      },
    },
    Idle: {
      on: {
        // cleared image.
        ImageFailedToDecode: to('Error', () => ErrorState()),
        ImageDecoded: to('Idle', () => Idle()),
        SelectedTool: to(
          'Creating',
          () => Creating({ selectedLayerId: null }),
          ({ message }) => [CreateLayer({ type: message.type })],
        ),
        SelectedLayer: [
          when(
            (_state, message) => Option.fromNullOr(message.id),
            'Selected',
            ({ guardValue }) => Selected({ layerId: guardValue }),
          ),
        ],
        ClearedImage: to('Empty', () => Empty()),
        EditLoaded: to('Idle', () => Idle()),
        EditLoadFailed: to('Error', () => ErrorState()),
      },
    },
    Loading: {
      on: {
        SelectedImageFile: to(
          'Loading',
          () => Loading(),
          ({ message }) => [DecodeImage({ file: message.file })],
        ),
        ImageDecoded: to('Idle', () => Idle()),
        ImageFailedToDecode: to('Error', () => ErrorState()),
        ClearedImage: to('Empty', () => Empty()),
        EditLoaded: to('Idle', () => Idle()),
        EditLoadFailed: to('Error', () => ErrorState()),
      },
    },
    Creating: {
      on: {
        LayerCreated: to('Drafting', ({ message }) => Drafting({ layer: message.layer })),
        LayerCreationFailed: [
          when(
            (state) => Option.fromNullOr(state.selectedLayerId),
            'Selected',
            ({ guardValue }) => Selected({ layerId: guardValue }),
          ),
          otherwise(to('Idle', () => Idle())),
        ],
        ClearedImage: to('Empty', () => Empty()),
        EditLoaded: to('Idle', () => Idle()),
        EditLoadFailed: to('Error', () => ErrorState()),
      },
    },
    Selected: {
      on: {
        SelectedTool: to(
          'Creating',
          ({ state }) => Creating({ selectedLayerId: state.layerId }),
          ({ message }) => [CreateLayer({ type: message.type })],
        ),
        SelectedLayer: [
          when(
            (_state, message) => Option.fromNullOr(message.id),
            'Selected',
            ({ guardValue }) => Selected({ layerId: guardValue }),
          ),
        ],
        RemovedLayer: [
          when(
            (state, message) => state.layerId === message.id,
            'Idle',
            () => Idle(),
          ),
        ],
        ClearedImage: to('Empty', () => Empty()),
        EditLoaded: to('Idle', () => Idle()),
        EditLoadFailed: to('Error', () => ErrorState()),
      },
    },
  },
})

/** True while an image is loaded and the canvas is showing — the phases the
 *  editor can work in. Empty/Loading/Error render the upload zone (or the
 *  error stage) instead. */
export const hasImage = (phase: EditorPhase) =>
  phase._tag === 'Idle' ||
  phase._tag === 'Creating' ||
  phase._tag === 'Drafting' ||
  phase._tag === 'Selected'
