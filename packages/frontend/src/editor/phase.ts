import { Option, Schema as S } from 'effect'
import { Machine } from 'foldkit/experimental'
import { otherwise, to, when } from 'foldkit/experimental/machine'
import { ts } from 'foldkit/schema'
import { Layer, LayerIdSchema, moveCurvePoint, resetCurve } from '@lutra/engine'
import { CreateLayer, DecodeImage } from './command'
import { EditorMessage } from './message'

// The editor's interaction mode is one state union owning BOTH the image
// lifecycle and the interaction mode, because they gate each other: a draft
// is only reachable from a loaded image, and loading/clearing an image
// discards any draft or selection. Two machines couldn't guard each other
// (machine guards only see machine state + message), so splitting them would
// just move the manual `if` checks back into update.
//
// The machine is not a runtime: `phase` lives in the Model, and update steps
// the machine with every message. Messages with no edge from the current
// state are `Ignored` — the phase is unchanged and update treats them as
// no-ops. That absence of an edge IS the editor's blocking: there is no
// SelectedTool edge from Empty/Loading/Error/Creating/Drafting, so a draft is
// structurally impossible without an image or while another draft is active.

/** No image yet — the upload zone is showing and the editor is blocked. */
export const Empty = ts('Empty')
/** A decode is in flight — the editor is blocked. */
export const Loading = ts('Loading')
/** The decode failed — the error stage is showing and the editor is blocked. */
export const ErrorState = ts('Error')
/** An image is loaded and nothing is mid-flight — tools are available. */
export const Idle = ts('Idle')
/** A layer factory is running. Tool selection is blocked until the command
 *  reports either a constructed draft or a typed creation failure. */
export const Creating = ts('Creating', { selectedLayerId: S.NullOr(LayerIdSchema) })
/** A draft layer is active: the drawer shows its slider and tool/layer
 *  selection are blocked until the draft is confirmed or cancelled. The
 *  draft layer lives in the state (not the model) so the machine owns every
 *  draft mutation. */
export const Drafting = ts('Drafting', { layer: Layer })
/** A committed layer is focused in the drawer. */
export const Selected = ts('Selected', { layerId: LayerIdSchema })

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
        // The curve widget's drag: the engine clamps the move into the
        // curve's invariants (x stays between neighbors, y in [0, 1]) and
        // no-ops for non-toneCurve drafts — the widget only renders for a
        // toneCurve draft, so the edge is a formality for stray messages.
        CurvePointDragged: to('Drafting', ({ state, message }) =>
          Drafting({
            layer: moveCurvePoint(state.layer, message.index, message.x, message.y),
          }),
        ),
        // The curve widget's reset button: every point back to identity.
        CurveReset: to('Drafting', ({ state }) => Drafting({ layer: resetCurve(state.layer) })),
        // Only a LUT draft can swap its LUT; anything else is ignored. The
        // guard extracts the LUT layer so the build sees a narrowed variant.
        ChangedDraftLut: [
          when(
            (state) => (state.layer.type === 'lut' ? Option.some(state.layer) : Option.none()),
            'Drafting',
            ({ guardValue, message }) =>
              Drafting({ layer: { ...guardValue, lutId: message.lutId } }),
          ),
        ],
        ClearedImage: to('Empty', () => Empty()),
        // A different attached edit discards the draft.
        EditLoaded: to('Idle', () => Idle()),
        EditLoadFailed: to('Error', () => ErrorState()),
      },
    },
    Empty: {
      on: {
        // Picking a file starts the decode; this edge carries the command
        // because its args come straight from the message. A file pick
        // anywhere else is ignored — the upload zone is only reachable from
        // Empty/Error/Loading.
        SelectedImageFile: to(
          'Loading',
          () => Loading(),
          ({ message }) => [DecodeImage({ file: message.file })],
        ),
        // The attached edit's load (gallery → /edit/:id) lands the editor
        // straight in Idle — the source + chain are seeded by update.
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
        // Double-pick race: the first pick failed, the second succeeded —
        // the success must still land (the last completion wins, matching
        // the pre-machine behavior). After a clear the phase is Empty, so a
        // stale success can never resurrect a cleared image.
        ImageDecoded: to('Idle', () => Idle()),
        ClearedImage: to('Empty', () => Empty()),
        EditLoaded: to('Idle', () => Idle()),
        EditLoadFailed: to('Error', () => ErrorState()),
      },
    },
    Idle: {
      on: {
        // Double-pick race: the first pick succeeded, the second failed —
        // the current pick failed, so the error stage shows. After a clear
        // the phase is Empty, so a stale completion can never clobber a
        // cleared image.
        ImageFailedToDecode: to('Error', () => ErrorState()),
        // ...and when both picks succeed, the last one to land wins.
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
        // Navigating to a different attached edit re-loads in place.
        EditLoaded: to('Idle', () => Idle()),
        EditLoadFailed: to('Error', () => ErrorState()),
      },
    },
    Loading: {
      on: {
        // A re-pick while decoding supersedes the first pick: the self-loop
        // stays in Loading and fires a second decode.
        SelectedImageFile: to(
          'Loading',
          () => Loading(),
          ({ message }) => [DecodeImage({ file: message.file })],
        ),
        ImageDecoded: to('Idle', () => Idle()),
        ImageFailedToDecode: to('Error', () => ErrorState()),
        ClearedImage: to('Empty', () => Empty()),
        // An attached-edit load landing mid-decode supersedes the pick.
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
        // A new tool first runs the engine factory as a Command. The phase
        // keeps the selected layer id so a typed failure can restore focus.
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
        // Removing the focused layer deselects it. Removing any other layer
        // leaves the selection alone (no edge fires).
        RemovedLayer: [
          when(
            (state, message) => state.layerId === message.id,
            'Idle',
            () => Idle(),
          ),
        ],
        ClearedImage: to('Empty', () => Empty()),
        // A different attached edit clears the selection.
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
