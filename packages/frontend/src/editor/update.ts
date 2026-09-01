import { Array, Match, Option, pipe } from 'effect'
import { Command, Update } from 'foldkit'
import * as ExportDialog from '../export-dialog'
import type { GpuBackend } from '../gpu/backend'
import type { CanvasRef } from '../gpu/canvas-ref'
import type { LutStore } from '../luts/store'
import type { LutThumbnailer } from '../thumbs/worker-layer'
import {
  SnapshotForExport,
  SaveLutRecents,
  GenerateLutThumb,
  RevokeLutThumbs,
  PickImageFile,
  RenderChain,
  PresentFrame,
  ReadHistogram,
  SaveEdit,
} from './command'
import { editorMachine } from './phase'
import { LAYER_UI } from '../editor/layer-meta'
import { lutTarget } from './lut-bar'
import { visibleEntries } from './lut-bar/catalog'
import { moveCurvePoint, resetCurve } from '@lutra/engine'
import type { ImageEncoder, LayerId, LutId } from '@lutra/engine'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import type { EditStore } from '@lutra/store'
import type { Model } from './model'
import { EditorMessage, EditorOutMessage, type PresentState } from './message'

export type UpdateReturn = Update.ReturnWithOutMessage<
  Model,
  EditorMessage,
  EditorOutMessage,
  GpuBackend | LutStore | CanvasRef | ImageEncoder | KeyValueStore | EditStore | LutThumbnailer
>

const ensureFieldIndex = (index: Record<LayerId, number>, layerId: LayerId) =>
  index[layerId] === undefined ? { ...index, [layerId]: 0 } : index

/** The compare presentation state (docs/adr/0010-editor-ui) the blit needs: the mode,
 *  the split position in image space, and the toggle side. Carried by every
 *  RenderChain (the render's final blit) and by PresentFrame (blit-only). */
const presentState = (model: Model) => ({
  mode: model.compareMode,
  showBefore: model.compareToggleBefore,
  splitAt: model.compareSplitAt,
})

/** Present coalescing — like renderNow's renderPending guard but for the
 *  blit-only PresentFrame (divider drag at 60 Hz vs one GPU submit at a
 *  time). While a present is in flight, overwrites pendingPresent with the
 *  latest value; FramePresented flushes it. */
const presentNow = (model: Model, present: PresentState): UpdateReturn => {
  if (!model.source.bitmap) {
    return { model }
  }
  if (model.presentPending) {
    return { model: { ...model, pendingPresent: present } }
  }
  return {
    model: { ...model, pendingPresent: null, presentPending: true },
    commands: [PresentFrame({ present })],
  }
}

/** Fire a RenderChain command for the current chain + draft. Bumps `revision`
 *  so stale render results can be dropped. When a render is already in
 *  flight, only the revision bump happens — the in-flight render re-triggers
 *  with the newest state when it completes (see the RenderedFrame handler),
 *  which keeps the GPU queue from backing up during slider drags.
 *
 *  A bar hover preview (docs/adr/0002-lut-library) swaps the active LUT target's lutId
 *  at render time — the draft or the focused chain LUT layer — without
 *  touching the chain or the machine (the draft's lutId stays machine-owned).
 *  Belt-and-suspenders: when no LUT target exists the preview is simply not
 *  applied, so a leaked value can never corrupt a non-LUT render. */
const renderNow = (model: Model): UpdateReturn => {
  if (!model.source.bitmap) {
    return { model }
  }
  const draft = model.phase._tag === 'Drafting' ? model.phase.layer : null
  let layers = model.chain
  let draftLayer = draft
  const { previewLut } = model
  const { phase } = model
  if (previewLut) {
    if (draft?.type === 'lut') {
      draftLayer = { ...draft, lutId: previewLut }
    } else if (phase._tag === 'Selected') {
      const sel = layers.find((l) => l.id === phase.layerId)
      if (sel?.type === 'lut') {
        layers = layers.map((l) => (l.id === sel.id ? { ...l, lutId: previewLut } : l))
      }
    }
  }
  const next: Model = { ...model, revision: model.revision + 1 }
  const stamp = next.revision
  if (model.renderPending) {
    return { model: next }
  }
  return {
    model: { ...next, renderPending: true },
    commands: [
      RenderChain({
        bitmap: model.source.bitmap,
        draft: draftLayer,
        layers,
        present: presentState(model),
        stamp,
      }),
    ],
  }
}

