import * as DragAndDrop from '@/components/ui/drag-and-drop'
import { Match as M } from 'effect'
import { Command, Update } from 'foldkit'
import type { GpuBackend } from '../gpu/backend'
import type { LutStore } from '../luts/store'
import type { ImageEncoder } from '@lutra/engine'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import type { Collage, CollageStore, EditStore } from '@lutra/store'
import { StoreError as StoreErrorClass, defaultTileFraming } from '@lutra/store'
import * as ExportDialog from '../export-dialog'
import { CollageMessage } from './message'
import {
  NavigateMenu,
  MeasureThumbs,
  SaveCollage,
  ScheduleUndoExpiry,
  ScheduleZoomCommit,
  SnapshotCollageExport,
} from './command'
import type { Model } from './model'
import { LAYOUT_BOUNDS, clamp, loadedCollage } from './model'
import { moveTile, removeTile } from './tiles'
import { isDefaultFraming, panned, sameFraming, zoomed } from './framing'

type Resource = GpuBackend | LutStore | ImageEncoder | KeyValueStore | CollageStore | EditStore

export type UpdateReturn = Update.Return<Model, CollageMessage, Resource>

/** The loaded collage behind a model, or null — every handler's precondition. */
const collageOf = (model: Model): Collage | null =>
  model.collage._tag === 'Success' ? model.collage.data : null

/**
 * Mutate the loaded collage's arrangement and queue an auto-save
 * (docs/adr/0009-collage). Arrangement messages with no edge while nothing is loaded
 * are ignored — that IS the blocking, with no scattered guards.
 */
const mutate = (model: Model, f: (collage: Collage) => Collage): UpdateReturn => {
  const collage = collageOf(model)
  if (!collage) {
    return { model }
  }
  const next = f(collage)
  return {
    model: { ...model, collage: loadedCollage.Success({ data: next }) },
    commands: [SaveCollage({ collage: next })],
  }
}

/**
 * A destructive **tile** mutation (docs/adr/0009-collage): like {@link mutate}, plus
 * a one-slot undo of the previous tiles array whose expiry timer is armed
 * with a sequence token.
 */
const mutateWithUndo = (
  model: Model,
  label: string,
  f: (collage: Collage) => Collage,
): UpdateReturn => {
  const collage = collageOf(model)
  if (!collage) {
    return { model }
  }
  const previous = collage.tiles
  const next = f(collage)
  const seq = model.undoSeq + 1
  return {
    model: {
      ...model,
      collage: loadedCollage.Success({ data: next }),
      undo: { seq, tiles: previous },
      undoLabel: label,
      undoSeq: seq,
      // Restored photos mean an emptied-by-user state no longer holds (and a
      // removal that emptied the collage sets it at its own edge below).
      userEmptied: false,
    },
    commands: [SaveCollage({ collage: next }), ScheduleUndoExpiry({ seq })],
  }
}

/**
 * Commit the in-flight framing gesture (docs/adr/0009-collage): the drafted framing
 * lands on its tile with an undo snapshot and an auto-save. A no-op when no
 * gesture is live or the draft equals the persisted framing.
 */
const commitDraft = (model: Model): UpdateReturn => {
  const collage = collageOf(model)
  if (!collage || !model.framingDraft) {
    return { model: { ...model, framingDraft: null, pan: null } }
  }
  const { index, framing } = model.framingDraft
  const tile = collage.tiles[index]
  if (!tile || sameFraming(tile.framing, framing)) {
    return { model: { ...model, framingDraft: null, pan: null } }
  }
  const { model: nextModel, commands = [] } = mutateWithUndo(model, 'Photo reframed', (c) => ({
    ...c,
    tiles: c.tiles.map((t, i) => (i === index ? { ...t, framing } : t)),
  }))
  return { model: { ...nextModel, framingDraft: null, pan: null }, commands }
}

/** The measured aspect of one Edit's photo; unknown sizes read as square. */
const aspectOf = (model: Model, editId: string): number => {
  const size = model.sizes.find((s) => s.editId === editId)
  return !size || size.width <= 0 ? 1 : size.width / size.height
}

