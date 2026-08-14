import { Array, Match, Option, pipe } from 'effect'
import { Command } from 'foldkit'
import { Dialog } from '@foldkit/ui'
import { GpuBackend } from '../gpu/backend'
import { CanvasRef } from '../gpu/canvas-ref'
import { LutStore } from '../luts/store'
import { LutThumbnailer } from '../thumbs/worker-layer'
import {
  SnapshotForExport,
  PrepareExport,
  ExportDownload,
  RevokeExportUrl,
  SaveExportSettings,
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
import {
  fileExtension,
  type ExportSettings,
  type ImageEncoder,
  type LayerId,
  type LutId,
} from '@lutra/engine'
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
      GpuBackend | LutStore | CanvasRef | ImageEncoder | KeyValueStore | EditStore | LutThumbnailer
    >
  >,
  Option.Option<EditorOutMessage>,
]

const ensureFieldIndex = (index: Record<LayerId, number>, layerId: LayerId) =>
  index[layerId] === undefined ? { ...index, [layerId]: 0 } : index

/** The compare presentation state (docs/adr/0011) the blit needs: the mode,
 *  the split position in image space, and the toggle side. Carried by every
 *  RenderChain (the render's final blit) and by PresentFrame (blit-only). */
const presentState = (model: Model) => ({
  mode: model.compareMode,
  splitAt: model.compareSplitAt,
  showBefore: model.compareToggleBefore,
})

/** Fire a RenderChain command for the current chain + draft. Bumps `revision`
 *  so stale render results can be dropped. When a render is already in
 *  flight, only the revision bump happens — the in-flight render re-triggers
 *  with the newest state when it completes (see the RenderedFrame handler),
 *  which keeps the GPU queue from backing up during slider drags.
 *
 *  A bar hover preview (docs/adr/0012) swaps the active LUT target's lutId
 *  at render time — the draft or the focused chain LUT layer — without
 *  touching the chain or the machine (the draft's lutId stays machine-owned).
 *  Belt-and-suspenders: when no LUT target exists the preview is simply not
 *  applied, so a leaked value can never corrupt a non-LUT render. */
