import { Match } from 'effect'
import { Command } from 'foldkit'
import { GpuBackend } from '@lutra/engine'
import { createLayerFor, DecodeImage, RenderChain, PaintCanvas, ExportImage } from './command'
import { LAYER_UI } from '../editor/layerMeta'
import type { Layer, LayerType } from '@lutra/engine'
import type { Model } from './model'
import type { AppMessage } from './message'

type Result = readonly [Model, ReadonlyArray<Command.Command<AppMessage, never, GpuBackend>>]

const LAYER_TYPES = Object.keys(LAYER_UI)

const ensureFieldIndex = (
  index: Record<string, number>,
  layerId: string,
): Record<string, number> =>
  index[layerId] === undefined ? { ...index, [layerId]: 0 } : index

/** Fire a RenderChain command for the current chain + draft. Bumps `revision`
 *  so stale render results can be dropped. */
const renderNow = (model: Model): Result => {
  if (!model.source.bitmap) return [model, []]
  const next: Model = { ...model, revision: model.revision + 1 }
  const stamp = next.revision
  return [
    next,
    [
      RenderChain({
        layers: model.chain,
        draft: model.draft,
        bitmap: model.source.bitmap,
        stamp,
      }),
    ],
  ]
}

export const update = (model: Model, message: AppMessage): Result =>
  Match.value(message).pipe(
    Match.withReturnType<Result>(),
    Match.tagsExhaustive({
      // ---- routing ----
      ChangedRoute: () => [model, []],
      Navigated: () => [model, []],

      // ---- image ----
      SelectedImageFile: ({ file }) => [
        { ...model, source: { ...model.source, status: 'loading', error: null } },
        [DecodeImage({ file })],
      ],
      ImageDecoded: ({ bitmap, width, height }) => {
        const next: Model = {
          ...model,
          source: { status: 'loaded', bitmap, width, height, error: null },
        }
        // With an empty chain there's nothing for the GPU to do; paint the
        // source straight to the canvas so the first image is visible.
        if (next.chain.length === 0 && next.draft === null) {
          return [next, [PaintCanvas({ bitmap })]]
        }
        return renderNow(next)
      },
      ImageFailedToDecode: ({ error }) => [
        { ...model, source: { ...model.source, status: 'error', error } },
        [],
      ],
      ClearedImage: () => [
        {
          ...model,
          source: { status: 'empty', bitmap: null, width: 0, height: 0, error: null },
          chain: [],
          draft: null,
          selectedLayerId: null,
          activeFieldIndex: {},
          renderedBitmap: null,
          renderedStamp: 0,
        },
        [],
      ],

      // ---- canvas ----
      ScaledCanvas: ({ scale, offsetX, offsetY }) => [
        { ...model, scale, offsetX, offsetY },
        [],
      ],

      // ---- tool panel / draft ----
      SelectedTool: ({ type }) => {
        if (model.draft || !LAYER_TYPES.includes(type)) return [model, []]
        const layer = createLayerFor(type as LayerType)
        const withIndex = {
          ...model,
          draft: layer,
          selectedLayerId: layer.id,
          activeFieldIndex: ensureFieldIndex(model.activeFieldIndex, layer.id),
        }
        return renderNow(withIndex)
      },
      ConfirmedDraft: () => {
        if (!model.draft) return [model, []]
        return renderNow({
          ...model,
          chain: [...model.chain, model.draft],
          draft: null,
          selectedLayerId: model.draft.id,
        })
      },
      CancelledDraft: () => {
        if (!model.draft) return [model, []]
        const draftId = model.draft.id
        const { [draftId]: _removed, ...restIndex } = model.activeFieldIndex
        return renderNow({
          ...model,
          draft: null,
          selectedLayerId: null,
          activeFieldIndex: restIndex,
        } as Model)
      },
      UpdatedDraftParam: ({ field, value }) => {
        if (!model.draft) return [model, []]
        return renderNow({
          ...model,
          draft: { ...model.draft, [field]: value } as Layer,
        })
      },

      // ---- committed chain ----
      SelectedLayer: ({ id }) => [
        { ...model, selectedLayerId: id, draft: null },
        [],
      ],
      RemovedLayer: ({ id }) => {
        const { [id]: _r, ...restIndex } = model.activeFieldIndex
        return renderNow({
          ...model,
          chain: model.chain.filter((l) => l.id !== id),
          selectedLayerId: model.selectedLayerId === id ? null : model.selectedLayerId,
          activeFieldIndex: restIndex,
        })
      },
      ReorderedLayer: ({ from, to }) => {
        if (from === to) return [model, []]
        const arr = [...model.chain]
        const [moved] = arr.splice(from, 1)
        if (!moved) return [model, []]
        arr.splice(to, 0, moved)
        return renderNow({ ...model, chain: arr })
      },
      ToggledLayerVisibility: ({ id }) =>
        renderNow({
          ...model,
          chain: model.chain.map((l) =>
            l.id === id ? ({ ...l, visible: !l.visible } as Layer) : l,
          ),
        }),
      UpdatedLayerParam: ({ id, field, value }) =>
        renderNow({
          ...model,
          chain: model.chain.map((l) =>
            l.id === id ? ({ ...l, [field]: value } as Layer) : l,
          ),
        }),
      CycledToggledField: ({ id }) => {
        const layer = model.chain.find((l) => l.id === id)
        if (!layer) return [model, []]
        const ui = LAYER_UI[layer.type as LayerType]
        if (!ui.toggled) return [model, []]
        const keys = Object.keys(ui.fields)
        const current = model.activeFieldIndex[id] ?? 0
        return [
          {
            ...model,
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
      RenderedFrame: ({ bitmap, stamp }) => {
        if (stamp < model.revision) return [model, []] // stale render
        return [
          { ...model, renderedBitmap: bitmap, renderedStamp: stamp },
          [PaintCanvas({ bitmap })],
        ]
      },
      RenderFailed: ({ reason }) => [
        { ...model, source: { ...model.source, error: reason } },
        [],
      ],
      PaintedCanvas: () => [model, []],

      // ---- export ----
      ExportRequested: () => {
        if (!model.renderedBitmap) return [model, []]
        return [model, [ExportImage({ bitmap: model.renderedBitmap })]]
      },
      ExportFinished: () => [model, []],
      ExportFailed: () => [model, []],
    }),
  )