/**
 * Map a drag-and-drop `Reordered` fact onto the tiles array. Drop targets are
 * per-cell containers (`tile-<i>`) holding exactly their own tile, so a drop
 * reads as "the gap before/after cell N" — converted into splice semantics by
 * shifting past the dragged item's own slot.
 */
const applyReorder = (
  tiles: Collage['tiles'],
  fromIndex: number,
  toContainerId: string,
  gapSide: number,
): Collage['tiles'] => {
  const cellIndex = Number(toContainerId.replace('tile-', ''))
  if (!Number.isInteger(cellIndex)) {
    return tiles
  }
  let target = cellIndex + gapSide
  if (target > fromIndex) {
    target -= 1
  }
  target = clamp(target, 0, tiles.length - 1)
  return [...moveTile(tiles, fromIndex, target)]
}

/** Step the export-dialog machine and lift its results into the collage. */
const delegate = (
  model: Model,
  message: ExportDialog.Message,
  notice: string | null = model.notice,
): UpdateReturn => {
  const { model: dialogModel, commands = [] } = ExportDialog.update(model.exportDialog, message)
  return {
    model: { ...model, exportDialog: dialogModel, notice },
    commands: Command.mapMessages(commands, toExportDialogMessage),
  }
}

const toExportDialogMessage = (message: ExportDialog.Message): CollageMessage =>
  CollageMessage.GotCollageExportDialogMessage({ message })

const toDragMessage = (message: DragAndDrop.Message): CollageMessage =>
  CollageMessage.GotDragMessage({ message })

/**
 * The Collage Submodel's update loop (docs/adr/0006-frontend-architecture): the same
 * `[Model, Commands, Option<OutMessage>]` 3-tuple shape as the gallery and
 * editor. The collage surfaces no OutMessage facts, so the third slot is
 * always `Option.none()`.
 */