/**
 * Dispatch the save for the current image. Requires a loaded image AND a
 * rendered frame (the thumbnail is the graded result) and an attached-edit
 * record (every loaded image has one — a gallery-open carries the stored
 * bytes, a fresh pick carries the picked file's). `fork` forces a new Edit id
 * (Save as); otherwise the attached id is used — null when the image was
 * picked fresh in-editor, which also creates a new Edit. A save already in
 * flight is ignored (at most one at a time, like the export encode).
 */
const startSave = (model: Model, fork: boolean): UpdateReturn => {
  const attached = model.attachedEdit
  if (!model.source.bitmap || !model.lastRender || !attached) {
    return { model }
  }
  if (model.saveStatus._tag === 'saving') {
    return { model }
  }
  const id = fork ? null : attached.id
  return {
    model: { ...model, saveStatus: { _tag: 'saving' } },
    commands: [
      SaveEdit({
        chain: model.chain,
        handle: model.lastRender,
        id,
        source: attached.source,
      }),
    ],
  }
}

/** Most-recently-applied lutIds, newest first, deduped, capped at 12. The
 *  bar is the only caller (its click commits); the `catalog[0]` auto-default
 *  in SelectedTool never bumps (docs/adr/0002-lut-library D6). */
const RECENTS_CAP = 12
const bumpRecents = (model: Model, lutId: LutId): Model => ({
  ...model,
  lutRecents: [lutId, ...model.lutRecents.filter((id) => id !== lutId)].slice(0, RECENTS_CAP),
})

/**
 * The per-photo LUT thumbnails (docs/adr/0002-lut-library) generate lazily, per visible
 * group: one `GenerateLutThumb` per filmstrip entry that has no preview
 * yet. Fired on tab select and on bar-open (the LUT-draft auto-open and the
 * chevron), so the visible strip fills in without ever prefetching groups
 * the user does not browse. A lutId whose generation failed stays missing
 * and is retried on the next visit of its group.
 */
const generateThumbCommands = (
  model: Model,
): readonly Command.Command<EditorMessage, never, LutStore | LutThumbnailer>[] => {
  const { bitmap } = model.source
  if (!model.lutBarOpen || !bitmap || !model.catalog) {
    return []
  }
  return pipe(
    visibleEntries(model.catalog, model.lutTab, model.lutRecents),
    Array.filter((entry) => model.lutThumbs[entry.lut_file] === undefined),
    Array.map((entry) => GenerateLutThumb({ bitmap, lutId: entry.lut_file })),
  )
}

/**
 * The persistence-during-preview rule (docs/adr/0002-lut-library D7): save and export
 * snapshot from `model.lastRender` (thumbnail / export frame), which would
 * otherwise capture the hovered look. While a bar preview is active, the
 * click dismisses the preview instead of acting — the next click proceeds.
 * One swallowed click in a rare case beats silently exporting a look the
 * chain doesn't contain.
 */
const dismissPreviewOr = (model: Model, proceed: () => UpdateReturn): UpdateReturn => {
  if (model.previewLut !== null) {
    return renderNow({ ...model, previewLut: null })
  }
  return proceed()
}

/**
 * The editor's update loop. The interaction mode is a foldkit Machine
 * (./phase.ts): every message steps the machine first, and phase-gated
 * branches bail when the message was `Ignored` (no edge from the current
 * state). Data branches — chain ops, pan/zoom, rendering, export — ignore
 * the machine result and just carry the (unchanged) phase forward.
 *
 * Returns the `[Model, Commands, Option<OutMessage>]` 3-tuple like the
 * gallery: the OutMessage is how the editor tells the root "a new Edit was
 * created — navigate onto it" (`EditCreated`); the root owns navigation.
 * Most arms emit `Option.none()`.
 */
