import { Match } from 'effect'
import { Command } from 'foldkit'
import { GpuBackend } from '../gpu/backend'
import { createLayerFor, PickImageFile, DecodeImage, RenderChain, ExportImage } from './command'
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
 *  so stale render results can be dropped. When a render is already in
 *  flight, only the revision bump happens — the in-flight render re-triggers
 *  with the newest state when it completes (see the RenderedFrame handler),
 *  which keeps the GPU queue from backing up during slider drags. */
const renderNow = (model: Model): Result => {
  if (!model.source.bitmap) return [model, []]
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
      FilePickRequested: () => [model, [PickImageFile()]],
      FilePickCancelled: () => [model, []],
      SelectedImageFile: ({ file }) => [
        { ...model, source: { ...model.source, status: 'loading', error: null } },
        [DecodeImage({ file })],
      ],
      // Always render after decode — with an empty chain the assembler emits a
      // passthrough shader, so the canvas presents the source itself. The
      // RenderChain command yields `Render.afterCommit`, so the canvas is
      // mounted by the time it runs.
      ImageDecoded: ({ bitmap, width, height }) => {
        const next: Model = {
          ...model,
          source: { status: 'loaded', bitmap, width, height, error: null },
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
          renderPending: false,
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
      RenderedFrame: ({ stamp }) => {
        const cleared: Model = { ...model, renderPending: false }
        // A newer mutation arrived while this render was in flight — render
        // again with the newest chain+draft instead of dropping the work.
        if (stamp < cleared.revision) return renderNow(cleared)
        return [{ ...cleared, renderedStamp: stamp }, []]
      },
      RenderFailed: ({ reason }) => [
        { ...model, renderPending: false, source: { ...model.source, error: reason } },
        [],
      ],

      // ---- export ----
      ExportRequested: () => {
        if (model.renderedStamp === 0) return [model, []]
        return [model, [ExportImage()]]
      },
      ExportFinished: () => [model, []],
      ExportFailed: () => [model, []],
    }),
  )