export const update = (model: Model, message: CollageMessage): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tags({
      CollageLoaded: ({ collage, photos, dropped }) => {
        const photoIds = new Set(photos.map((p) => p.id))
        return {
          model: {
            ...model,
            collage: loadedCollage.Success({ data: collage }),
            photos,
            // Sizes for references that survived stay valid; the rest re-measure.
            sizes: model.sizes.filter((s) => photoIds.has(s.editId)),
            notice:
              dropped > 0
                ? `${dropped} ${dropped === 1 ? 'photo' : 'photos'} removed — their edits were deleted`
                : null,
            framingDraft: null,
            pan: null,
            undo: null,
            undoLabel: null,
            userEmptied: false,
          },
          // Aspect measurement rides the load (docs/adr/0009-collage).
          commands: [MeasureThumbs({ photos })],
        }
      },

      ThumbsMeasured: ({ sizes }): UpdateReturn => ({
        model: {
          ...model,
          sizes: [
            ...model.sizes.filter((s) => !sizes.some((n) => n.editId === s.editId)),
            ...sizes,
          ],
        },
      }),

      LoadFailed: ({ error }) => ({
        model: { ...model, collage: loadedCollage.Failure({ error }) },
      }),
      // The id was well-formed but the record is gone: show the same failure
      // state with a plain-language reason (a synthetic StoreError carries
      // the message; there is no backend behind it).
      CollageMissing: () => ({
        model: {
          ...model,
          collage: loadedCollage.Failure({
            error: new StoreErrorClass({
              message: 'this collage does not exist',
            }),
          }),
        },
      }),

      // layout (bounds live in model.ts; layout changes take no undo)
      ChangedColumns: ({ columns }) =>
        mutate(model, (c) => ({
          ...c,
          layout: {
            ...c.layout,
            columns: clamp(Math.round(columns), LAYOUT_BOUNDS.minColumns, LAYOUT_BOUNDS.maxColumns),
          },
        })),
      ChangedRows: ({ rows }) =>
        mutate(model, (c) => ({
          ...c,
          layout: {
            ...c.layout,
            rows: clamp(Math.round(rows), LAYOUT_BOUNDS.minRows, LAYOUT_BOUNDS.maxRows),
          },
        })),
      ChangedGutter: ({ gutter }) =>
        mutate(model, (c) => ({
          ...c,
          layout: {
            ...c.layout,
            gutter: clamp(Math.round(gutter), LAYOUT_BOUNDS.minGutter, LAYOUT_BOUNDS.maxGutter),
          },
        })),
      ChangedFrameRatio: ({ frameRatio }) =>
        mutate(model, (c) => ({
          ...c,
          layout: {
            ...c.layout,
            frameRatio: clamp(frameRatio, LAYOUT_BOUNDS.minFrameRatio, LAYOUT_BOUNDS.maxFrameRatio),
          },
        })),
      ToggledBackground: () =>
        mutate(model, (c) => ({
          ...c,
          layout: {
            ...c.layout,
            background: c.layout.background === 'dark' ? 'light' : 'dark',
          },
        })),

      ModeChanged: ({ mode }) =>
        mode === model.mode
          ? { model }
          : mode === 'frame'
            ? { model: { ...model, mode } }
            : commitDraft({ ...model, mode }),

      RemovedTile: ({ index }) => {
        const collage = collageOf(model)
        if (!collage) {
          return { model }
        }
        const emptied = collage.tiles.length === 1
        const { model: nextModel, commands = [] } = mutateWithUndo(model, 'Removed photo', (c) => ({
          ...c,
          tiles: removeTile(c.tiles, index),
        }))
        return { model: emptied ? { ...nextModel, userEmptied: true } : nextModel, commands }
      },

      // drag-and-drop reorder (docs/adr/0009-collage)
      GotDragMessage: ({ message }) => {
        const {
          model: drag,
          commands: dragCommands = [],
          outMessage: out,
        } = DragAndDrop.update(model.drag, message)
        const base: UpdateReturn = {
          model: { ...model, drag },
          commands: Command.mapMessages(dragCommands, toDragMessage),
        }
        return out !== undefined
          ? M.value(out).pipe(
              M.withReturnType<UpdateReturn>(),
              M.tag('Reordered', ({ itemId, fromIndex, toContainerId, toIndex }) => {
                const collage = collageOf(base.model)
                const sourceIndex =
                  collage?.tiles.findIndex((t) => t.editId === itemId) ?? fromIndex
                if (!collage || sourceIndex < 0) {
                  return base
                }
                return mutateWithUndo(base.model, 'Photos reordered', (c) => ({
                  ...c,
                  tiles: applyReorder(c.tiles, sourceIndex, toContainerId, toIndex),
                }))
              }),
              M.tag('Cancelled', () => base),
              M.exhaustive,
            )
          : base
      },

      // tile framing (docs/adr/0009-collage)
      PanStarted: ({ index, screenX, screenY }) => {
        const collage = collageOf(model)
        if (!collage || model.mode !== 'frame') {
          return { model }
        }
        const tile = collage.tiles[index]
        if (!tile) {
          return { model }
        }
        return {
          model: {
            ...model,
            framingDraft:
              model.framingDraft?.index === index
                ? model.framingDraft
                : { index, framing: tile.framing },
            pan: { index, screenX, screenY },
          },
        }
      },
      PanMoved: ({ screenX, screenY }) => {
        if (!model.pan || !model.framingDraft || !model.cellPx) {
          return { model }
        }
        // rAF coalescing may deliver duplicate positions; skip no-op.
        if (screenX === model.pan.screenX && screenY === model.pan.screenY) {
          return { model }
        }
        const collage = collageOf(model)
        const tile = collage?.tiles[model.pan.index]
        if (!collage || !tile) {
          return { model }
        }
        const imageAspect = aspectOf(model, tile.editId)
        const cellAspect = model.cellPx.width / Math.max(1, model.cellPx.height)
        const dx = (screenX - model.pan.screenX) / model.cellPx.width
        const dy = (screenY - model.pan.screenY) / model.cellPx.height
        // Sub-pixel jitter that won't change clamped framing — still update pan
        // so the next delta is measured from the latest pointer, but don't
        // trigger a view diff.
        if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) {
          return {
            model: { ...model, pan: { index: model.pan.index, screenX, screenY } },
          }
        }
        const framing = panned(model.framingDraft.framing, imageAspect, cellAspect, dx, dy)
        const nextPan = { index: model.pan.index, screenX, screenY }
        if (sameFraming(framing, model.framingDraft.framing)) {
          return { model: { ...model, pan: nextPan } }
        }
        return {
          model: {
            ...model,
            framingDraft: { index: model.pan.index, framing },
            pan: nextPan,
          },
        }
      },
      PanEnded: () => commitDraft(model),
      WheelZoomed: ({ index, deltaY }) => {
        const collage = collageOf(model)
        if (!collage || model.mode !== 'frame') {
          return { model }
        }
        const tile = collage.tiles[index]
        if (!tile) {
          return { model }
        }
        const imageAspect = aspectOf(model, tile.editId)
        const cellAspect = model.cellPx ? model.cellPx.width / Math.max(1, model.cellPx.height) : 1
        const start =
          model.framingDraft?.index === index ? model.framingDraft.framing : tile.framing
        const framing = zoomed(start, Math.exp(-deltaY * 0.002), imageAspect, cellAspect)
        const seq = model.zoomSeq + 1
        return {
          model: { ...model, framingDraft: { index, framing }, zoomSeq: seq },
          commands: [ScheduleZoomCommit({ seq })],
        }
      },
      ZoomSettled: (settled) => (settled.seq === model.zoomSeq ? commitDraft(model) : { model }),
      ResetFraming: ({ index }) => {
        const collage = collageOf(model)
        if (!collage || model.mode !== 'frame') {
          return { model }
        }
        const tile = collage.tiles[index]
        if (!tile || isDefaultFraming(tile.framing)) {
          return { model }
        }
        return mutateWithUndo(model, 'Framing reset', (c) => ({
          ...c,
          tiles: c.tiles.map((t, i) => (i === index ? { ...t, framing: defaultTileFraming() } : t)),
        }))
      },
      CellMeasured: ({ width, height }) => {
        const same =
          model.cellPx &&
          Math.abs(model.cellPx.width - width) < 0.5 &&
          Math.abs(model.cellPx.height - height) < 0.5
        return { model: same ? model : { ...model, cellPx: { width, height } } }
      },

      // undo (docs/adr/0009-collage)
      UndoPressed: () => {
        const collage = collageOf(model)
        if (!collage || !model.undo) {
          return { model }
        }
        const restored: Collage = { ...collage, tiles: model.undo.tiles }
        return {
          model: {
            ...model,
            collage: loadedCollage.Success({ data: restored }),
            undo: null,
            undoLabel: null,
            userEmptied: false,
          },
          commands: [SaveCollage({ collage: restored })],
        }
      },
      UndoExpired: ({ seq }) =>
        model.undo?.seq === seq ? { model: { ...model, undo: null, undoLabel: null } } : { model },

      CollageSaved: () => ({ model }),
      SaveFailed: ({ error }) => ({
        model: { ...model, notice: `Could not save the collage: ${error.message}` },
      }),

      // export (docs/adr/0009-collage: compose on open, encode on press)
      ExportRequested: () => {
        const collage = collageOf(model)
        if (!collage) {
          return { model }
        }
        const { model: dialogModel, commands: dialogCommands = [] } = ExportDialog.open(
          model.exportDialog,
        )
        return {
          model: { ...model, exportDialog: dialogModel },
          commands: [
            ...Command.mapMessages(dialogCommands, toExportDialogMessage),
            SnapshotCollageExport({
              tiles: collage.tiles,
              layout: collage.layout,
            }),
          ],
        }
      },
      // A failed-tile count surfaces as a notice before the machine takes
      // over; the readiness flag and late-result guards live in the machine.
      CollageExportSnapshotted: ({ failedTiles }) =>
        delegate(
          model,
          ExportDialog.Message.FrameReady(),
          failedTiles > 0
            ? `${failedTiles} ${failedTiles === 1 ? 'photo could not be rendered' : 'photos could not be rendered'} and show as blank`
            : model.notice,
        ),
      CollageExportSnapshotFailed: ({ message }) =>
        delegate(model, ExportDialog.Message.FrameFailed({ message }), model.notice),

      BackRequested: () => ({ model, commands: [NavigateMenu()] }),
      // Observability only — the URL change drives the route transition.
      NavigatedBack: () => ({ model }),
      GotCollageExportDialogMessage: ({ message }) => delegate(model, message),
    }),
    M.exhaustive,
  )
