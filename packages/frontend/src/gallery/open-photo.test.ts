import { describe, it, expect } from 'vitest'
import { Option } from 'effect'
import {
  Command,
  click,
  expect as sceneExpect,
  expectNoOutMessage,
  expectOutMessage,
  given,
  scene,
  text,
} from 'foldkit/scene'
import { EditId } from '@lutra/store'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { OpenPhoto } from './command'
import {
  OpenPhotoRequested,
  PhotoCreated,
  PhotoPickCancelled,
  PhotoCreateFailed,
  OpenedEdit,
} from './message'

const config = {
  update,
  view,
} as const

const id = EditId('11111111-1111-4111-8111-111111111111')

describe('gallery: open a photo (new edit)', () => {
  it('shows an Open photo button in the header', () => {
    scene(
      config,
      given(initialModel()),
      sceneExpect(text('Open photo')).toExist(),
    )
  })

  it('dispatches OpenPhoto when the button is clicked', () => {
    scene(
      config,
      given(initialModel()),
      click(text('Open photo')),
      Command.expectHas(OpenPhoto),
      // The native file picker can't run in the harness — resolve the
      // command as a dismissed picker so the scene ends cleanly.
      Command.resolve(OpenPhoto, PhotoPickCancelled()),
      expectNoOutMessage(),
    )
  })

  it('a cancelled picker is a no-op: no commands, no OutMessage', () => {
    const [model, commands, out] = update(initialModel(), PhotoPickCancelled())
    expect(model).toEqual(initialModel())
    expect(commands).toEqual([])
    expect(Option.isNone(out)).toBe(true)
  })

  it('a created Edit surfaces as the OpenedEdit OutMessage for the root', () => {
    scene(
      config,
      given(initialModel()),
      click(text('Open photo')),
      Command.resolve(OpenPhoto, PhotoCreated({ id })),
      expectOutMessage(OpenedEdit({ id })),
    )
  })

  it('a failed create sets the notice banner instead of losing the photo silently', () => {
    const [model, commands, out] = update(initialModel(), PhotoCreateFailed({ error: 'quota' }))
    expect(model.notice).toBe('Could not open photo: quota')
    expect(commands).toEqual([])
    expect(Option.isNone(out)).toBe(true)
  })

  it('OpenPhotoRequested dispatches the OpenPhoto command', () => {
    const [, commands] = update(initialModel(), OpenPhotoRequested())
    expect(commands.map((c) => c.name)).toEqual(['OpenPhoto'])
  })
})
