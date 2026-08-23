import { describe, it, expect } from 'vitest'
import { Option } from 'effect'
import { AsyncData } from 'foldkit'
import { DragAndDrop } from '@foldkit/ui'
import {
  Command,
  click,
  expect as sceneExpect,
  given,
  role,
  scene,
  selector,
  text,
} from 'foldkit/scene'
import { Dialog } from '@foldkit/ui'
import {
  Collage,
  CollageId,
  defaultCollageLayout,
  defaultTileFraming,
  EditId,
  StoreError,
} from '@lutra/store'
import type { Collage as CollageRecord } from '@lutra/store'

import { initialModel } from './model'
import type { Model } from './model'
import { update } from './update'
import { view } from './view'
import { SnapshotCollageExport, NavigateMenu, SaveCollage } from './command'
import * as ExportDialog from '../export-dialog'
import { CollageMessage } from './message'

const config = {
  update,
  view,
} as const

const id = CollageId('11111111-1111-4111-8111-111111111111')

/** Distinct format-valid Edit ids for the tiles. */
const tileEditId = (n: number): EditId => {
  const digits = String(n).padStart(12, '0')
  return EditId(`22222222-2222-4222-8222-${digits}`)
}

const collageWith = (
  tiles: readonly number[],
  layout?: Partial<{
    columns: number
    rows: number
    gutter: number
    frameRatio: number
    background: 'dark' | 'light'
  }>,
): CollageRecord =>
  Collage.make({
    id,
    savedAt: 1_700_000_000_000,
    layout: { ...defaultCollageLayout(), ...layout },
    tiles: tiles.map((n) => ({
      editId: tileEditId(n),
      framing: defaultTileFraming(),
    })),
  })

const loadedWith = (...args: Parameters<typeof collageWith>): Model => {
  const [model] = update(
    initialModel(),
    CollageMessage.CollageLoaded({ collage: collageWith(...args), photos: [], dropped: 0 }),
  )
  return model
}

/** The loaded collage record behind a model's AsyncData (test precondition). */
const collageOf = (model: Model): CollageRecord => {
  const maybe = AsyncData.getData(model.collage)
  if (Option.isSome(maybe)) {
    return maybe.value
  }
  throw new Error('expected a loaded collage')
}

describe('collage submodel: load', () => {
  it('a loaded collage renders its tiles with remove controls', () => {
    const loaded = loadedWith([1, 2, 3])
    scene(
      config,
      given(loaded),
      sceneExpect(role('button', { name: 'Remove photo 1' })).toExist(),
      sceneExpect(role('button', { name: 'Remove photo 3' })).toExist(),
    )
  })

  it('CollageLoaded fills the AsyncData, shows no notice, and measures the photos', () => {
    const [model, commands, out] = update(
      initialModel(),
      CollageMessage.CollageLoaded({ collage: collageWith([1]), photos: [], dropped: 0 }),
    )
    expect(model.collage._tag).toBe('Success')
    expect(model.notice).toBe(null)
    expect(commands.map((c) => c.name)).toEqual(['MeasureThumbs'])
    expect(Option.isNone(out)).toBe(true)
  })

  it('dropped dangling references surface a notice', () => {
    const [model] = update(
      initialModel(),
      CollageMessage.CollageLoaded({ collage: collageWith([1]), photos: [], dropped: 2 }),
    )
    expect(model.notice).toBe('2 photos removed — their edits were deleted')
  })

  it('one dropped reference reads in the singular', () => {
    const [model] = update(
      initialModel(),
      CollageMessage.CollageLoaded({ collage: collageWith([1]), photos: [], dropped: 1 }),
    )
    expect(model.notice).toBe('1 photo removed — their edits were deleted')
  })

  it('ThumbsMeasured lands in the model for framing math', () => {
    const [measured] = update(
      initialModel(),
      CollageMessage.ThumbsMeasured({
        sizes: [{ editId: tileEditId(1), width: 300, height: 200 }],
      }),
    )
    expect(measured.sizes).toEqual([{ editId: tileEditId(1), width: 300, height: 200 }])
    // A re-measure replaces, not duplicates.
    const [again] = update(
      measured,
      CollageMessage.ThumbsMeasured({
        sizes: [{ editId: tileEditId(1), width: 600, height: 400 }],
      }),
    )
    expect(again.sizes).toEqual([{ editId: tileEditId(1), width: 600, height: 400 }])
  })

  it('LoadFailed lands in the failure state', () => {
    const [model] = update(
      initialModel(),
      CollageMessage.LoadFailed({ error: new StoreError({ message: 'quota' }) }),
    )
    expect(model.collage._tag).toBe('Failure')
  })

  it('CollageMissing lands in the failure state', () => {
    const [model] = update(initialModel(), CollageMessage.CollageMissing())
    expect(model.collage._tag).toBe('Failure')
  })
})