export const update = (model: Model, message: EditorMessage): UpdateReturn => {
  if (
    message._tag === 'SelectedTool' &&
    message.type === 'lut' &&
    (model.catalog === null || model.catalog.length === 0)
  ) {
    return { model }
  }

  const from = model.phase
  const result = editorMachine.step(model.phase, message)
  const phase = result.state
  const transitioned = result._tag === 'Transitioned'
  const machineCommands = transitioned ? result.commands : []

  return Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      ToggledMobileSheet: ({ sheet }) => ({
        model: { ...model, mobileSheet: model.mobileSheet === sheet ? null : sheet, phase },
      }),

      CanvasRegistered: () => ({ model }),

      FilePickRequested: () => ({ model, commands: [PickImageFile()] }),
      FilePickCancelled: () => ({ model }),

      CatalogLoaded: ({ catalog }) => ({
        model: { ...model, catalog, catalogError: null, phase },
      }),
      CatalogFailed: ({ error }) => ({ model: { ...model, catalogError: error, phase } }),

      OfflineFileFetching: ({ lutId }) => ({
        model: {
          ...model,
          lutDownloads: { ...model.lutDownloads, [lutId]: 'fetching' },
          phase,
        },
      }),
      OfflineFileDownloaded: ({ lutId }) => ({
        model: {
          ...model,
          lutDownloads: { ...model.lutDownloads, [lutId]: 'downloaded' },
          offlineLutNotice: null,
          phase,
        },
      }),
      OfflineConnectivityChanged: ({ online }) => ({ model: { ...model, online, phase } }),
      OfflineLutUnavailable: ({ lutId }) => {
        const name = model.catalog?.find((entry) => entry.lut_file === lutId)?.name ?? lutId
        return {
          model: {
            ...model,
            offlineLutNotice: `${name} isn't downloaded yet — connect once and the offline library finishes preparing.`,
            phase,
          },
        }
      },

      SelectedImageFile: () => {
        if (!transitioned) {
          return { model }
        }
        return {
          model: { ...model, phase, source: { ...model.source, error: null } },
          commands: machineCommands,
        }
      },
      ImageDecoded: ({ bitmap, width, height, source }) => {
        if (!transitioned) {
          return { model }
        }
        // Close the previous decoded bitmap before replacing it — otherwise a large photo leaks decoded pixels
        // until the tab is closed.
        if (model.source.bitmap && model.source.bitmap !== bitmap) {
          try {
            model.source.bitmap.close()
          } catch {
            void 0
          }
        }
        const urls = Object.values(model.lutThumbs)
        const { model: next, commands = [] } = renderNow({
          ...model,
          phase,
          source: { bitmap, error: null, height, width },
          attachedEdit: { id: null, source },
          layerCreationError: null,
          saveStatus: { _tag: 'idle' },
          lutThumbs: {},
          mobileSheet: null,
          presentPending: false,
          pendingPresent: null,
        })
        return {
          model: next,
          commands: urls.length > 0 ? [...commands, RevokeLutThumbs({ urls })] : commands,
        }
      },
      ImageFailedToDecode: ({ error }) => {
        if (!transitioned) {
          return { model }
        }
        return { model: { ...model, phase, source: { ...model.source, error } } }
      },
      ClearedImage: () => {
        // Free the decoded bitmap when the image is cleared.
        if (model.source.bitmap) {
          try {
            model.source.bitmap.close()
          } catch {
            void 0
          }
        }
        const urls = Object.values(model.lutThumbs)
        return {
          model: {
            ...model,
            phase,
            source: { bitmap: null, error: null, height: 0, width: 0 },
            chain: [],
            layerCreationError: null,
            activeFieldIndex: {},
            activeMixerColor: {},
            renderPending: false,
            presentPending: false,
            pendingPresent: null,
            renderedStamp: 0,
            lastRender: null,
            bins: null,
            compareSplitAt: 0.5,
            previewLut: null,
            mobileSheet: null,
            attachedEdit: null,
            saveStatus: { _tag: 'idle' },
            lutThumbs: {},
          },
          commands: urls.length > 0 ? [RevokeLutThumbs({ urls })] : [],
        }
      },

      EditLoaded: ({ id, chain, bitmap, width, height, source }) => {
        if (!transitioned) {
          return { model }
        }
        if (model.source.bitmap && model.source.bitmap !== bitmap) {
          try {
            model.source.bitmap.close()
          } catch {
            void 0
          }
        }
        const urls = Object.values(model.lutThumbs)
        const { model: next, commands = [] } = renderNow({
          ...model,
          phase,
          chain,
          source: { bitmap, error: null, height, width },
          layerCreationError: null,
          activeFieldIndex: {},
          activeMixerColor: {},
          lutBarOpen: false,
          previewLut: null,
          compareSplitAt: 0.5,
          mobileSheet: null,
          attachedEdit: { id, source },
          saveStatus: { _tag: 'idle' },
          lutThumbs: {},
          presentPending: false,
          pendingPresent: null,
        })
        return {
          model: next,
          commands: urls.length > 0 ? [...commands, RevokeLutThumbs({ urls })] : commands,
        }
      },
      EditLoadFailed: ({ error }) => {
        if (!transitioned) {
          return { model }
        }
        return {
          model: {
            ...model,
            activeFieldIndex: {},
            activeMixerColor: {},
            chain: [],
            phase,
            source: { ...model.source, error },
          },
        }
      },

      SaveRequested: () => dismissPreviewOr({ ...model, phase }, () => startSave(model, false)),
      SaveAsRequested: () => dismissPreviewOr({ ...model, phase }, () => startSave(model, true)),
      EditSaved: ({ id, savedAt }) => {
        const attached = model.attachedEdit
        if (!attached) {
          return { model: { ...model, phase } }
        }
        const out =
          attached.id === id ? Option.none() : Option.some(EditorOutMessage.EditCreated({ id }))
        return Update.withOutMessage(
          {
            model: {
              ...model,
              attachedEdit: { ...attached, id },
              phase,
              saveStatus: { _tag: 'saved', at: savedAt },
            },
          },
          Option.isSome(out) ? out.value : undefined,
        )
      },
      SaveFailed: ({ error }) => ({
        model: { ...model, phase, saveStatus: { _tag: 'failed', error } },
      }),

      ScaledCanvas: ({ scale, offsetX, offsetY }) => ({
        model: { ...model, offsetX, offsetY, phase, scale },
      }),

      SelectedTool: () => {
        if (!transitioned || phase._tag !== 'Creating') {
          return { model }
        }
        return {
          model: {
            ...model,
            layerCreationError: null,
            lutBarOpen: false,
            mobileSheet: 'layers',
            phase,
            previewLut: null,
          },
          commands: machineCommands,
        }
      },
      LayerCreated: () => {
        if (!transitioned || from._tag !== 'Creating' || phase._tag !== 'Drafting') {
          return { model }
        }
        const { layer } = phase
        let next: Model = {
          ...model,
          layerCreationError: null,
          mobileSheet: 'layers',
          phase,
          previewLut: null,
        }
        if (layer.type === 'lut') {
          const { catalog } = model
          if (!catalog || catalog.length === 0) {
            return { model }
          }
          next = {
            ...next,
            lutBarOpen: true,
            phase: { ...phase, layer: { ...layer, lutId: catalog[0]!.lut_file } },
          }
        }
        const rendered = {
          ...next,
          activeFieldIndex: ensureFieldIndex(model.activeFieldIndex, layer.id),
        }
        const { model: after, commands = [] } = renderNow(rendered)
        return { model: after, commands: [...commands, ...generateThumbCommands(rendered)] }
      },
      LayerCreationFailed: ({ error }) => {
        if (!transitioned || from._tag !== 'Creating') {
          return { model }
        }
        return { model: { ...model, layerCreationError: error, phase } }
      },
      ConfirmedDraft: () => {
        if (!transitioned || from._tag !== 'Drafting') {
          return { model }
        }
        return renderNow({
          ...model,
          chain: [...model.chain, from.layer],
          lutBarOpen: false,
          phase,
          previewLut: null,
        })
      },
      CancelledDraft: () => {
        if (!transitioned || from._tag !== 'Drafting') {
          return { model }
        }
        const { [from.layer.id]: _removed, ...restIndex } = model.activeFieldIndex
        const { [from.layer.id]: _removedColor, ...restMixer } = model.activeMixerColor
        return renderNow({
          ...model,
          activeFieldIndex: restIndex,
          activeMixerColor: restMixer,
          lutBarOpen: false,
          phase,
          previewLut: null,
        })
      },
      UpdatedDraftParam: () => {
        if (!transitioned || phase._tag !== 'Drafting') {
          return { model }
        }
        return renderNow({ ...model, phase })
      },
      ChangedDraftLut: ({ lutId }) => {
        if (!transitioned || phase._tag !== 'Drafting') {
          return { model }
        }
        const next = bumpRecents({ ...model, phase, previewLut: null }, lutId)
        const { model: rendered, commands = [] } = renderNow(next)
        return {
          model: rendered,
          commands: [...commands, SaveLutRecents({ recents: next.lutRecents })],
        }
      },
      ToggledLutPicker: () => {
        if (Option.isNone(lutTarget(model.phase, model.chain))) {
          return { model }
        }
        const open = !model.lutBarOpen
        const next = {
          ...model,
          lutBarOpen: open,
          phase,
          previewLut: open ? model.previewLut : null,
        }
        return { model: next, commands: open ? generateThumbCommands(next) : [] }
      },

      PreviewedLut: ({ lutId }) => {
        if (!model.source.bitmap) {
          return { model }
        }
        if (Option.isNone(lutTarget(model.phase, model.chain))) {
          return { model }
        }
        if (model.previewLut === lutId) {
          return { model }
        }
        return renderNow({ ...model, offlineLutNotice: null, phase, previewLut: lutId })
      },
      SelectedLutTab: ({ tab }) => {
        const next = { ...model, lutTab: tab, offlineLutNotice: null, phase }
        return { model: next, commands: generateThumbCommands(next) }
      },
      LutRecentsLoaded: ({ recents }) => ({ model: { ...model, lutRecents: recents, phase } }),
      LutRecentsSaved: () => ({ model }),

      LutThumbGenerated: ({ lutId, url, bitmap }) => {
        if (model.source.bitmap !== bitmap) {
          return { model, commands: [RevokeLutThumbs({ urls: [url] })] }
        }
        return { model: { ...model, lutThumbs: { ...model.lutThumbs, [lutId]: url }, phase } }
      },
      LutThumbFailed: () => ({ model }),
      LutThumbsRevoked: () => ({ model }),

      SelectedLayer: () => {
        if (!transitioned) {
          return { model }
        }
        return {
          model: { ...model, lutBarOpen: false, mobileSheet: 'layers', phase, previewLut: null },
        }
      },
      RemovedLayer: ({ id }) => {
        const { [id]: _r, ...restIndex } = model.activeFieldIndex
        const { [id]: _rc, ...restMixer } = model.activeMixerColor
        return renderNow({
          ...model,
          activeFieldIndex: restIndex,
          activeMixerColor: restMixer,
          chain: model.chain.filter((l) => l.id !== id),
          phase,
          previewLut: null,
        })
      },
      ReorderedLayer: ({ from: fromIndex, to }) => {
        if (fromIndex === to) {
          return { model }
        }
        const arr = [...model.chain]
        const [moved] = arr.splice(fromIndex, 1)
        if (!moved) {
          return { model }
        }
        arr.splice(to, 0, moved)
        return renderNow({ ...model, chain: arr, phase })
      },
      ToggledLayerVisibility: ({ id }) =>
        renderNow({
          ...model,
          chain: model.chain.map((l) =>
            l.id === id
              ? {
                  ...l,
                  visible: !l.visible,
                }
              : l,
          ),
          phase,
        }),
      UpdatedLayerParam: ({ id, field, value }) =>
        renderNow({
          ...model,
          chain: model.chain.map((l) => (l.id === id ? { ...l, [field]: value } : l)),
          phase,
        }),
      ChangedLayerLut: ({ id, lutId }) => {
        // The bar's click commits the real value: clear any hover preview
        // (a stale one would otherwise double-apply) and bump recents (D6).
        const next = bumpRecents(
          {
            ...model,
            chain: model.chain.map((l) =>
              l.id === id
                ? {
                    ...l,
                    lutId,
                  }
                : l,
            ),
            phase,
            previewLut: null,
          },
          lutId,
        )
        const { model: rendered, commands = [] } = renderNow(next)
        return {
          model: rendered,
          commands: [...commands, SaveLutRecents({ recents: next.lutRecents })],
        }
      },
      CycledToggledField: ({ id }) => {
        const layer = model.chain.find((l) => l.id === id)
        if (!layer) {
          return { model }
        }
        const ui = LAYER_UI[layer.type]
        if (!ui.toggled) {
          return { model }
        }
        const keys = Object.keys(ui.fields)
        const current = model.activeFieldIndex[id] ?? 0
        return {
          model: {
            ...model,
            activeFieldIndex: {
              ...model.activeFieldIndex,
              [id]: (current + 1) % keys.length,
            },
            phase,
          },
        }
      },
      SelectedMixerColor: ({ id, color }) => ({
        model: {
          ...model,
          activeMixerColor: {
            ...model.activeMixerColor,
            [id]: Math.min(7, Math.max(0, Math.round(color))),
          },
          phase,
        },
      }),

      CurvePointDragged: ({ index, x, y }) => {
        if (model.phase._tag === 'Selected') {
          const id = model.phase.layerId
          const layer = model.chain.find((l) => l.id === id)
          if (!layer || layer.type !== 'toneCurve') {
            return { model }
          }
          return renderNow({
            ...model,
            chain: model.chain.map((l) => (l.id === id ? moveCurvePoint(l, index, x, y) : l)),
            phase,
          })
        }
        if (!transitioned) {
          return { model }
        }
        return renderNow({ ...model, phase })
      },
      CurveReset: () => {
        if (model.phase._tag === 'Selected') {
          const id = model.phase.layerId
          const layer = model.chain.find((l) => l.id === id)
          if (!layer || layer.type !== 'toneCurve') {
            return { model }
          }
          return renderNow({
            ...model,
            chain: model.chain.map((l) => (l.id === id ? resetCurve(l) : l)),
            phase,
          })
        }
        if (!transitioned) {
          return { model }
        }
        return renderNow({ ...model, phase })
      },

      StartedLayerReorder: () => ({ model }),
      MovedLayerReorder: () => ({ model }),

      // compare (before/after viewing)
      // Presentation-only state (docs/adr/0010-editor-ui): mode and split changes
      // dispatch the blit-only PresentFrame, never a chain render — the
      // graded side keeps showing the last rendered frame.
      ChangedCompareMode: ({ mode }) => {
        if (!model.source.bitmap) {
          return { model }
        }
        // The Toggle segment is a flip button while active: selecting Toggle
        // again flips the canvas between the source image and the graded
        // output. Entering Toggle reveals the source first (the act of
        // enabling = "show me before" — CONTEXT.md "Compare").
        const next =
          mode === 'toggle' && model.compareMode === 'toggle'
            ? { ...model, compareToggleBefore: !model.compareToggleBefore, phase }
            : { ...model, compareMode: mode, compareToggleBefore: mode === 'toggle', phase }
        return presentNow(next, presentState(next))
      },
      ChangedSplitPosition: ({ position }) => {
        if (!model.source.bitmap) {
          return { model }
        }
        const next = {
          ...model,
          compareSplitAt: Math.min(1, Math.max(0, position)),
          phase,
        }
        return presentNow(next, presentState(next))
      },
      FramePresented: () => {
        const pending = model.pendingPresent
        if (pending) {
          return {
            model: { ...model, pendingPresent: null, presentPending: true },
            commands: [PresentFrame({ present: pending })],
          }
        }
        return { model: { ...model, presentPending: false } }
      },

      RenderedFrame: ({ stamp, handle }) => {
        // A newer mutation arrived while this render was in flight — render
        // again with the newest chain+draft instead of dropping the work.
        // The stale frame's handle is NOT stored: `lastRender` always points
        // at the frame the canvas is actually showing. ReadHistogram still
        // runs for the stale frame so its per-render bins buffer is consumed
        // (destroyed) rather than leaked; the stale bins are dropped below.
        if (stamp < model.revision) {
          const { model: next, commands = [] } = renderNow({
            ...model,
            phase,
            renderPending: false,
          })
          return { model: next, commands: [...commands, ReadHistogram({ handle, stamp })] }
        }
        return {
          model: {
            ...model,
            lastRender: handle,
            phase,
            renderPending: false,
            renderedStamp: stamp,
          },
          commands: [ReadHistogram({ handle, stamp })],
        }
      },
      RenderFailed: ({ error }) => ({
        model: {
          ...model,
          phase,
          renderPending: false,
          source: { ...model.source, error },
        },
      }),
      // Bins for the frame that's on screen — or a stale readback that
      // landed after a newer mutation, which is dropped (the buffer was
      // already consumed by the ReadHistogram command).
      HistogramComputed: ({ bins, stamp }) => {
        if (stamp < model.revision) {
          return { model }
        }
        return { model: { ...model, bins, phase } }
      },
      // Readback failure is observability only — the frame is already on
      // the canvas; a 1KB map cannot be retried or shown.
      HistogramFailed: () => ({ model }),

      // export dialog (the shared machine owns encode/download/settings)
      ExportRequested: () => {
        // D7: the export frame snapshots `model.lastRender` — a hover
        // preview must never be exported, so the click dismisses it first.
        if (model.previewLut !== null) {
          return renderNow({ ...model, phase, previewLut: null })
        }
        // The dialog opens only when there is a frame to export. The
        // snapshot readback happens once per open; the dialog encodes from
        // the slotted ImageData when the user presses Export.
        if (model.renderedStamp === 0 || !model.lastRender) {
          return { model }
        }
        const { model: dialogModel, commands: dialogCommands = [] } = ExportDialog.open(
          model.exportDialog,
        )
        const draft = model.phase._tag === 'Drafting' ? model.phase.layer : null
        const source = model.attachedEdit?.source
        const snapshotCommand =
          source !== undefined
            ? SnapshotForExport({
                draft,
                handle: model.lastRender,
                layers: model.chain,
                source,
              })
            : SnapshotForExport({ handle: model.lastRender })
        return {
          model: { ...model, exportDialog: dialogModel, phase },
          commands: [...Command.mapMessages(dialogCommands, toExportDialogMessage), snapshotCommand],
        }
      },
      GotExportDialogMessage: ({ message }) => delegateToExportDialog(model, phase, message),
      // Which tool card the custom tooltip shows for — presentation-only.
      HoveredToolChanged: ({ type }) => ({ model: { ...model, hoveredTool: type } }),
      // The readback landed; readiness and late-result guards live in the
      // machine. A failure surfaces as the dialog's status line.
      ExportSnapshotted: () =>
        delegateToExportDialog(model, phase, ExportDialog.Message.FrameReady()),
      ExportSnapshotFailed: ({ error }) =>
        delegateToExportDialog(
          model,
          phase,
          ExportDialog.Message.FrameFailed({ message: error.message }),
        ),
    }),
  )
}

const toExportDialogMessage = (message: ExportDialog.Message): EditorMessage =>
  EditorMessage.GotExportDialogMessage({ message })

/** Step the shared export-dialog machine and lift its results into the editor. */
const delegateToExportDialog = (
  model: Model,
  phase: Model['phase'],
  message: ExportDialog.Message,
): UpdateReturn => {
  const { model: dialogModel, commands = [] } = ExportDialog.update(model.exportDialog, message)
  return {
    model: { ...model, exportDialog: dialogModel, phase },
    commands: Command.mapMessages(commands, toExportDialogMessage),
  }
}
