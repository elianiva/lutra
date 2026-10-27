import { Match as M } from 'effect'
import { Command } from 'foldkit'
import type { Update } from 'foldkit'
import * as Dialog from '@/components/ui/dialog'
import {
  COLLAGE_MAX_CELLS,
  PRESETS,
  cellCount,
  defaultAdjust,
  fitGridForCount,
  panAdjust,
  presetIdFor,
  uniformTemplate,
} from './collage/layout'
import type { Template } from './collage/layout'
import {
  DownloadZip,
  OpenPage,
  PersistMode,
  PickCollageFiles,
  PickFiles,
  PrepareItems,
  PrepareSlots,
  ProcessItem,
  ReplaceSlot,
  RevokeUrls,
  SaveCollage,
  ShuffleOrder,
  outputName,
} from './command'
import { formatBytes } from './format'
import { Message } from './message'
import type { Collage, Item, Model, Slot } from './model'
import type { ImageWorkers } from './pipeline/pool'

type UpdateReturn = Update.Return<Model, Message, ImageWorkers>

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/* ---------- single mode ---------- */

const mapItem = (model: Model, id: number, f: (item: Item) => Item): Model => ({
  ...model,
  items: model.items.map((item) => (item.id === id ? f(item) : item)),
})

/** Send items back to Working and queue them on the pool with the current settings. */
const schedule = (model: Model, targets: ReadonlyArray<Item>): UpdateReturn => {
  const ids = new Set(targets.map((item) => item.id))
  return {
    model: {
      ...model,
      items: model.items.map((item) =>
        ids.has(item.id) ? { ...item, status: { _tag: 'Working' } } : item,
      ),
    },
    commands: targets.map((item) =>
      ProcessItem({ id: item.id, file: item.file, settings: model.settings }),
    ),
  }
}

/** A settings change makes every finished output stale until it is reprocessed. */
const markStale = (items: ReadonlyArray<Item>): ReadonlyArray<Item> =>
  items.map((item) =>
    item.status._tag === 'Done' ? { ...item, status: { ...item.status, stale: true } } : item,
  )

/** Items the reprocess action targets: stale outputs first, else failures. */
export const reprocessTargets = (items: ReadonlyArray<Item>): ReadonlyArray<Item> => {
  const stale = items.filter((item) => item.status._tag === 'Done' && item.status.stale)
  return stale.length > 0 ? stale : items.filter((item) => item.status._tag === 'Failed')
}

const itemUrls = (item: Item): ReadonlyArray<string> =>
  item.status._tag === 'Done' ? [item.sourceUrl, item.status.result.url] : [item.sourceUrl]

/* ---------- collage mode ---------- */

export const resolveTemplate = (collage: Collage): Template =>
  PRESETS.find((preset) => preset.id === collage.presetId) ??
  uniformTemplate(collage.rows, collage.cols)

const slotUrls = (slots: ReadonlyArray<Slot | null>): ReadonlyArray<string> =>
  slots.flatMap((slot) => (slot === null ? [] : [slot.url]))

const revoke = (urls: ReadonlyArray<string>) => (urls.length === 0 ? [] : [RevokeUrls({ urls })])

/** Fit the slot list to the template: pad with empty cells or drop (and free) the overflow. */
type Fitted = Readonly<{ collage: Collage; dropped: ReadonlyArray<Slot | null> }>

const withTemplate = (
  collage: Collage,
  next: Pick<Collage, 'presetId' | 'rows' | 'cols'>,
  status = collage.status,
): Fitted => {
  const merged = { ...collage, ...next, status }
  const count = cellCount(resolveTemplate(merged))
  const slots = Array.from({ length: count }, (_, index) => collage.slots[index] ?? null)
  return {
    collage: {
      ...merged,
      slots,
      selected: Math.min(collage.selected, Math.max(0, count - 1)),
    },
    dropped: collage.slots.slice(count),
  }
}

const withCollage = (model: Model, collage: Collage): UpdateReturn => ({
  model: { ...model, collage },
})

const updateSelected = (model: Model, f: (slot: Slot) => Slot): UpdateReturn => {
  const { collage } = model
  const slot = collage.slots[collage.selected]
  if (slot === null || slot === undefined) return { model }
  return withCollage(model, {
    ...collage,
    slots: collage.slots.map((current, index) => (index === collage.selected ? f(slot) : current)),
  })
}