describe('collage submodel: back navigation', () => {
  it('the back control dispatches NavigateMenu, which pushes the menu URL', () => {
    scene(
      config,
      given(initialModel()),
      click(text('← Menu')),
      Command.expectHas(NavigateMenu),
      Command.resolve(NavigateMenu, CollageMessage.NavigatedBack()),
    )
  })

  it('BackRequested emits only the NavigateMenu command', () => {
    const [, commands, out] = update(initialModel(), CollageMessage.BackRequested())
    expect(commands.map((c) => c.name)).toEqual(['NavigateMenu'])
    expect(Option.isNone(out)).toBe(true)
  })
})

describe('collage submodel: layout auto-saves', () => {
  it('ChangedColumns clamps to 1–6 and queues a save', () => {
    const loaded = loadedWith([1, 2, 3], { columns: 3 })
    const [high, highCommands] = update(loaded, CollageMessage.ChangedColumns({ columns: 99 }))
    expect(collageOf(high).layout.columns).toBe(6)
    expect(highCommands.map((c) => c.name)).toEqual(['SaveCollage'])
    const [low] = update(loaded, CollageMessage.ChangedColumns({ columns: 0 }))
    expect(collageOf(low).layout.columns).toBe(1)
  })

  it('ChangedRows clamps to 1–6 and queues a save (docs/adr/0035)', () => {
    const loaded = loadedWith([1, 2, 3], { columns: 3, rows: 2 })
    const [high, highCommands] = update(loaded, CollageMessage.ChangedRows({ rows: 99 }))
    expect(collageOf(high).layout.rows).toBe(6)
    expect(highCommands.map((c) => c.name)).toEqual(['SaveCollage'])
    const [low] = update(loaded, CollageMessage.ChangedRows({ rows: 0 }))
    expect(collageOf(low).layout.rows).toBe(1)
  })

  it('an explicit M×N grid renders its spare capacity as background cells (docs/adr/0035)', () => {
    const loaded = loadedWith([1], { columns: 2, rows: 2 })
    scene(
      config,
      given(loaded),
      // The Rows control sits beside Columns.
      sceneExpect(selector('[data-control="rows"]')).toExist(),
      sceneExpect(role('button', { name: 'One more row' })).toExist(),
      // A 2×2 grid holding one photo leaves three background cells.
      sceneExpect(selector('[data-collage-grid="2x2"]')).toExist(),
      sceneExpect(selector('[data-collage-empty-cell="0"]')).toExist(),
      sceneExpect(selector('[data-collage-empty-cell="2"]')).toExist(),
      // Dropping to one row re-flows the same tile into a 2×1 grid.
      click(role('button', { name: 'One fewer row' })),
      Command.resolve(SaveCollage, CollageMessage.CollageSaved()),
      sceneExpect(selector('[data-collage-grid="2x1"]')).toExist(),
      sceneExpect(selector('[data-collage-empty-cell="0"]')).toExist(),
      sceneExpect(selector('[data-collage-empty-cell="2"]')).toBeAbsent(),
    )
  })

  it('ChangedGutter clamps to 0–32', () => {
    const loaded = loadedWith([1, 2, 3])
    const [high] = update(loaded, CollageMessage.ChangedGutter({ gutter: 100 }))
    const [low] = update(loaded, CollageMessage.ChangedGutter({ gutter: -5 }))
    expect(collageOf(high).layout.gutter).toBe(32)
    expect(collageOf(low).layout.gutter).toBe(0)
  })

  it('ChangedFrameRatio clamps to 0.5–3 and queues a save', () => {
    const loaded = loadedWith([1, 2, 3])
    const [preset] = update(loaded, CollageMessage.ChangedFrameRatio({ frameRatio: 4 / 5 }))
    expect(collageOf(preset).layout.frameRatio).toBeCloseTo(0.8)
    const [high] = update(loaded, CollageMessage.ChangedFrameRatio({ frameRatio: 99 }))
    expect(collageOf(high).layout.frameRatio).toBe(3)
    const [low] = update(loaded, CollageMessage.ChangedFrameRatio({ frameRatio: 0.01 }))
    expect(collageOf(low).layout.frameRatio).toBe(0.5)
  })

  it('ToggledBackground flips dark ↔ light', () => {
    const loaded = loadedWith([1, 2, 3], { background: 'dark' })
    const [flipped] = update(loaded, CollageMessage.ToggledBackground())
    expect(collageOf(flipped).layout.background).toBe('light')
    const [back] = update(flipped, CollageMessage.ToggledBackground())
    expect(collageOf(back).layout.background).toBe('dark')
  })

  it('layout messages with nothing loaded are ignored — no edge, no save', () => {
    for (const message of [
      CollageMessage.ChangedColumns({ columns: 5 }),
      CollageMessage.ChangedRows({ rows: 5 }),
      CollageMessage.ChangedGutter({ gutter: 16 }),
      CollageMessage.ChangedFrameRatio({ frameRatio: 1.5 }),
      CollageMessage.ToggledBackground(),
    ]) {
      const [model, commands] = update(initialModel(), message)
      expect(model).toEqual(initialModel())
      expect(commands).toEqual([])
    }
  })

  it('a failed auto-save surfaces a notice instead of losing the change silently', () => {
    const loaded = loadedWith([1, 2, 3])
    const [model] = update(
      loaded,
      CollageMessage.SaveFailed({ error: new StoreError({ message: 'quota' }) }),
    )
    expect(model.notice).toBe('Could not save the collage: quota')
  })
})

