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
import { EditId, EditSummary, StoreError } from '@lutra/store'
import type { EditSummary as EditSummaryRecord } from '@lutra/store'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { OpenPhoto } from './command'
import { GalleryMessage, GalleryOutMessage, PhotoCreateError } from './message'
import { ImageDecodeError } from '../errors'

const config = {
  update,
  view,
} as const

const id = EditId('11111111-1111-4111-8111-111111111111')

describe('gallery: open a photo (new edit)', () => {
  it('shows an Open photo button in the header', () => {
    scene(config, given(initialModel()), sceneExpect(text('Open photo')).toExist())
  })

  it('dispatches OpenPhoto when the button is clicked', () => {
    scene(
      config,
      given(initialModel()),
      click(text('Open photo')),
      Command.expectHas(OpenPhoto),
      // The native file picker can't run in the harness — resolve the
      // command as a dismissed picker so the scene ends cleanly.
      Command.resolve(OpenPhoto, GalleryMessage.PhotoPickCancelled()),
      expectNoOutMessage(),
    )
  })

  it('a cancelled picker is a no-op: no commands, no OutMessage', () => {
    const {
      model,
      commands = [],
      outMessage: out,
    } = update(initialModel(), GalleryMessage.PhotoPickCancelled())
    expect(model).toEqual(initialModel())
    expect(commands).toEqual([])
    expect(out).toBeUndefined()
  })

  it('a created Edit surfaces as the OpenedEdit OutMessage for the root', () => {
    scene(
      config,
      given(initialModel()),
      click(text('Open photo')),
      Command.resolve(OpenPhoto, GalleryMessage.PhotoCreated({ id })),
      expectOutMessage(GalleryOutMessage.OpenedEdit({ id })),
    )
  })

  it('a failed create sets the notice banner instead of losing the photo silently', () => {
    const {
      model,
      commands = [],
      outMessage: out,
    } = update(
      initialModel(),
      GalleryMessage.PhotoCreateFailed({ error: new StoreError({ message: 'quota' }) }),
    )
    expect(model.notice).toBe('Could not open photo: quota')
    expect(commands).toEqual([])
    expect(out).toBeUndefined()
  })

  it('OpenPhotoRequested dispatches the OpenPhoto command', () => {
    const { commands = [] } = update(initialModel(), GalleryMessage.OpenPhotoRequested())
    expect(commands.map((c) => c.name)).toEqual(['OpenPhoto'])
  })
})

const summary = (id: EditId): EditSummaryRecord =>
  EditSummary.make({
    byteLength: 10,
    chain: [],
    id,
    savedAt: 1_700_000_000_000,
    thumbnail: new Uint8Array([1]),
  })

const otherId = EditId('22222222-2222-4222-8222-222222222222')

const added = (
  overrides: {
    added?: number
    failed?: number
    error?: Option.Option<typeof PhotoCreateError.Type>
    summaries?: Option.Option<readonly EditSummaryRecord[]>
  } = {},
) =>
  GalleryMessage.PhotosAdded({
    added: 0,
    failed: 0,
    error: Option.none(),
    summaries: Option.some([]),
    ...overrides,
  })

describe('gallery: opening several photos at once', () => {
  // The native file picker can't run in the harness — resolve the command
  // manually, exactly like the single-pick scenes above.
  it('a batch stays on the gallery: nobody navigates', () => {
    scene(
      config,
      given(initialModel()),
      click(text('Open photo')),
      Command.resolve(
        OpenPhoto,
        added({
          added: 2,
          summaries: Option.some([summary(id), summary(otherId)]),
        }),
      ),
      expectNoOutMessage(),
    )
  })

  it('a batch refreshes the grid in place and reports nothing when all landed', () => {
    const {
      model,
      commands = [],
      outMessage: out,
    } = update(
      initialModel(),
      added({ added: 2, summaries: Option.some([summary(id), summary(otherId)]) }),
    )
    expect(model.grid._tag).toBe('Success')
    if (model.grid._tag === 'Success') {
      expect(model.grid.data.map((s) => s.id)).toEqual([id, otherId])
    }
    expect(model.notice).toBe(null)
    expect(commands).toEqual([])
    expect(out).toBeUndefined()
  })

  it('a partial failure reports what landed and what did not', () => {
    const { model } = update(
      initialModel(),
      added({
        added: 2,
        failed: 1,
        error: Option.some(new ImageDecodeError({ message: 'decode failed' })),
        summaries: Option.some([summary(id), summary(otherId)]),
      }),
    )
    expect(model.notice).toBe('Added 2 photos, 1 could not be opened: decode failed')
    // The successful picks still show up.
    if (model.grid._tag === 'Success') {
      expect(model.grid.data.map((s) => s.id)).toEqual([id, otherId])
    }
  })

  it('a fully failed batch reads like the single-pick failure', () => {
    const { model } = update(
      initialModel(),
      added({
        failed: 3,
        error: Option.some(new StoreError({ message: 'quota' })),
        summaries: Option.some([]),
      }),
    )
    expect(model.notice).toBe('Could not open photo: quota')
  })

  it('a failed post-save listing keeps the current grid but still reports', () => {
    const { model } = update(
      initialModel(),
      added({ added: 1, failed: 1, error: Option.none(), summaries: Option.none() }),
    )
    expect(model.grid._tag).toBe('Idle')
    expect(model.notice).toContain('could not be opened')
  })
})
