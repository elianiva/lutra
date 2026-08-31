import { describe, it, expect } from 'vitest'
import {
  Command,
  click,
  expect as sceneExpect,
  expectNoOutMessage,
  expectOutMessage,
  given,
  scene,
  text,
  role,
} from 'foldkit/scene'
import { CollageId, EditId, EditSummary } from '@lutra/store'
import type { EditSummary as EditSummaryRecord } from '@lutra/store'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { CreateCollage } from './command'
import { GalleryMessage, GalleryOutMessage } from './message'

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

const gridWith = (...ids: readonly EditId[]) => ({
  ...initialModel(),
  grid: { _tag: 'Success', data: ids.map(summary) } as const,
})

const collageId = CollageId('44444444-4444-4444-8444-444444444444')

describe('gallery: collage selection', () => {
  it('a selected tile shows a check and the accent border; the CTA appears at two', () => {
    const one = editId(1)
    const two = editId(2)
    const { model: afterFirst } = update(
      gridWith(one, two),
      GalleryMessage.ToggledSelection({ id: one }),
    )
    expect(afterFirst.selection).toEqual([one])

    const { model: both } = update(afterFirst, GalleryMessage.ToggledSelection({ id: two }))
    expect(both.selection).toEqual([one, two])
  })

  it('toggling the same tile twice removes it again', () => {
    const one = editId(1)
    const { model: selected } = update(gridWith(one), GalleryMessage.ToggledSelection({ id: one }))
    const { model: deselected } = update(selected, GalleryMessage.ToggledSelection({ id: one }))
    expect(deselected.selection).toEqual([])
  })

  it('no CTA below two selections; it appears with the count at two or more', () => {
    const one = editId(1)
    const two = editId(2)
    const { model: oneSelected } = update(
      gridWith(one, two),
      GalleryMessage.ToggledSelection({ id: one }),
    )
    scene(
      config,
      given(oneSelected),
      sceneExpect(text('Create collage', { exact: false })).toBeAbsent(),
    )

    const { model: twoSelected } = update(oneSelected, GalleryMessage.ToggledSelection({ id: two }))
    scene(config, given(twoSelected), sceneExpect(text('Create collage (2)')).toExist())
  })

  it('the select control dispatches ToggledSelection without opening the edit', () => {
    const one = editId(1)
    scene(
      config,
      given(gridWith(one)),
      click(role('button', { name: 'Add to collage selection' })),
      // The select control must not bubble into ClickedEdit (which would
      // emit an OpenedEdit OutMessage).
      expectNoOutMessage(),
    )
  })

  it('CreateCollageRequested dispatches CreateCollage with the pick-order selection', () => {
    const one = editId(1)
    const two = editId(2)
    const { model: oneSelected } = update(
      gridWith(one, two),
      GalleryMessage.ToggledSelection({ id: one }),
    )
    const { model: twoSelected } = update(oneSelected, GalleryMessage.ToggledSelection({ id: two }))
    const { commands = [] } = update(twoSelected, GalleryMessage.CreateCollageRequested())
    expect(commands.map((c) => c.name)).toEqual(['CreateCollage'])
  })

  it('a created collage surfaces as the CreatedCollage OutMessage and clears the selection', () => {
    const one = editId(1)
    const two = editId(2)
    const { model: oneSelected } = update(
      gridWith(one, two),
      GalleryMessage.ToggledSelection({ id: one }),
    )
    const { model: twoSelected } = update(oneSelected, GalleryMessage.ToggledSelection({ id: two }))
    scene(
      config,
      given(twoSelected),
      click(text('Create collage (2)')),
      Command.resolve(CreateCollage, GalleryMessage.CollageCreated({ id: collageId })),
      expectOutMessage(GalleryOutMessage.CreatedCollage({ id: collageId })),
    )
    const { model: cleared, outMessage: out } = update(
      twoSelected,
      GalleryMessage.CollageCreated({ id: collageId }),
    )
    expect(cleared.selection).toEqual([])
    expect(out).toEqual(GalleryOutMessage.CreatedCollage({ id: collageId }))
  })

  it('EditsListed prunes the selection to edits that still exist', () => {
    const one = editId(1)
    const two = editId(2)
    const { model: oneSelected } = update(
      gridWith(one, two),
      GalleryMessage.ToggledSelection({ id: one }),
    )
    const { model: twoSelected } = update(oneSelected, GalleryMessage.ToggledSelection({ id: two }))
    // Edit 2 was deleted elsewhere; only summaries for 1 come back.
    const { model: pruned } = update(
      twoSelected,
      GalleryMessage.EditsListed({ summaries: [summary(one)] }),
    )
    expect(pruned.selection).toEqual([one])
  })
})
