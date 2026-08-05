import { Match, Option } from 'effect'
import { Command } from 'foldkit'
import { Dialog } from '@foldkit/ui'
import { GpuBackend } from '../gpu/backend'
import { CanvasRef } from '../gpu/canvas-ref'
import { LutStore } from '../luts/store'
import {
  SnapshotForExport,
  PrepareExport,
  ExportDownload,
  RevokeExportUrl,
  SaveExportSettings,
  PickImageFile,
  RenderChain,
  ReadHistogram,
  SaveEdit,
} from './command'
import { editorMachine } from './phase'
import { LAYER_UI } from '../editor/layer-meta'
import { fileExtension, type ExportSettings, type ImageEncoder, type LayerId } from '@lutra/engine'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import { EditStore } from '@lutra/store'
import type { Model } from './model'
import { GotExportDialogMessage, EditCreated } from './message'
import type { EditorMessage, EditorOutMessage } from './message'

export type UpdateReturn = readonly [
  Model,
  ReadonlyArray<
    Command.Command<
      EditorMessage,
      never,
      GpuBackend | LutStore | CanvasRef | ImageEncoder | KeyValueStore | EditStore
    >
  >,
  Option.Option<EditorOutMessage>,
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
const renderNow = (model: Model): UpdateReturn => {
  if (!model.source.bitmap) return [model, [], Option.none()]
  // The draft lives in the phase machine (Drafting); the render pipeline
  // still receives it as a plain layer appended after the chain.
  const draft = model.phase._tag === 'Drafting' ? model.phase.layer : null
  const next: Model = { ...model, revision: model.revision + 1 }
  const stamp = next.revision
  if (model.renderPending) {
    return [next, [], Option.none()]
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
    Option.none(),
  ]
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
  if (!model.source.bitmap || !model.lastRender || !attached) return [model, [], Option.none()]
  if (model.saveStatus._tag === 'saving') return [model, [], Option.none()]
  const id = fork ? null : attached.id
  return [
    { ...model, saveStatus: { _tag: 'saving' } },
    [
      SaveEdit({
        id,
        chain: model.chain,
        source: attached.source,
        handle: model.lastRender,
      }),
    ],
    Option.none(),
  ]
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
export const update = (model: Model, message: EditorMessage): UpdateReturn => {  // Data-level gate the machine can't see: the LUT tool needs the catalog
  // (a LUT draft must reference a real lutId, and the first catalog entry is
  // the default selection). Everything else the editor blocks — no image,
  // loading, error, draft active — is a missing edge in the machine.
  if (
    message._tag === 'SelectedTool' &&
    message.type === 'lut' &&
    (model.catalog === null || model.catalog.length === 0)
  ) {
    return [model, [], Option.none()]
  }

  // Step the phase machine. `from` is the pre-step state: the branches that
  // commit or discard a draft read the draft layer from it.
  const from = model.phase
  const result = editorMachine.step(model.phase, message)
  const phase = result.state
  const transitioned = result._tag === 'Transitioned'
  const machineCommands = transitioned ? result.commands : []

  return Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      // ---- canvas registration ----
      // The mount already wrote the element into the CanvasRef service; the
      // acknowledgment exists for observability (DevTools, Scene, replay).
      CanvasRegistered: () => [model, [], Option.none()],

      // ---- image ----
      FilePickRequested: () => [model, [PickImageFile()], Option.none()],
      FilePickCancelled: () => [model, [], Option.none()],

      // ---- LUT library ----
      CatalogLoaded: ({ catalog }) => [{ ...model, phase, catalog }, [], Option.none()],
      CatalogFailed: () => [model, [], Option.none()],

      // The machine's edge already dispatched DecodeImage (its args come from
      // the message); the branch only carries the new phase forward. A file
      // selection anywhere but Empty/Error/Loading is ignored.
      SelectedImageFile: () => {
        if (!transitioned) return [model, [], Option.none()]
        return [
          { ...model, phase, source: { ...model.source, error: null } },
          machineCommands,
          Option.none(),
        ]
      },
      // A decode can only land while Loading (or re-land in Idle/Error for
      // the double-pick race). A completion that lands in Empty — after a
      // ClearedImage — has no edge and is dropped: a stale decode cannot
      // resurrect a cleared image. The picked file's bytes become the
      // unattached source record (id null) that Save creates an Edit from.
      ImageDecoded: ({ bitmap, width, height, source }) => {
        if (!transitioned) return [model, [], Option.none()]
        return renderNow({
          ...model,
          phase,
          source: { bitmap, width, height, error: null },
          attachedEdit: { id: null, source },
          saveStatus: { _tag: 'idle' },
        })
      },
      ImageFailedToDecode: ({ error }) => {
        if (!transitioned) return [model, [], Option.none()]
        return [{ ...model, phase, source: { ...model.source, error } }, [], Option.none()]
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
          bins: null,
          attachedEdit: null,
          saveStatus: { _tag: 'idle' },
        },
        [],
        Option.none(),
      ],

      // ---- attached edit (gallery → /edit/:id) ----
      // The machine moved to Idle (or ignored the message); the branch seeds
      // the loaded chain + source bitmap and renders it — the same shape a
      // fresh `ImageDecoded` produces, so the editor cannot tell whether it
      // was seeded from a pick or a load. The stored id + source bytes
      // become the attached record that Save writes back through.
      EditLoaded: ({ id, chain, bitmap, width, height, source }) => {
        if (!transitioned) return [model, [], Option.none()]
        return renderNow({
          ...model,
          phase,
          chain,
          source: { bitmap, width, height, error: null },
          activeFieldIndex: {},
          lutPickerOpen: false,
          attachedEdit: { id, source },
          saveStatus: { _tag: 'idle' },
        })
      },
      EditLoadFailed: ({ error }) => {
        if (!transitioned) return [model, [], Option.none()]
        return [
          {
            ...model,
            phase,
            source: { ...model.source, error },
            chain: [],
            activeFieldIndex: {},
          },
          [],
          Option.none(),
        ]
      },

      // ---- save ----
      SaveRequested: () => startSave(model, false),
      SaveAsRequested: () => startSave(model, true),
      EditSaved: ({ id, savedAt }) => {
        // Attach the model to the persisted Edit: a fresh-pick Save created
        // the attachment, Save as re-points it. When the id is NEW (no
        // attachment, or a different id), surface EditCreated so the root
        // pushes the /edit/:id URL — a reload then re-attaches to the saved
        // Edit. An in-place save keeps the URL it already addresses.
        const attached = model.attachedEdit
        if (!attached) return [model, [], Option.none()]
        const out = attached.id === id ? Option.none() : Option.some(EditCreated({ id }))
        return [
          {
            ...model,
            phase,
            attachedEdit: { ...attached, id },
            saveStatus: { _tag: 'saved', at: savedAt },
          },
          [],
          out,
        ]
      },
      SaveFailed: ({ error }) => [
        { ...model, phase, saveStatus: { _tag: 'failed', error } },
        [],
        Option.none(),
      ],

      // ---- canvas ----
      ScaledCanvas: ({ scale, offsetX, offsetY }) => [
        { ...model, phase, scale, offsetX, offsetY },
        [],
        Option.none(),
      ],

      // ---- tool panel / draft ----
      SelectedTool: ({ type }) => {
        // The machine built the draft (Drafting); the branch fills in what
        // needs model data: the LUT default selection and the field index.
        if (!transitioned || phase._tag !== 'Drafting') return [model, [], Option.none()]
        const layer = phase.layer
        let next: Model = { ...model, phase }
        if (type === 'lut') {
          const catalog = model.catalog
          // Unreachable — the pre-guard above blocks LUT picks without a
          // catalog before the machine steps. Kept for the type-checker.
          if (!catalog || catalog.length === 0) return [model, [], Option.none()]
          // The machine built this draft from a lut pick, so the layer is the
          // LUT variant; the check narrows it for the spread below.
          if (layer.type !== 'lut') return [model, [], Option.none()]
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
        if (!transitioned || from._tag !== 'Drafting') return [model, [], Option.none()]
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
        if (!transitioned || from._tag !== 'Drafting') return [model, [], Option.none()]
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
        if (!transitioned || phase._tag !== 'Drafting') return [model, [], Option.none()]
        return renderNow({ ...model, phase })
      },
      ChangedDraftLut: () => {
        if (!transitioned || phase._tag !== 'Drafting') return [model, [], Option.none()]
        return renderNow({ ...model, phase })
      },
      ToggledLutPicker: () => {
        const lutDraft = phase._tag === 'Drafting' && phase.layer.type === 'lut'
        const lutSelected =
          phase._tag === 'Selected' &&
          model.chain.some((l) => l.id === phase.layerId && l.type === 'lut')
        if (!lutDraft && !lutSelected) return [model, [], Option.none()]
        return [{ ...model, phase, lutPickerOpen: !model.lutPickerOpen }, [], Option.none()]
      },

      // ---- committed chain ----
      SelectedLayer: () => {
        // The machine moved to Selected; the branch closes the picker. A
        // selection without an image (or while a draft is active) has no
        // edge and is ignored.
        if (!transitioned) return [model, [], Option.none()]
        return [{ ...model, phase, lutPickerOpen: false }, [], Option.none()]
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
        if (fromIndex === to) return [model, [], Option.none()]
        const arr = [...model.chain]
        const [moved] = arr.splice(fromIndex, 1)
        if (!moved) return [model, [], Option.none()]
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
        if (!layer) return [model, [], Option.none()]
        const ui = LAYER_UI[layer.type]
        if (!ui.toggled) return [model, [], Option.none()]
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
          Option.none(),
        ]
      },

      // ---- reorder drag (drag operations reshuffle via ReorderedLayer) ----
      StartedLayerReorder: () => [model, [], Option.none()],
      MovedLayerReorder: () => [model, [], Option.none()],

      // ---- rendering ----
      RenderedFrame: ({ stamp, handle }) => {
        // A newer mutation arrived while this render was in flight — render
        // again with the newest chain+draft instead of dropping the work.
        // The stale frame's handle is NOT stored: `lastRender` always points
        // at the frame the canvas is actually showing. ReadHistogram still
        // runs for the stale frame so its per-render bins buffer is consumed
        // (destroyed) rather than leaked; the stale bins are dropped below.
        if (stamp < model.revision) {
          const [next, commands] = renderNow({ ...model, phase, renderPending: false })
          return [next, [...commands, ReadHistogram({ handle, stamp })], Option.none()]
        }
        return [
          { ...model, phase, renderPending: false, renderedStamp: stamp, lastRender: handle },
          [ReadHistogram({ handle, stamp })],
          Option.none(),
        ]
      },
      RenderFailed: ({ error }) => [
        {
          ...model,
          phase,
          renderPending: false,
          source: { ...model.source, error },
        },
        [],
        Option.none(),
      ],
      // ---- histogram overlay ----
      // Bins for the frame that's on screen — or a stale readback that
      // landed after a newer mutation, which is dropped (the buffer was
      // already consumed by the ReadHistogram command).
      HistogramComputed: ({ bins, stamp }) => {
        if (stamp < model.revision) return [model, [], Option.none()]
        return [{ ...model, phase, bins }, [], Option.none()]
      },
      // Readback failure is observability only — the frame is already on
      // the canvas; a 1KB map cannot be retried or shown.
      HistogramFailed: () => [model, [], Option.none()],

      // ---- export dialog ----
      ExportRequested: () => {
        // The dialog opens only when there is a frame to export. The
        // snapshot readback happens once per open; the dialog encodes from
        // the cached ImageData when the user presses Export.
        if (model.renderedStamp === 0 || !model.lastRender) return [model, [], Option.none()]
        const [dialog, dialogCommands] = Dialog.open(model.exportDialog)
        return [
          { ...model, phase, exportDialog: dialog, exportDownloaded: false },
          [
            ...Command.mapMessages(dialogCommands, toExportDialogMessage),
            SnapshotForExport({ handle: model.lastRender }),
          ],
          Option.none(),
        ]
      },
      GotExportDialogMessage: ({ message }) => {
        const [dialog, dialogCommands, out] = Dialog.update(model.exportDialog, message)
        let next: Model = { ...model, phase, exportDialog: dialog }
        let commands = Command.mapMessages(dialogCommands, toExportDialogMessage)
        // On close: drop the cached frame and revoke the blob URL. The
        // settings stay — they persist across sessions.
        if (Option.isSome(out) && out.value._tag === 'Closed') {
          next = {
            ...next,
            exportImage: null,
            exportEncoding: false,
            exportSize: null,
            exportUrl: null,
            exportError: null,
            exportDownloaded: false,
          }
          if (model.exportUrl) commands = [...commands, RevokeExportUrl({ url: model.exportUrl })]
        }
        return [next, commands, Option.none()]
      },
      // The frame landed and is cached for the dialog's lifetime. If the
      // dialog closed before the readback completed, drop the frame —
      // nothing to encode from.
      ExportSnapshotted: ({ image }) => {
        if (!model.exportDialog.isOpen) return [model, [], Option.none()]
        return [{ ...model, phase, exportImage: image, exportError: null }, [], Option.none()]
      },
      ExportSnapshotFailed: ({ error }) => [
        { ...model, phase, exportError: error },
        [],
        Option.none(),
      ],
      ChangedExportFormat: ({ format }) => {
        // Switching to a lossy format fills the quality default; PNG is
        // lossless and carries no quality. Settings changes only persist —
        // the encode waits for the Export press.
        const settings: ExportSettings = {
          ...model.exportSettings,
          format,
          quality: format === 'png' ? null : (model.exportSettings.quality ?? 75),
        }
        return settingsChanged(model, settings)
      },
      ChangedExportQuality: ({ quality }) =>
        settingsChanged(model, { ...model.exportSettings, quality }),
      ChangedExportScale: ({ scale }) =>
        settingsChanged(model, { ...model.exportSettings, scale }),
      ExportPrepared: ({ sizeBytes, url }) => {
        // An encode that completed after the dialog closed has no consumer.
        if (!model.exportDialog.isOpen) return [model, [RevokeExportUrl({ url })], Option.none()]
        const filename = `lutra-edit.${fileExtension(model.exportSettings.format)}`
        return [
          {
            ...model,
            phase,
            exportEncoding: false,
            exportSize: sizeBytes,
            exportUrl: url,
            exportError: null,
          },
          [ExportDownload({ url, filename })],
          Option.none(),
        ]
      },
      ExportEncodeFailed: ({ error }) => [
        { ...model, phase, exportEncoding: false, exportError: error },
        [],
        Option.none(),
      ],
      ExportDownloadRequested: () => {
        // The encode runs here, on Export press — not on settings change.
        if (!model.exportImage || model.exportEncoding) return [model, [], Option.none()]
        return startEncode(model)
      },
      ExportDownloaded: ({ url }) => {
        // Ignore downloads of a replaced blob (an encode finished after a
        // newer Export press).
        if (model.exportUrl !== url) return [model, [], Option.none()]
        return [{ ...model, phase, exportDownloaded: true }, [], Option.none()]
      },
      ExportSettingsLoaded: ({ settings }) => [
        { ...model, phase, exportSettings: settings },
        [],
        Option.none(),
      ],
      ExportUrlRevoked: () => [model, [], Option.none()],
      ExportSettingsSaved: () => [model, [], Option.none()],
    }),
  )
}

const toExportDialogMessage = (message: Dialog.Message): EditorMessage =>
  GotExportDialogMessage({ message })

/** Persist a settings change; the encode waits for the Export press. */
const settingsChanged = (model: Model, settings: ExportSettings): UpdateReturn => [
  { ...model, exportSettings: settings, exportDownloaded: false },
  [SaveExportSettings({ settings })],
  Option.none(),
]

/**
 * Dispatch the encode for the cached export frame. Requires the snapshot —
 * the dialog only encodes after it lands. The Export button is disabled
 * while `exportEncoding`, so at most one encode is in flight; a result that
 * lands after the dialog closed is revoked in ExportPrepared.
 */
const startEncode = (model: Model): UpdateReturn => {
  if (!model.exportImage) return [model, [], Option.none()]
  return [
    {
      ...model,
      exportEncoding: true,
      exportSize: null,
      exportUrl: null,
      exportError: null,
      exportDownloaded: false,
    },
    [
      PrepareExport({
        image: model.exportImage,
        settings: model.exportSettings,
        previousUrl: model.exportUrl,
      }),
    ],
    Option.none(),
  ]
}