const swap = (collage: Collage, from: number, to: number): Collage => {
  const count = collage.slots.length
  if (from === to || from < 0 || to < 0 || from >= count || to >= count) return collage
  const slots = [...collage.slots]
  const held = slots[from] ?? null
  slots[from] = slots[to] ?? null
  slots[to] = held
  return { ...collage, slots, selected: to }
}

/** Place prepared photos in empty cells, growing a uniform grid when they do not fit. */
const placeSlots = (model: Model, prepared: ReadonlyArray<Slot>, failed: number): UpdateReturn => {
  const start = model.collage
  const filled = start.slots.filter((slot) => slot !== null).length
  let grown: Fitted = { collage: start, dropped: [] }
  let expanded = false
  if (filled + prepared.length > start.slots.length) {
    const fit = fitGridForCount(filled + prepared.length)
    if (
      fit.rows !== start.rows ||
      fit.cols !== start.cols ||
      start.presetId !== presetIdFor(fit.rows, fit.cols)
    ) {
      expanded = cellCount(fit) > start.slots.length
      // Keep the photos already placed: compact them into the new grid's first cells.
      const compacted = { ...start, slots: start.slots.filter((slot) => slot !== null) }
      grown = withTemplate(compacted, {
        presetId: presetIdFor(fit.rows, fit.cols),
        rows: fit.rows,
        cols: fit.cols,
      })
    }
  }
  const slots = [...grown.collage.slots]
  const overflow: Array<Slot> = []
  for (const slot of prepared) {
    const empty = slots.findIndex((current) => current === null)
    if (empty === -1) overflow.push(slot)
    else slots[empty] = slot
  }
  const placed = prepared.length - overflow.length
  const status =
    overflow.length > 0
      ? `${placed} of ${prepared.length} placed. A collage holds ${COLLAGE_MAX_CELLS} photos.`
      : failed > 0
        ? `${plural(placed, 'photo')} added. ${failed} could not be decoded.`
        : expanded
          ? `Grid grew to ${grown.collage.cols}×${grown.collage.rows} for ${filled + placed} photos.`
          : `${plural(placed, 'photo')} added.`
  const firstFilled = slots.findIndex((slot) => slot !== null)
  return {
    model: {
      ...model,
      collage: { ...grown.collage, slots, status, selected: Math.max(0, firstFilled) },
    },
    commands: revoke([...slotUrls(grown.dropped), ...overflow.map((slot) => slot.url)]),
  }
}