describe('collage submodel: arrange mode', () => {
  it('starts in Arrange mode; the toggle switches and renders the mode buttons', () => {
    const loaded = loadedWith([1, 2])
    expect(loaded.mode).toBe('arrange')
    scene(
      config,
      given(loaded),
      sceneExpect(role('button', { name: 'Arrange photos' })).toExist(),
      sceneExpect(role('button', { name: 'Frame photos' })).toExist(),
      click(role('button', { name: 'Frame photos' })),
      sceneExpect(role('button', { name: 'Reset framing of photo 1' })).toExist(),
      sceneExpect(role('button', { name: 'Remove photo 1' })).toBeAbsent(),
    )
  })

  it('RemovedTile drops by index, queues a save, and shows the undo toast', () => {
    const loaded = loadedWith([7, 8, 9])
    const [model, commands] = update(loaded, CollageMessage.RemovedTile({ index: 1 }))
    expect(collageOf(model).tiles.map((t) => t.editId)).toEqual([tileEditId(7), tileEditId(9)])
    expect(commands.map((c) => c.name)).toEqual(['SaveCollage', 'ScheduleUndoExpiry'])
    expect(model.undo?.tiles.map((t) => t.editId)).toEqual([
      tileEditId(7),
      tileEditId(8),
      tileEditId(9),
    ])
    expect(model.undoLabel).toBe('Removed photo')
  })

  it('removing the last photo flags the user-emptied state', () => {
    const loaded = loadedWith([7])
    const [model] = update(loaded, CollageMessage.RemovedTile({ index: 0 }))
    expect(model.userEmptied).toBe(true)
    scene(
      config,
      given(model),
      sceneExpect(text('All photos removed.')).toExist(),
      sceneExpect(
        text('Bring them back with Undo, or delete the collage from the menu.'),
      ).toExist(),
    )
  })

  it('a dangling-drop empty state reads differently from a user-emptied one', () => {
    scene(
      config,
      given(loadedWith([])),
      sceneExpect(text('Every photo in this collage is gone.')).toExist(),
    )
  })

  it('UndoPressed restores the snapshotted tiles and saves', () => {
    const loaded = loadedWith([7, 8, 9])
    const [removed] = update(loaded, CollageMessage.RemovedTile({ index: 1 }))
    const [restored, commands] = update(removed, CollageMessage.UndoPressed())
    expect(collageOf(restored).tiles.map((t) => t.editId)).toEqual([
      tileEditId(7),
      tileEditId(8),
      tileEditId(9),
    ])
    expect(restored.undo).toBe(null)
    expect(commands.map((c) => c.name)).toEqual(['SaveCollage'])
  })

  it('UndoExpired clears the slot only for the matching sequence', () => {
    const loaded = loadedWith([7, 8])
    const [removed] = update(loaded, CollageMessage.RemovedTile({ index: 0 }))
    const seq = removed.undo?.seq ?? -1
    const [stale] = update(removed, CollageMessage.UndoExpired({ seq: seq + 1 }))
    expect(stale.undo).not.toBe(null)
    const [expired] = update(removed, CollageMessage.UndoExpired({ seq }))
    expect(expired.undo).toBe(null)
    expect(expired.undoLabel).toBe(null)
  })

  it('a drag-and-drop gesture that lands reorders with an undo snapshot', () => {
    const loaded = loadedWith([1, 2, 3])
    const press = CollageMessage.GotDragMessage({
      message: DragAndDrop.Message.PressedDraggable({
        itemId: tileEditId(1),
        containerId: 'tile-0',
        index: 0,
        screenX: 0,
        screenY: 0,
      }),
    })
    const move = CollageMessage.GotDragMessage({
      message: DragAndDrop.Message.MovedPointer({
        screenX: 500,
        screenY: 0,
        clientX: 500,
        clientY: 0,
        maybeDropTarget: Option.some({ containerId: 'tile-2', index: 0 }),
      }),
    })
    const release = CollageMessage.GotDragMessage({
      message: DragAndDrop.Message.ReleasedPointer(),
    })

    const [pending] = update(loaded, press)
    expect(pending.drag.dragState._tag).toBe('Pending')
    const [dragging] = update(pending, move)
    expect(dragging.drag.dragState._tag).toBe('Dragging')
    const [done, commands] = update(dragging, release)
    // Dropped before tile 2 → the first photo lands between photos 2 and 3.
    expect(collageOf(done).tiles.map((t) => t.editId)).toEqual([
      tileEditId(2),
      tileEditId(1),
      tileEditId(3),
    ])
    expect(done.undoLabel).toBe('Photos reordered')
    expect(commands.map((c) => c.name)).toEqual(['SaveCollage', 'ScheduleUndoExpiry'])
  })

  it('a released drag without a target cancels cleanly', () => {
    const loaded = loadedWith([1, 2])
    const [pending] = update(
      loaded,
      CollageMessage.GotDragMessage({
        message: DragAndDrop.Message.PressedDraggable({
          itemId: tileEditId(1),
          containerId: 'tile-0',
          index: 0,
          screenX: 0,
          screenY: 0,
        }),
      }),
    )
    const [dragging] = update(
      pending,
      CollageMessage.GotDragMessage({
        message: DragAndDrop.Message.MovedPointer({
          screenX: 500,
          screenY: 0,
          clientX: 500,
          clientY: 0,
          maybeDropTarget: Option.none(),
        }),
      }),
    )
    const [done] = update(
      dragging,
      CollageMessage.GotDragMessage({ message: DragAndDrop.Message.ReleasedPointer() }),
    )
    expect(collageOf(done).tiles.map((t) => t.editId)).toEqual([tileEditId(1), tileEditId(2)])
    expect(done.drag.dragState._tag).toBe('Idle')
  })
})

