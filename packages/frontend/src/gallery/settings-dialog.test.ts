import { describe, it, expect as vitestExpect } from 'vitest'
import { Option } from 'effect'
import { Command, click, expect, given, scene, selector, text } from 'foldkit/scene'
import { Dialog } from '@foldkit/ui'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { GalleryMessage } from './message'

const config = {
  update,
  view,
} as const

// Resolve the dialog's internal ShowDialog command.
const openDialog = [
  Command.expectHas(Dialog.ShowDialog),
  Command.resolve(Dialog.ShowDialog, Dialog.Message.CompletedShowDialog()),
]

describe('gallery: settings dialog', () => {
  it('shows a Settings button in the header', () => {
    scene(config, given(initialModel()), expect(text('Settings')).toExist())
  })

  it('opens on Settings and shows the Experimental section', () => {
    scene(
      config,
      given(initialModel()),
      click(selector('[data-open-settings]')),
      ...openDialog,
      expect(text('SETTINGS')).toExist(),
      expect(text('Experimental')).toExist(),
      expect(text('Infinite canvas')).toExist(),
      // Off by default: the track is unfilled and aria-checked is false.
      expect(selector('[role="switch"]')).toHaveAttr('aria-checked', 'false'),
      Command.expectNone(),
    )
  })

  it('toggles the infinite-canvas switch — visual state flips, nothing else', () => {
    scene(
      config,
      given(initialModel()),
      click(selector('[data-open-settings]')),
      ...openDialog,

      click(selector('[role="switch"]')),
      expect(selector('[role="switch"]')).toHaveAttr('aria-checked', 'true'),
      expect(selector('[role="switch"]')).toHaveClass('bg-accent'),
      // Clicking the label toggles too.
      click(text('Infinite canvas')),
      expect(selector('[role="switch"]')).toHaveAttr('aria-checked', 'false'),
      Command.expectNone(),
    )
  })

  it('closes via the Close button', () => {
    scene(
      config,
      given(initialModel()),
      click(selector('[data-open-settings]')),
      ...openDialog,
      expect(text('SETTINGS')).toExist(),

      click(text('Close')),
      Command.expectHas(Dialog.CloseDialog),
      Command.resolve(Dialog.CloseDialog, Dialog.Message.CompletedCloseDialog()),
      expect(text('SETTINGS')).not.toExist(),
      Command.expectNone(),
    )
  })

  it('the toggle updates only the experimental flag in the model', () => {
    const [model] = update(
      initialModel(),
      GalleryMessage.ToggledInfiniteCanvas({ isEnabled: true }),
    )
    vitestExpect(model.experimental.infiniteCanvas).toBe(true)

    const [back, commands, out] = update(
      model,
      GalleryMessage.ToggledInfiniteCanvas({ isEnabled: false }),
    )
    vitestExpect(back.experimental.infiniteCanvas).toBe(false)
    vitestExpect(commands).toEqual([])
    vitestExpect(Option.isNone(out)).toBe(true)
  })

  it('SettingsRequested opens the dialog submodel', () => {
    const [model, commands] = update(initialModel(), GalleryMessage.SettingsRequested())
    vitestExpect(model.settingsDialog.isOpen).toBe(true)
    vitestExpect(commands.map((c) => c.name)).toEqual(['ShowDialog'])
  })

  it('delegates dialog messages to Dialog.update', () => {
    const [opened] = update(initialModel(), GalleryMessage.SettingsRequested())
    const [closed] = update(
      opened,
      GalleryMessage.GotSettingsDialogMessage({ message: Dialog.Message.RequestedClose() }),
    )
    vitestExpect(closed.settingsDialog.isOpen).toBe(false)
  })
})