/* ---------- update ---------- */

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    M.withReturnType<UpdateReturn>(),
    M.tagsExhaustive({
      SelectedTab: ({ tab }) => ({ model: { ...model, tab, dragOver: false } }),
      ToggledMode: () => {
        const mode = model.mode === 'dark' ? 'light' : 'dark'
        return { model: { ...model, mode }, commands: [PersistMode({ mode })] }
      },
      CompletedPersistMode: () => ({ model }),
      PageRequested: ({ page }) => ({ model, commands: [OpenPage({ page })] }),
      PageOpened: () => ({ model }),
      ToggledSettings: () => ({ model: { ...model, settingsOpen: !model.settingsOpen } }),
      ChangedSettings: ({ settings }) => ({
        model: { ...model, settings, items: markStale(model.items) },
      }),

      AddRequested: () => ({
        model,
        commands: [model.tab === 'collage' ? PickCollageFiles() : PickFiles()],
      }),
      PickCancelled: () => ({ model }),
      DragEntered: () => ({ model: model.dragOver ? model : { ...model, dragOver: true } }),
      DragLeft: () => ({ model: { ...model, dragOver: false } }),
      FilesDropped: ({ files }) => {
        const next = { ...model, dragOver: false }
        if (files.length === 0) return { model: next }
        if (model.tab === 'collage') {
          // Reserve the keys up front so a second drop cannot reuse them.
          return {
            model: {
              ...next,
              collage: { ...model.collage, nextKey: model.collage.nextKey + files.length },
            },
            commands: [PrepareSlots({ files: [...files], firstKey: model.collage.nextKey })],
          }
        }
        return {
          model: { ...next, nextId: model.nextId + files.length },
          commands: [PrepareItems({ files: [...files], firstId: model.nextId })],
        }
      },
      ItemsPrepared: ({ items }) =>
        schedule({ ...model, items: [...model.items, ...items] }, items),
      Processed: ({ id, result }) => {
        const current = model.items.find((item) => item.id === id)
        // The item was cleared while it ran: free the orphaned output.
        if (current === undefined) return { model, commands: revoke([result.url]) }
        const previous = current.status._tag === 'Done' ? [current.status.result.url] : []
        return {
          model: mapItem(model, id, (item) => ({
            ...item,
            status: { _tag: 'Done', result, stale: false },
          })),
          commands: revoke(previous),
        }
      },
      ProcessFailed: ({ id, error }) => ({
        model: mapItem(model, id, (item) => ({ ...item, status: { _tag: 'Failed', error } })),
      }),
      ReprocessRequested: () => schedule(model, reprocessTargets(model.items)),
      RetryRequested: ({ id }) =>
        schedule(
          model,
          model.items.filter((item) => item.id === id),
        ),
      ZipRequested: () => ({
        model: { ...model, zipping: true },
        commands: [
          DownloadZip({
            entries: model.items.flatMap((item) =>
              item.status._tag === 'Done'
                ? [
                    {
                      name: outputName(item.file, item.status.result),
                      blob: item.status.result.blob,
                    },
                  ]
                : [],
            ),
          }),
        ],
      }),
      ZipSaved: () => ({ model: { ...model, zipping: false } }),
      ClearRequested: () => ({
        model: { ...model, items: [] },
        commands: revoke(model.items.flatMap(itemUrls)),
      }),
      CompletedRevoke: () => ({ model }),

      PreviewRequested: ({ id }) => {
        const { model: previewDialog, commands = [] } = Dialog.open(model.previewDialog)
        return {
          model: { ...model, previewId: id, previewDialog },
          commands: Command.mapMessages(commands, (message) =>
            Message.GotPreviewDialogMessage({ message }),
          ),
        }
      },
      GotPreviewDialogMessage: ({ message }) => {
        const { model: previewDialog, commands = [] } = Dialog.update(model.previewDialog, message)
        return {
          model: { ...model, previewDialog },
          commands: Command.mapMessages(commands, (child) =>
            Message.GotPreviewDialogMessage({ message: child }),
          ),
        }
      },

      CollageAddRequested: () => ({ model, commands: [PickCollageFiles()] }),
      CollageFilesChosen: ({ files }) => ({
        model: {
          ...model,
          collage: { ...model.collage, nextKey: model.collage.nextKey + files.length },
        },
        commands: [PrepareSlots({ files: [...files], firstKey: model.collage.nextKey })],
      }),
      SlotsPrepared: ({ slots, failed }) => {
        if (slots.length === 0) {
          return withCollage(model, {
            ...model.collage,
            status: 'No images there. JPEG, PNG, WebP, and AVIF work.',
          })
        }
        const keyed = {
          ...model,
          collage: {
            ...model.collage,
            nextKey: Math.max(model.collage.nextKey, ...slots.map((slot) => slot.key + 1)),
          },
        }
        return placeSlots(keyed, slots, failed)
      },
      ReplaceRequested: ({ index }) => ({
        model: { ...model, collage: { ...model.collage, nextKey: model.collage.nextKey + 1 } },
        commands: [ReplaceSlot({ index, key: model.collage.nextKey })],
      }),
      SlotReplaced: ({ index, slot }) => {
        if (slot === null) {
          return withCollage(model, { ...model.collage, status: 'That photo cannot be decoded.' })
        }
        const previous = model.collage.slots[index] ?? null
        return {
          model: {
            ...model,
            collage: {
              ...model.collage,
              slots: model.collage.slots.map((current, at) => (at === index ? slot : current)),
              selected: index,
              status: 'Photo replaced.',
            },
          },
          commands: revoke(slotUrls([previous])),
        }
      },
      ChangedRatio: ({ ratio }) => withCollage(model, { ...model.collage, ratio }),
      ChangedGap: ({ gapPercent }) => withCollage(model, { ...model.collage, gapPercent }),
      SelectedPreset: ({ id }) => {
        const preset = PRESETS.find((candidate) => candidate.id === id)
        if (preset === undefined) return { model }
        const { collage, dropped } = withTemplate(model.collage, {
          presetId: preset.id,
          rows: preset.rows,
          cols: preset.cols,
        })
        return { model: { ...model, collage }, commands: revoke(slotUrls(dropped)) }
      },
      ChangedGrid: ({ rows, cols }) => {
        const wanted = uniformTemplate(rows, cols)
        const capped =
          wanted.rows * wanted.cols > COLLAGE_MAX_CELLS
            ? fitGridForCount(COLLAGE_MAX_CELLS)
            : wanted
        const { collage, dropped } = withTemplate(
          model.collage,
          { presetId: presetIdFor(capped.rows, capped.cols), rows: capped.rows, cols: capped.cols },
          capped === wanted
            ? model.collage.status
            : `A collage holds ${COLLAGE_MAX_CELLS} photos. Using 3×3.`,
        )
        return { model: { ...model, collage }, commands: revoke(slotUrls(dropped)) }
      },
      SelectedCell: ({ index }) => withCollage(model, { ...model.collage, selected: index }),
      RemovedCell: ({ index }) => ({
        model: {
          ...model,
          collage: {
            ...model.collage,
            slots: model.collage.slots.map((slot, at) => (at === index ? null : slot)),
          },
        },
        commands: revoke(slotUrls([model.collage.slots[index] ?? null])),
      }),
      MovedSelected: ({ direction }) =>
        withCollage(
          model,
          swap(model.collage, model.collage.selected, model.collage.selected + direction),
        ),
      ShuffleRequested: () => ({
        model,
        commands: [ShuffleOrder({ count: model.collage.slots.length })],
      }),
      Shuffled: ({ order }) => {
        const { collage } = model
        if (order.length !== collage.slots.length) return { model }
        const slots = order.map((from) => collage.slots[from] ?? null)
        const selectedKey = collage.slots[collage.selected]?.key
        const kept = slots.findIndex((slot) => slot !== null && slot.key === selectedKey)
        return withCollage(model, {
          ...collage,
          slots,
          selected: kept === -1 ? collage.selected : kept,
        })
      },
      CollageClearRequested: () => ({
        model: {
          ...model,
          collage: {
            ...model.collage,
            slots: model.collage.slots.map(() => null),
            selected: 0,
            status: '',
          },
        },
        commands: revoke(slotUrls(model.collage.slots)),
      }),
      ChangedZoom: ({ zoom }) =>
        updateSelected(model, (slot) => ({ ...slot, adjust: { ...slot.adjust, zoom } })),
      ChangedFocus: ({ fx, fy }) =>
        updateSelected(model, (slot) => ({ ...slot, adjust: { ...slot.adjust, fx, fy } })),
      ResetView: () => updateSelected(model, (slot) => ({ ...slot, adjust: defaultAdjust })),
      PressedCell: ({ index, x, y, cellWidth, cellHeight }) => {
        const slot = model.collage.slots[index] ?? null
        return withCollage(model, {
          ...model.collage,
          selected: index,
          pan:
            slot === null
              ? null
              : { index, startX: x, startY: y, cellWidth, cellHeight, start: slot.adjust },
        })
      },
      MovedPointer: ({ x, y }) => {
        const { pan } = model.collage
        if (pan === null) return { model }
        const slot = model.collage.slots[pan.index] ?? null
        if (slot === null) return { model }
        const adjust = panAdjust(
          slot.width,
          slot.height,
          pan.cellWidth,
          pan.cellHeight,
          pan.start,
          x - pan.startX,
          y - pan.startY,
        )
        return withCollage(model, {
          ...model.collage,
          slots: model.collage.slots.map((current, index) =>
            index === pan.index && current !== null ? { ...current, adjust } : current,
          ),
        })
      },
      ReleasedPointer: () =>
        model.collage.pan === null
          ? { model }
          : withCollage(model, { ...model.collage, pan: null }),
      DragStartedCell: ({ index }) => withCollage(model, { ...model.collage, dragFrom: index }),
      DroppedOnCell: ({ index }) => {
        const from = model.collage.dragFrom
        const cleared = { ...model.collage, dragFrom: null }
        return withCollage(model, from === null ? cleared : swap(cleared, from, index))
      },
      CollageSaveRequested: () => {
        const { collage, settings } = model
        if (collage.saving) return { model }
        if (collage.slots.every((slot) => slot === null)) {
          return withCollage(model, { ...collage, status: 'Add at least one photo first.' })
        }
        return {
          model: { ...model, collage: { ...collage, saving: true, status: 'Working…' } },
          commands: [
            SaveCollage({
              files: collage.slots.map((slot) => slot?.file ?? null),
              cells: collage.slots.map((slot) => slot?.adjust ?? defaultAdjust),
              template: resolveTemplate(collage),
              ratio: collage.ratio,
              gapPercent: collage.gapPercent,
              settings,
            }),
          ],
        }
      },
      CollageSaved: ({ width, height, size, count }) =>
        withCollage(model, {
          ...model.collage,
          saving: false,
          status: `Saved ${width} × ${height} · ${formatBytes(size)} · ${plural(count, 'photo')}.`,
        }),
      CollageSaveFailed: ({ error }) =>
        withCollage(model, { ...model.collage, saving: false, status: error }),
    }),
  )