describe('collage submodel: frame mode', () => {
  it('ModeChanged to arrange commits an in-flight framing draft', () => {
    // A wide photo in a square cell has horizontal overflow to pan through.
    const loaded: Model = {
      ...loadedWith([1, 2]),
      mode: 'frame',
      cellPx: { width: 200, height: 200 },
      sizes: [{ editId: tileEditId(1), width: 400, height: 100 }],
    }
    const [panning] = update(
      loaded,
      CollageMessage.PanStarted({ index: 0, screenX: 0, screenY: 0 }),
    )
    const [moved] = update(panning, CollageMessage.PanMoved({ screenX: 100, screenY: 0 }))
    expect(moved.framingDraft).not.toBe(null)
    const [committed, commands] = update(moved, CollageMessage.ModeChanged({ mode: 'arrange' }))
    expect(committed.mode).toBe('arrange')
    expect(committed.framingDraft).toBe(null)
    expect(collageOf(committed).tiles[0]!.framing).not.toEqual(defaultTileFraming())
    expect(commands.map((c) => c.name)).toEqual(['SaveCollage', 'ScheduleUndoExpiry'])
  })

  it('PanStarted seeds a draft; PanMoved pans within bounds; PanEnded commits', () => {
    const base = {
      ...loadedWith([1, 2]),
      mode: 'frame' as const,
      cellPx: { width: 100, height: 100 },
    }
    // A wide photo overflows horizontally, so panning has room.
    const sized = {
      ...base,
      sizes: [{ editId: tileEditId(1), width: 400, height: 100 }],
    }
    const [started] = update(sized, CollageMessage.PanStarted({ index: 0, screenX: 0, screenY: 0 }))
    expect(started.framingDraft?.index).toBe(0)
    expect(started.framingDraft?.framing).toEqual(defaultTileFraming())
    const [moved] = update(started, CollageMessage.PanMoved({ screenX: 50, screenY: 0 }))
    // Dragging right moves the visible window left in image space.
    expect(moved.framingDraft?.framing.focusX).toBeLessThan(0.5)
    const [ended, commands] = update(moved, CollageMessage.PanEnded())
    expect(ended.framingDraft).toBe(null)
    expect(ended.pan).toBe(null)
    expect(collageOf(ended).tiles[0]!.framing.focusX).toBeLessThan(0.5)
    expect(commands.map((c) => c.name)).toEqual(['SaveCollage', 'ScheduleUndoExpiry'])
  })

  it('pan with an unmeasured cell size is a no-op', () => {
    const base = { ...loadedWith([1, 2]), mode: 'frame' as const }
    const [started] = update(base, CollageMessage.PanStarted({ index: 0, screenX: 0, screenY: 0 }))
    const [moved] = update(started, CollageMessage.PanMoved({ screenX: 50, screenY: 0 }))
    expect(moved.framingDraft?.framing).toEqual(defaultTileFraming())
  })

  it('WheelZoomed drafts the zoom and commits once the wheel goes quiet', () => {
    const base = {
      ...loadedWith([1, 2]),
      mode: 'frame' as const,
      cellPx: { width: 100, height: 100 },
    }
    const [zoomed] = update(base, CollageMessage.WheelZoomed({ index: 0, deltaY: -100 }))
    expect(zoomed.framingDraft?.framing.zoom).toBeGreaterThan(1)
    const seq = zoomed.zoomSeq
    const [settled, commands] = update(zoomed, CollageMessage.ZoomSettled({ seq }))
    expect(collageOf(settled).tiles[0]!.framing.zoom).toBeGreaterThan(1)
    expect(commands.map((c) => c.name)).toEqual(['SaveCollage', 'ScheduleUndoExpiry'])
    // A stale settle (a newer gesture re-armed the timer) does nothing.
    const [again] = update(base, CollageMessage.WheelZoomed({ index: 0, deltaY: -100 }))
    const [stale] = update(again, CollageMessage.ZoomSettled({ seq: again.zoomSeq + 1 }))
    expect(stale.framingDraft).not.toBe(null)
  })

  it('ResetFraming restores cover-centered and takes an undo snapshot', () => {
    const base = { ...loadedWith([1, 2]), mode: 'frame' as const }
    const framedCollage = {
      ...collageWith([1, 2]),
      tiles: [
        {
          editId: tileEditId(1),
          framing: { zoom: 2, focusX: 0.5, focusY: 0.5 },
        },
        { editId: tileEditId(2), framing: defaultTileFraming() },
      ],
    }
    const framed: Model = {
      ...base,
      collage: AsyncData.Success({ data: framedCollage }),
    }
    const [reset, commands] = update(framed, CollageMessage.ResetFraming({ index: 0 }))
    expect(collageOf(reset).tiles[0]!.framing).toEqual(defaultTileFraming())
    expect(reset.undoLabel).toBe('Framing reset')
    expect(commands.map((c) => c.name)).toEqual(['SaveCollage', 'ScheduleUndoExpiry'])
  })

  it('ResetFraming on an untouched tile is a no-op', () => {
    const base = { ...loadedWith([1, 2]), mode: 'frame' as const }
    const [model, commands] = update(base, CollageMessage.ResetFraming({ index: 0 }))
    expect(model).toBe(base)
    expect(commands).toEqual([])
  })

  it('framing messages outside Frame mode are ignored', () => {
    const loaded = loadedWith([1, 2])
    for (const message of [
      CollageMessage.PanStarted({ index: 0, screenX: 0, screenY: 0 }),
      CollageMessage.ResetFraming({ index: 0 }),
      CollageMessage.WheelZoomed({ index: 0, deltaY: -100 }),
    ]) {
      const [model, commands] = update(loaded, message)
      expect(model).toBe(loaded)
      expect(commands).toEqual([])
    }
  })
})

