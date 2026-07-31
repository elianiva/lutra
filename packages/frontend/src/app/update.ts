import { Match } from 'effect'
import { Command } from 'foldkit'
import { GpuBackend } from '../gpu/backend'
import { CanvasRef } from '../gpu/canvas-ref'
import { LutStore } from '../luts/store'
import { PickImageFile, RenderChain, ExportImage } from './command'
import { editorMachine } from './phase'
import { LAYER_UI } from '../editor/layer-meta'
import type { LayerId } from '@lutra/engine'
import type { Model } from './model'
import type { AppMessage } from './message'

type Result = readonly [
  Model,
  ReadonlyArray<Command.Command<AppMessage, never, GpuBackend | LutStore | CanvasRef>>,
]

const ensureFieldIndex = (
  index: Record<LayerId, number>,
  layerId: LayerId,
): Record<LayerId, number> => (index[layerId] === undefined ? { ...index, [layerId]: 0 } : index)

/** Fire a RenderChain command for the current chain + draft. Bumps `revision`
 *  so stale render results can be dropped. When a render is already in
 *  flight, only the revision bump happens — the in-flight render re-triggers
 *  with the newest state when it completes (see the RenderedFrame handler),
 *  which keeps the GPU queue from backing up during slider drags. */
const renderNow = (model: Model): Result => {
  if (!model.source.bitmap) return [model, []]
  // The draft lives in the phase machine (Drafting); the render pipeline
  // still receives it as a plain layer appended after the chain.
  const draft = model.phase._tag === 'Drafting' ? model.phase.layer : null
  const next: Model = { ...model, revision: model.revision + 1 }
  const stamp = next.revision
  if (model.renderPending) {
    return [next, []]
  }
  return [
    { ...next, renderPending: true },
    [
      RenderChain({
        layers: model.chain,
        draft,
        bitmap: model.source.bitmap,
        stamp,
      }),
    ],
  ]
}

/**
 * The editor's update loop. The interaction mode is a foldkit Machine
 * (app/phase.ts): every message steps the machine first, and phase-gated
 * branches bail when the message was `Ignored` (no edge from the current
 * state). Data branches — chain ops, pan/zoom, rendering, export — ignore
 * the machine result and just carry the (unchanged) phase forward.
 */