const renderNow = (model: Model): UpdateReturn => {
  if (!model.source.bitmap) return [model, [], Option.none()]
  // The draft lives in the phase machine (Drafting); the render pipeline
  // still receives it as a plain layer appended after the chain.
  const draft = model.phase._tag === 'Drafting' ? model.phase.layer : null
  let layers = model.chain
  let draftLayer = draft
  const previewLut = model.previewLut
  const phase = model.phase
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
    return [next, [], Option.none()]
  }
  return [
    { ...next, renderPending: true },
    [
      RenderChain({
        layers,
        draft: draftLayer,
        bitmap: model.source.bitmap,
        stamp,
        present: presentState(model),
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

/** Most-recently-applied lutIds, newest first, deduped, capped at 12. The
 *  bar is the only caller (its click commits); the `catalog[0]` auto-default
 *  in SelectedTool never bumps (docs/adr/0012 D6). */
const RECENTS_CAP = 12
const bumpRecents = (model: Model, lutId: LutId): Model => ({
  ...model,
  lutRecents: [lutId, ...model.lutRecents.filter((id) => id !== lutId)].slice(0, RECENTS_CAP),
})

/**
 * The per-photo LUT thumbnails (docs/adr/0013) generate lazily, per visible
 * group: one `GenerateLutThumb` per filmstrip entry that has no preview
 * yet. Fired on tab select and on bar-open (the LUT-draft auto-open and the
 * chevron), so the visible strip fills in without ever prefetching groups
 * the user does not browse. A lutId whose generation failed stays missing
 * and is retried on the next visit of its group.
 */
const generateThumbCommands = (
  model: Model,
): ReadonlyArray<Command.Command<EditorMessage, never, LutStore | LutThumbnailer>> => {
  // The strip is only visible (and only browsable) while the bar is open.
  const bitmap = model.source.bitmap
  if (!model.lutBarOpen || !bitmap || !model.catalog) return []
  return pipe(
    visibleEntries(model.catalog, model.lutTab, model.lutRecents),
    Array.filter((entry) => model.lutThumbs[entry.lut_file] === undefined),
    Array.map((entry) => GenerateLutThumb({ lutId: entry.lut_file, bitmap })),
  )
}

/**
 * The persistence-during-preview rule (docs/adr/0012 D7): save and export
 * snapshot from `model.lastRender` (thumbnail / export frame), which would
 * otherwise capture the hovered look. While a bar preview is active, the
 * click dismisses the preview instead of acting — the next click proceeds.
 * One swallowed click in a rare case beats silently exporting a look the
 * chain doesn't contain.
 */
const dismissPreviewOr = (model: Model, proceed: () => UpdateReturn): UpdateReturn => {
  if (model.previewLut !== null) return renderNow({ ...model, previewLut: null })
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
  // Data-level gate the machine can't see: the LUT tool needs the catalog
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

      // ---- offline library (the LUT bar's per-row states, docs/adr/0015) ----
      // Root-delegated facts; the editor machine has no edges for them, so
      // the phase passes through untouched. A cube file's fetch began: the
      // bar row shows its spinner.
      OfflineFileFetching: ({ lutId }) => [
        {
          ...model,
          phase,
          lutDownloads: { ...model.lutDownloads, [lutId]: 'fetching' },
        },
        [],
        Option.none(),
      ],
      // A cube landed in the offline library: the row is downloadable — and
      // any "not downloaded yet" notice is moot.
      OfflineFileDownloaded: ({ lutId }) => [
        {
          ...model,
          phase,
          lutDownloads: { ...model.lutDownloads, [lutId]: 'downloaded' },
          offlineLutNotice: null,
        },
        [],
        Option.none(),
      ],
      // The browser's online state flipped (dimming flag for the bar).
      OfflineConnectivityChanged: ({ online }) => [
        { ...model, phase, online },
        [],
        Option.none(),
      ],
      // An undownloaded row was clicked while offline: the bar's name line
      // shows the distinct connect-once notice (the commit is blocked — the
      // click never reaches the chain).
      OfflineLutUnavailable: ({ lutId }) => {
        const name = model.catalog?.find((entry) => entry.lut_file === lutId)?.name ?? lutId
        return [
          {
            ...model,
            phase,
            offlineLutNotice: `${name} isn't downloaded yet — connect once and the offline library finishes preparing.`,
          },
          [],
          Option.none(),
        ]
      },

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
        // A new photo invalidates the previous one's per-photo LUT previews
        // (docs/adr/0013): clear the map and revoke the old blob URLs.
        const urls = Object.values(model.lutThumbs)
        const [next, commands] = renderNow({
          ...model,
          phase,
          source: { bitmap, width, height, error: null },
          attachedEdit: { id: null, source },
          saveStatus: { _tag: 'idle' },
          lutThumbs: {},
        })
        return [
          next,
          urls.length > 0 ? [...commands, RevokeLutThumbs({ urls })] : commands,
          Option.none(),
        ]
      },
      ImageFailedToDecode: ({ error }) => {
        if (!transitioned) return [model, [], Option.none()]
        return [{ ...model, phase, source: { ...model.source, error } }, [], Option.none()]
      },
      // The machine moves the phase (draft/selection discarded); the branch
      // resets the model data that only makes sense with an image. In Empty
      // the machine ignores the clear and the resets are no-ops.
      ClearedImage: () => {
        // The image is gone: its per-photo LUT previews are dead too —
        // clear the map and revoke the blob URLs (docs/adr/0013).
        const urls = Object.values(model.lutThumbs)
        return [
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
            // A new image starts the split position over at 50% (the compare
            // mode itself persists across images).
            compareSplitAt: 0.5,
            // A cleared image has no LUT target — a stale hover preview must
            // not leak into a future render.
            previewLut: null,
            attachedEdit: null,
            saveStatus: { _tag: 'idle' },
            lutThumbs: {},
          },
          urls.length > 0 ? [RevokeLutThumbs({ urls })] : [],
          Option.none(),
        ]
      },

      // ---- attached edit (gallery → /edit/:id) ----
      // The machine moved to Idle (or ignored the message); the branch seeds
      // the loaded chain + source bitmap and renders it — the same shape a
      // fresh `ImageDecoded` produces, so the editor cannot tell whether it
      // was seeded from a pick or a load. The stored id + source bytes
      // become the attached record that Save writes back through.
      EditLoaded: ({ id, chain, bitmap, width, height, source }) => {
        if (!transitioned) return [model, [], Option.none()]
        // A new photo invalidates the previous one's per-photo LUT previews
        // (docs/adr/0013): clear the map and revoke the old blob URLs.
        const urls = Object.values(model.lutThumbs)
        const [next, commands] = renderNow({
          ...model,
          phase,
          chain,
          source: { bitmap, width, height, error: null },
          activeFieldIndex: {},
          // A new attached edit closes the bar and its hover preview.
          lutBarOpen: false,
          previewLut: null,
          // A new image starts the split position over at 50% (the compare
          // mode itself persists across images).
          compareSplitAt: 0.5,
          attachedEdit: { id, source },
          saveStatus: { _tag: 'idle' },
          lutThumbs: {},
        })
        return [
          next,
          urls.length > 0 ? [...commands, RevokeLutThumbs({ urls })] : commands,
          Option.none(),
        ]
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
      // Save/export while a bar preview is active dismisses the preview
      // instead of acting (docs/adr/0012 D7) — the thumbnail and the export
      // frame snapshot `model.lastRender`, which would otherwise capture the
      // hovered look. The next click proceeds.
      SaveRequested: () => dismissPreviewOr({ ...model, phase }, () => startSave(model, false)),
      SaveAsRequested: () => dismissPreviewOr({ ...model, phase }, () => startSave(model, true)),
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
        // A new draft context also drops any bar hover preview — the old
        // target is gone (D9).
        if (!transitioned || phase._tag !== 'Drafting') return [model, [], Option.none()]
        const layer = phase.layer
        let next: Model = { ...model, phase, previewLut: null }
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
            lutBarOpen: true,
          }
        }
        // The bar just auto-opened: the visible group's per-photo thumbs
        // start generating (docs/adr/0013) — one command per missing LUT.
        const rendered = {
          ...next,
          activeFieldIndex: ensureFieldIndex(model.activeFieldIndex, layer.id),
        }
        const [after, commands] = renderNow(rendered)
        return [after, [...commands, ...generateThumbCommands(rendered)], Option.none()]
      },
      ConfirmedDraft: () => {
        if (!transitioned || from._tag !== 'Drafting') return [model, [], Option.none()]
        // The machine moved the phase to Selected (focused on the draft); the
        // branch commits the draft layer into the chain.
        return renderNow({
          ...model,
          phase,
          chain: [...model.chain, from.layer],
          lutBarOpen: false,
          previewLut: null,
        })
      },
      CancelledDraft: () => {
        if (!transitioned || from._tag !== 'Drafting') return [model, [], Option.none()]
        const { [from.layer.id]: _removed, ...restIndex } = model.activeFieldIndex
        return renderNow({
          ...model,
          phase,
          activeFieldIndex: restIndex,
          lutBarOpen: false,
          previewLut: null,
        })
      },
      UpdatedDraftParam: () => {
        // The machine already applied the param to the draft layer in the
        // new phase; the branch only re-renders.
        if (!transitioned || phase._tag !== 'Drafting') return [model, [], Option.none()]
        return renderNow({ ...model, phase })
      },
      // The bar's click commits the real value: clear any hover preview (a
      // stale one would otherwise double-apply) and bump recents — real
      // picks only, the `catalog[0]` auto-default never bumps (D6).
      ChangedDraftLut: ({ lutId }) => {
        if (!transitioned || phase._tag !== 'Drafting') return [model, [], Option.none()]
        const next = bumpRecents({ ...model, phase, previewLut: null }, lutId)
        const [rendered, commands] = renderNow(next)
        return [
          rendered,
          [...commands, SaveLutRecents({ recents: next.lutRecents })],
          Option.none(),
        ]
      },
      ToggledLutPicker: () => {
        if (Option.isNone(lutTarget(model))) return [model, [], Option.none()]
        const open = !model.lutBarOpen
        // Closing also clears the hover preview; opening has nothing to
        // clear (a closed bar cannot be hovered). Opening starts the
        // visible group's per-photo thumbs (docs/adr/0013).
        const next = {
          ...model,
          phase,
          lutBarOpen: open,
          previewLut: open ? model.previewLut : null,
        }
        return [next, open ? generateThumbCommands(next) : [], Option.none()]
      },

      // ---- LUT bar (bottom filmstrip picker, docs/adr/0012) ----
      // Hover enter/leave on a bar thumb. Presentation-only: sets the
      // previewed lutId and re-renders; the committed chain/draft is
      // untouched. null restores the committed look. The same-value guard
      // skips redundant renders while scrubbing across the strip.
      PreviewedLut: ({ lutId }) => {
        if (!model.source.bitmap) return [model, [], Option.none()]
        if (Option.isNone(lutTarget(model))) return [model, [], Option.none()]
        if (model.previewLut === lutId) return [model, [], Option.none()]
        return renderNow({ ...model, phase, previewLut: lutId, offlineLutNotice: null })
      },
      // Tab click: presentation-only (no render), but the newly visible
      // group's per-photo thumbs start generating (docs/adr/0013) — a
      // revisit after a failure retries the missing LUTs.
      SelectedLutTab: ({ tab }) => {
        const next = { ...model, phase, lutTab: tab, offlineLutNotice: null }
        return [next, generateThumbCommands(next), Option.none()]
      },
      // Recents restored from localStorage at boot.
      LutRecentsLoaded: ({ recents }) => [
        { ...model, phase, lutRecents: recents },
        [],
        Option.none(),
      ],
      LutRecentsSaved: () => [model, [], Option.none()],

      // ---- per-photo LUT thumbnails (filmstrip previews, docs/adr/0013) ----
      // A thumb landed. One that belongs to a previous photo (the bitmap
      // changed while the worker was rendering) is revoked and dropped —
      // the map only ever holds the current photo's previews.
      LutThumbGenerated: ({ lutId, url, bitmap }) => {
        if (model.source.bitmap !== bitmap) {
          return [model, [RevokeLutThumbs({ urls: [url] })], Option.none()]
        }
        return [
          { ...model, phase, lutThumbs: { ...model.lutThumbs, [lutId]: url } },
          [],
          Option.none(),
        ]
      },
      // A thumb failed (cube fetch, downscale, worker, encode): the
      // vendored generic jpg stays — previews are presentation-only, so
      // failures are not user-visible.
      LutThumbFailed: () => [model, [], Option.none()],
      LutThumbsRevoked: () => [model, [], Option.none()],

      // ---- committed chain ----
      SelectedLayer: () => {
        // The machine moved to Selected; the branch closes the bar (a
        // selection is a new context — D9, and the bar's target may be
        // gone). A selection without an image (or while a draft is active)
        // has no edge and is ignored.
        if (!transitioned) return [model, [], Option.none()]
        return [{ ...model, phase, lutBarOpen: false, previewLut: null }, [], Option.none()]
      },
      RemovedLayer: ({ id }) => {
        const { [id]: _r, ...restIndex } = model.activeFieldIndex
        // Removing the focused layer also deselects it — the machine's
        // Selected → Idle edge handles that; any other removal leaves the
        // phase alone. The removal always drops a hover preview (the target
        // may be the removed layer).
        return renderNow({
          ...model,
          phase,
          chain: model.chain.filter((l) => l.id !== id),
          activeFieldIndex: restIndex,
          previewLut: null,
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
      ChangedLayerLut: ({ id, lutId }) => {
        // The bar's click commits the real value: clear any hover preview
        // (a stale one would otherwise double-apply) and bump recents (D6).
        const next = bumpRecents(
          {
            ...model,
            phase,
            previewLut: null,
            chain: model.chain.map((l) => (l.id === id ? { ...l, ...{ lutId } } : l)),
          },
          lutId,
        )
        const [rendered, commands] = renderNow(next)
        return [
          rendered,
          [...commands, SaveLutRecents({ recents: next.lutRecents })],
          Option.none(),
        ]
      },
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

      // ---- compare (before/after viewing) ----
      // Presentation-only state (docs/adr/0011): mode and split changes
      // dispatch the blit-only PresentFrame, never a chain render — the
      // graded side keeps showing the last rendered frame.
      ChangedCompareMode: ({ mode }) => {
        if (!model.source.bitmap) return [model, [], Option.none()]
        // The Toggle segment is a flip button while active: selecting Toggle
        // again flips the canvas between the source image and the graded
        // output. Entering Toggle reveals the source first (the act of
        // enabling = "show me before" — CONTEXT.md "Compare").
        const next =
          mode === 'toggle' && model.compareMode === 'toggle'
            ? { ...model, phase, compareToggleBefore: !model.compareToggleBefore }
            : { ...model, phase, compareMode: mode, compareToggleBefore: mode === 'toggle' }
        return [next, [PresentFrame({ present: presentState(next) })], Option.none()]
      },
      ChangedSplitPosition: ({ position }) => {
        if (!model.source.bitmap) return [model, [], Option.none()]
        const next = {
          ...model,
          phase,
          compareSplitAt: Math.min(1, Math.max(0, position)),
        }
        return [next, [PresentFrame({ present: presentState(next) })], Option.none()]
      },
      FramePresented: () => [model, [], Option.none()],

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
        // D7: the export frame snapshots `model.lastRender` — a hover
        // preview must never be exported, so the click dismisses it first.
        if (model.previewLut !== null) return renderNow({ ...model, phase, previewLut: null })
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
      ChangedExportScale: ({ scale }) => settingsChanged(model, { ...model.exportSettings, scale }),
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
