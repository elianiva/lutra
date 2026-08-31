import { describe, it, expect as vitestExpect } from 'vitest'
import { StoreError } from '@lutra/store'
import { Command, click, expect, given, scene, selector, text } from 'foldkit/scene'
import { Dialog } from '@foldkit/ui'
import { EditId, EditSummary } from '@lutra/store'
import type { EditSummary as EditSummaryRecord } from '@lutra/store'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { DeleteEdit, ListEdits } from './command'
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

const loaded = {
  ...initialModel(),
  grid: { _tag: 'Success', data: [summary(editId(1)), summary(editId(2))] } as const,
}

// Resolve the delete dialog's internal ShowDialog command.
const openDialog = [
  Command.expectHas(Dialog.ShowDialog),
  Command.resolve(Dialog.ShowDialog, Dialog.Message.SucceededShowDialog()),
]

describe('gallery: delete-confirmation dialog', () => {
  it('the tile ✕ opens the dialog instead of deleting straight away', () => {
    scene(
      config,
      given(loaded),
      // No dialog content before the ✕.
      expect(text('DELETE PHOTO')).not.toExist(),

      click(selector('[data-delete-edit-id]')),
      ...openDialog,
      expect(text('DELETE PHOTO')).toExist(),
      expect(selector('[data-confirm-delete]')).toExist(),
      Command.expectNone(),
    )
  })

  it('arming the confirm sets pendingDelete and opens the dialog submodel', () => {
    const id = editId(1)
    const { model, commands = [] } = update(loaded, GalleryMessage.DeleteConfirmRequested({ id }))
    vitestExpect(model.pendingDelete).toBe(id)
    vitestExpect(model.deleteDialog.isOpen).toBe(true)
    vitestExpect(commands.map((c) => c.name)).toEqual(['ShowDialog'])
  })

  it('Cancel dismisses the dialog and disarms the pending delete', () => {
    scene(
      config,
      given(loaded),
      click(selector('[data-delete-edit-id]')),
      ...openDialog,

      click(selector('[data-cancel-delete]')),
      Command.expectHas(Dialog.CloseDialog),
      Command.resolve(Dialog.CloseDialog, Dialog.Message.CompletedCloseDialog()),
      expect(text('DELETE PHOTO')).not.toExist(),
      Command.expectNone(),
    )

    // Every dismissal path arrives as RequestedClose — Esc and backdrop
    // clicks included — and must also clear the armed id.
    const { model: armed } = update(
      loaded,
      GalleryMessage.DeleteConfirmRequested({ id: editId(1) }),
    )
    const { model: dismissed } = update(
      armed,
      GalleryMessage.GotDeleteDialogMessage({ message: Dialog.Message.RequestedClose() }),
    )
    vitestExpect(dismissed.pendingDelete).toBe(null)
    vitestExpect(dismissed.deleteDialog.isOpen).toBe(false)
  })

  it('confirming deletes via the store and closes the dialog; success re-lists', () => {
    const id = editId(1)
    const { model: armed } = update(loaded, GalleryMessage.DeleteConfirmRequested({ id }))

    // Confirm fires the store delete plus the dialog's own close command.
    const { model: afterConfirm, commands = [] } = update(
      armed,
      GalleryMessage.DeleteRequested({ id }),
    )
    vitestExpect(afterConfirm.pendingDelete).toBe(null)
    vitestExpect(afterConfirm.deleteDialog.isOpen).toBe(false)
    vitestExpect(commands.slice(0, 1).map((c) => c.name)).toEqual([DeleteEdit.name])

    // A successful store delete re-lists the grid.
    const { commands: followUps = [] } = update(afterConfirm, GalleryMessage.EditDeleted())
    vitestExpect(followUps.map((c) => c.name)).toEqual([ListEdits.name])
  })

  it('a failed delete surfaces the notice banner', () => {
    const { model: failed } = update(
      loaded,
      GalleryMessage.DeleteFailed({ error: new StoreError({ message: 'disk full' }) }),
    )
    vitestExpect(failed.notice).toBe('Delete failed: disk full')
  })
})