export const update = (model: Model, message: AppMessage): Result => {
  // Data-level gate the machine can't see: the LUT tool needs the catalog
  // (a LUT draft must reference a real lutId, and the first catalog entry is
  // the default selection). Everything else the editor blocks — no image,
  // loading, error, draft active — is a missing edge in the machine.
  if (
    message._tag === 'SelectedTool' &&
    message.type === 'lut' &&
    (model.catalog === null || model.catalog.length === 0)
  ) {
    return [model, []]
  }

  // Step the phase machine. `from` is the pre-step state: the branches that
  // commit or discard a draft read the draft layer from it.
  const from = model.phase
  const result = editorMachine.step(model.phase, message)
  const phase = result.state
  const transitioned = result._tag === 'Transitioned'
  const machineCommands = transitioned ? result.commands : []

  return Match.value(message).pipe(
    Match.withReturnType<Result>(),
    Match.tagsExhaustive({
      // ---- routing ----
      ChangedRoute: () => [model, []],
      Navigated: () => [model, []],

      // ---- canvas registration ----
      // The mount already wrote the element into the CanvasRef service; the
      // acknowledgment exists for observability (DevTools, Scene, replay).
      CanvasRegistered: () => [model, []],

      // ---- image ----
      FilePickRequested: () => [model, [PickImageFile()]],
      FilePickCancelled: () => [model, []],

      // ---- LUT library ----
      CatalogLoaded: ({ catalog }) => [{ ...model, phase, catalog }, []],
      CatalogFailed: () => [model, []],

      // The machine's edge already dispatched DecodeImage (its args come from
      // the message); the branch only carries the new phase forward. A file
      // selection anywhere but Empty/Error/Loading is ignored.
      SelectedImageFile: () => {
        if (!transitioned) return [model, []]
        return [{ ...model, phase, source: { ...model.source, error: null } }, machineCommands]
      },
      // A decode can only land while Loading (or re-land in Idle/Error for
      // the double-pick race). A completion that lands in Empty — after a
      // ClearedImage — has no edge and is dropped: a stale decode cannot
      // resurrect a cleared image.
      ImageDecoded: ({ bitmap, width, height }) => {
        if (!transitioned) return [model, []]
        return renderNow({ ...model, phase, source: { bitmap, width, height, error: null } })
      },
      ImageFailedToDecode: ({ error }) => {
        if (!transitioned) return [model, []]
        return [{ ...model, phase, source: { ...model.source, error } }, []]
      },
      // The machine moves the phase (draft/selection discarded); the branch
      // resets the model data that only makes sense with an image. In Empty
      // the machine ignores the clear and the resets are no-ops.
      ClearedImage: () => [
        {
          ...model,
          phase,
          source: { bitmap: null, width: 0, height: 0, error: null },
          chain: [],
          activeFieldIndex: {},
          renderPending: false,
          renderedStamp: 0,
          lastRender: null,
        },
        [],
      ],

      // ---- canvas ----
      ScaledCanvas: ({ scale, offsetX, offsetY }) => [
        { ...model, phase, scale, offsetX, offsetY },
        [],
      ],

      // ---- tool panel / draft ----
      SelectedTool: ({ type }) => {
        // The machine built the draft (Drafting); the branch fills in what
        // needs model data: the LUT default selection and the field index.
        if (!transitioned || phase._tag !== 'Drafting') return [model, []]
        const layer = phase.layer
        let next: Model = { ...model, phase }
        if (type === 'lut') {
          const catalog = model.catalog
          // Unreachable — the pre-guard above blocks LUT picks without a
          // catalog before the machine steps. Kept for the type-checker.
          if (!catalog || catalog.length === 0) return [model, []]
          // The machine built this draft from a lut pick, so the layer is the
          // LUT variant; the check narrows it for the spread below.
          if (layer.type !== 'lut') return [model, []]
          next = {
            ...next,
            phase: { ...phase, layer: { ...layer, lutId: catalog[0]!.lut_file } },
            lutPickerOpen: true,
          }
        }
        return renderNow({
          ...next,
          activeFieldIndex: ensureFieldIndex(model.activeFieldIndex, layer.id),
        })
      },
      ConfirmedDraft: () => {
        if (!transitioned || from._tag !== 'Drafting') return [model, []]
        // The machine moved the phase to Selected (focused on the draft); the
        // branch commits the draft layer into the chain.
        return renderNow({
          ...model,
          phase,
          chain: [...model.chain, from.layer],
          lutPickerOpen: false,
        })
      },
      CancelledDraft: () => {
        if (!transitioned || from._tag !== 'Drafting') return [model, []]
        const { [from.layer.id]: _removed, ...restIndex } = model.activeFieldIndex
        return renderNow({
          ...model,
          phase,
          activeFieldIndex: restIndex,
          lutPickerOpen: false,
        })
      },
      UpdatedDraftParam: () => {
        // The machine already applied the param to the draft layer in the
        // new phase; the branch only re-renders.
        if (!transitioned || phase._tag !== 'Drafting') return [model, []]
        return renderNow({ ...model, phase })
      },
      ChangedDraftLut: () => {
        if (!transitioned || phase._tag !== 'Drafting') return [model, []]
        return renderNow({ ...model, phase })
      },
      ToggledLutPicker: () => {
        const lutDraft = phase._tag === 'Drafting' && phase.layer.type === 'lut'
        const lutSelected =
          phase._tag === 'Selected' &&
          model.chain.some((l) => l.id === phase.layerId && l.type === 'lut')
        if (!lutDraft && !lutSelected) return [model, []]
        return [{ ...model, phase, lutPickerOpen: !model.lutPickerOpen }, []]
      },

      // ---- committed chain ----
      SelectedLayer: () => {
        // The machine moved to Selected; the branch closes the picker. A
        // selection without an image (or while a draft is active) has no
        // edge and is ignored.
        if (!transitioned) return [model, []]
        return [{ ...model, phase, lutPickerOpen: false }, []]
      },
      RemovedLayer: ({ id }) => {
        const { [id]: _r, ...restIndex } = model.activeFieldIndex
        // Removing the focused layer also deselects it — the machine's
        // Selected → Idle edge handles that; any other removal leaves the
        // phase alone.
        return renderNow({
          ...model,
          phase,
          chain: model.chain.filter((l) => l.id !== id),
          activeFieldIndex: restIndex,
        })
      },
      ReorderedLayer: ({ from: fromIndex, to }) => {
        if (fromIndex === to) return [model, []]
        const arr = [...model.chain]
        const [moved] = arr.splice(fromIndex, 1)
        if (!moved) return [model, []]
        arr.splice(to, 0, moved)
        return renderNow({ ...model, phase, chain: arr })
      },
      ToggledLayerVisibility: ({ id }) =>
        renderNow({
          ...model,
          phase,
          chain: model.chain.map((l) => (l.id === id ? { ...l, ...{ visible: !l.visible } } : l)),
        }),
      UpdatedLayerParam: ({ id, field, value }) =>
        renderNow({
          ...model,
          phase,
          chain: model.chain.map((l) => (l.id === id ? { ...l, [field]: value } : l)),
        }),
      ChangedLayerLut: ({ id, lutId }) =>
        renderNow({
          ...model,
          phase,
          chain: model.chain.map((l) => (l.id === id ? { ...l, ...{ lutId } } : l)),
        }),
      CycledToggledField: ({ id }) => {
        const layer = model.chain.find((l) => l.id === id)
        if (!layer) return [model, []]
        const ui = LAYER_UI[layer.type]
        if (!ui.toggled) return [model, []]
        const keys = Object.keys(ui.fields)
        const current = model.activeFieldIndex[id] ?? 0
        return [
          {
            ...model,
            phase,
            activeFieldIndex: {
              ...model.activeFieldIndex,
              [id]: (current + 1) % keys.length,
            },
          },
          [],
        ]
      },

      // ---- reorder drag (drag operations reshuffle via ReorderedLayer) ----
      StartedLayerReorder: () => [model, []],
      MovedLayerReorder: () => [model, []],

      // ---- rendering ----
      RenderedFrame: ({ stamp, handle }) => {
        // A newer mutation arrived while this render was in flight — render
        // again with the newest chain+draft instead of dropping the work.
        // The stale frame's handle is NOT stored: `lastRender` always points
        // at the frame the canvas is actually showing.
        if (stamp < model.revision) {
          return renderNow({ ...model, phase, renderPending: false })
        }
        return [
          { ...model, phase, renderPending: false, renderedStamp: stamp, lastRender: handle },
          [],
        ]
      },
      RenderFailed: ({ reason }) => [
        { ...model, phase, renderPending: false, source: { ...model.source, error: reason } },
        [],
      ],

      // ---- export ----
      ExportRequested: () => {
        // Export snapshots exactly the frame the model holds: no render yet,
        // or no frame, means nothing to export.
        if (model.renderedStamp === 0 || !model.lastRender) return [model, []]
        return [model, [ExportImage({ handle: model.lastRender })]]
      },
      ExportFinished: () => [model, []],
      ExportFailed: () => [model, []],
    }),
  )
}
