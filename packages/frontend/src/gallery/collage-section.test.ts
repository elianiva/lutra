import { describe, it, expect } from 'vitest'
import {
  Command,
  click,
  expect as sceneExpect,
  expectOutMessage,
  given,
  scene,
  selector,
} from 'foldkit/scene'
import {
  Collage,
  CollageId,
  defaultCollageLayout,
  defaultTileFraming,
  EditId,
  EditSummary,
} from '@lutra/store'
import type { Collage as CollageRecord, EditSummary as EditSummaryRecord } from '@lutra/store'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { DeleteCollage, ListCollages, MeasureCollageThumbs } from './command'
import { GalleryMessage } from './message'

const config = {
  update,
  view,
} as const

const editId = (n: number): EditId => {
  const digits = String(n).padStart(12, '0')
  return EditId(`33333333-3333-4333-8333-${digits}`)
}

const summary = (id: EditId): EditSummaryRecord =>
  EditSummary.make({
    byteLength: 10,
    chain: [],
    id,
    savedAt: 1_700_000_000_000,
    thumbnail: new Uint8Array([1]),
  })

const collageId = (n: number) => {
  const digits = String(n).padStart(12, '0')
  return CollageId(`44444444-4444-4444-8444-${digits}`)
}

const collage = (id: CollageId, tileIds: readonly EditId[]): CollageRecord =>
  Collage.make({
    id,
    savedAt: 1_700_000_000_000,
    layout: defaultCollageLayout(),
    tiles: tileIds.map((editId) => ({ editId, framing: defaultTileFraming() })),
  })

/** A model with a loaded edits grid and a loaded collages list. */
const loadedWith = (...collages: readonly CollageRecord[]) => ({
  ...initialModel(),
  grid: { _tag: 'Success', data: [summary(editId(1)), summary(editId(2))] } as const,
  collages: { _tag: 'Success', data: collages } as const,
})

describe('gallery: collages section', () => {
  it('renders a card per collage with its photo count; hidden when the list is empty', () => {
    const twoPhotos = collage(collageId(1), [editId(1), editId(2)])
    scene(
      config,
      given(loadedWith(twoPhotos)),
      sceneExpect(selector('[data-collages-section="true"]')).toExist(),
      sceneExpect(selector('[data-collage-id]')).toExist(),
      sceneExpect(selector('[data-open-collage-id]')).toExist(),
      // The delete control is present but not yet armed.
      sceneExpect(selector('[data-delete-collage-id]')).toExist(),
      sceneExpect(selector('[data-confirm-delete-collage-id]')).toBeAbsent(),
    )

    // No collages → no section at all.
    scene(
      config,
      given(loadedWith()),
      sceneExpect(selector('[data-collages-section="true"]')).toBeAbsent(),
    )
  })

  it('clicking a card surfaces OpenedCollage for the root to navigate on', () => {
    scene(
      config,
      given(loadedWith(collage(collageId(1), [editId(1)]))),
      click(selector('[data-open-collage-id]')),
      expectOutMessage(OpenedCollageOut),
      Command.expectNone(),
    )
  })

  it('the ✕ arms the inline confirm; ✗ cancels; arming another card moves the state', () => {
    const first = collage(collageId(1), [editId(1)])
    const second = collage(collageId(2), [editId(2)])

    // Arm the first card.
    const { model: armed } = update(
      loadedWith(first),
      GalleryMessage.ToggledCollageDeleteConfirm({ id: first.id }),
    )
    expect(armed.confirmingCollageDelete).toBe(first.id)

    // Re-tap disarms.
    const { model: disarmed } = update(armed, GalleryMessage.ToggledCollageDeleteConfirm({ id: first.id }))
    expect(disarmed.confirmingCollageDelete).toBe(null)

    // Arming the second moves the state off the first.
    const { model: moved } = update(armed, GalleryMessage.ToggledCollageDeleteConfirm({ id: second.id }))
    expect(moved.confirmingCollageDelete).toBe(second.id)

    // Cancel clears.
    const { model: cleared } = update(moved, GalleryMessage.CollageDeleteConfirmCancelled())
    expect(cleared.confirmingCollageDelete).toBe(null)
  })

  it('the armed card shows the red confirm + cancel controls in the view', () => {
    const first = collage(collageId(1), [editId(1)])
    const { model: armed } = update(
      loadedWith(first),
      GalleryMessage.ToggledCollageDeleteConfirm({ id: first.id }),
    )
    scene(
      config,
      given(armed),
      sceneExpect(selector('[data-confirm-delete-collage-id]')).toExist(),
      sceneExpect(selector('[data-cancel-delete-collage-id]')).toExist(),
      sceneExpect(selector('[data-delete-collage-id]')).toBeAbsent(),
    )
  })

  it('confirming deletes via the store, re-lists, and clears the confirm state', () => {
    const first = collage(collageId(1), [editId(1)])
    const { model: armed } = update(
      loadedWith(first),
      GalleryMessage.ToggledCollageDeleteConfirm({ id: first.id }),
    )
    const { commands = [] } = update(armed, GalleryMessage.CollageDeleteRequested({ id: first.id }))
    expect(commands.map((c) => c.name)).toEqual([DeleteCollage.name])

    const { model: afterDelete, commands: followUps = [] } = update(armed, GalleryMessage.CollageDeleted())
    expect(afterDelete.confirmingCollageDelete).toBe(null)
    expect(followUps.map((c) => c.name)).toEqual([ListCollages.name])
  })

  it('a custom-framed tile triggers thumbnail measurement; a default one does not', () => {
    const custom = Collage.make({
      id: collageId(1),
      savedAt: 1,
      layout: defaultCollageLayout(),
      tiles: [
        { editId: editId(1), framing: { zoom: 2, focusX: 0.5, focusY: 0.5 } },
        { editId: editId(2), framing: defaultTileFraming() },
      ],
    })
    const plain = collage(collageId(2), [editId(1), editId(2)])

    // Only the custom-framed tile's summary is sent off to be measured.
    const { model, commands = [] } = update(
      loadedWith(custom, plain),
      GalleryMessage.CollagesListed({ collages: [custom, plain] }),
    )
    expect(model.collages._tag).toBe('Success')
    expect(commands.map((c) => c.name)).toEqual([MeasureCollageThumbs.name])
    const measure = commands[0]!
    // The Command type erases args to a record; read the declared field by key.
    const args = measure.args ?? {}
    expect(args['thumbs']).toEqual([{ id: editId(1), thumbnail: summary(editId(1)).thumbnail }])

    // All-default collages cost nothing.
    const { commands: none = [] } = update(loadedWith(plain), GalleryMessage.CollagesListed({ collages: [plain] }))
    expect(none).toEqual([])
  })

  it('CollageThumbsMeasured lands in the model for the mini-preview mirror', () => {
    const { model } = update(
      loadedWith(),
      GalleryMessage.CollageThumbsMeasured({
        sizes: [{ editId: editId(1), width: 400, height: 100 }],
      }),
    )
    expect(model.collageThumbSizes).toEqual([{ editId: editId(1), width: 400, height: 100 }])
  })
})

// The OutMessage fact the open click must produce.
const OpenedCollageOut = {
  _tag: 'OpenedCollage',
  id: collageId(1),
} as const