// ---- export flow ----

// Resolve the dialog's internal ShowDialog command.
const openDialog = [
  Command.expectHas(Dialog.ShowDialog),
  Command.resolve(Dialog.ShowDialog, Dialog.Message.CompletedShowDialog()),
]

describe('collage submodel: export', () => {
  it('opens on ExportRequested, composes once, and encodes only on Export press', () => {
    scene(
      config,
      given(loadedWith([1, 2])),
      click(selector('[aria-label^="Export"]')),
      ...openDialog,
      // The dialog shows the shared sections and the collage filename.
      sceneExpect(text('EXPORT')).toExist(),
      sceneExpect(text('lutra-collage.png')).toExist(),
      sceneExpect(text('PNG')).toExist(),
      sceneExpect(text('100%')).toExist(),
      // Composition starts immediately and lands in the frame slot.
      Command.expectHas(SnapshotCollageExport),
      Command.resolve(
        SnapshotCollageExport,
        CollageMessage.CollageExportSnapshotted({ failedTiles: 0 }),
      ),
      Command.expectNone(),

      // Pressing Export encodes and downloads — the size appears.
      click(text('Export')),
      sceneExpect(text('Encoding…')).toExist(),
      Command.expectHas(ExportDialog.PrepareExport),
      Command.resolve(
        ExportDialog.PrepareExport,
        ExportDialog.Message.EncodePrepared({ sizeBytes: 4096, url: 'blob:collage-1' }),
      ),
      Command.expectHas(ExportDialog.ExportDownload),
      Command.resolve(
        ExportDialog.ExportDownload,
        ExportDialog.Message.Downloaded({ url: 'blob:collage-1' }),
      ),
      sceneExpect(text('Downloaded', { exact: false })).toExist(),
      sceneExpect(text('4.0 KB', { exact: false })).toExist(),
      // The dialog stays open after a download.
      sceneExpect(text('EXPORT')).toExist(),
      Command.expectNone(),
    )
  })

  it('closing the dialog revokes the blob url', () => {
    scene(
      config,
      given(loadedWith([1])),
      click(selector('[aria-label^="Export"]')),
      ...openDialog,
      Command.resolve(
        SnapshotCollageExport,
        CollageMessage.CollageExportSnapshotted({ failedTiles: 0 }),
      ),
      click(text('Export')),
      Command.resolve(
        ExportDialog.PrepareExport,
        ExportDialog.Message.EncodePrepared({ sizeBytes: 4096, url: 'blob:collage-1' }),
      ),
      Command.resolve(
        ExportDialog.ExportDownload,
        ExportDialog.Message.Downloaded({ url: 'blob:collage-1' }),
      ),
      // Cancel closes: the composed frame drops and the url is revoked.
      click(text('Cancel')),
      Command.resolve(Dialog.CloseDialog, Dialog.Message.CompletedCloseDialog()),
      Command.resolve(ExportDialog.RevokeExportUrl, ExportDialog.Message.UrlRevoked()),
    )
  })

  it('format changes persist through the shared settings key and update the filename', () => {
    scene(
      config,
      given(loadedWith([1])),
      click(selector('[aria-label^="Export"]')),
      ...openDialog,
      Command.resolve(
        SnapshotCollageExport,
        CollageMessage.CollageExportSnapshotted({ failedTiles: 0 }),
      ),
      click(text('JPEG')),
      sceneExpect(text('lutra-collage.jpeg')).toExist(),
      Command.resolve(ExportDialog.SaveExportSettings, ExportDialog.Message.SettingsSaved()),
      Command.expectNone(),
    )
  })
})

describe('collage export: update-level guards', () => {
  it('a compose that lands while the dialog is closed is dropped', () => {
    // No ExportRequested has opened the dialog.
    const [model, commands] = update(
      initialModel(),
      CollageMessage.CollageExportSnapshotted({ failedTiles: 0 }),
    )
    expect(model.exportDialog.ready).toBe(false)
    expect(commands).toEqual([])
  })

  it('failed tiles surface a count in the notice', () => {
    const [opened] = update(loadedWith([1, 2]), CollageMessage.ExportRequested())
    expect(opened.exportDialog.dialog.isOpen).toBe(true)
    const [model] = update(opened, CollageMessage.CollageExportSnapshotted({ failedTiles: 2 }))
    expect(model.notice).toBe('2 photos could not be rendered and show as blank')
    expect(model.exportDialog.ready).toBe(true)
  })

  it('one failed tile reads in the singular', () => {
    const [opened] = update(loadedWith([1]), CollageMessage.ExportRequested())
    const [model] = update(opened, CollageMessage.CollageExportSnapshotted({ failedTiles: 1 }))
    expect(model.notice).toBe('1 photo could not be rendered and show as blank')
  })
})
