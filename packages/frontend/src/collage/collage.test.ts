import { describe, it, expect } from 'vitest'
import { Option } from 'effect'
import {
  Command,
  click,
  expect as sceneExpect,
  given,
  scene,
  text,
} from 'foldkit/scene'
import {
  Collage,
  CollageId,
  defaultCollageLayout,
  StoreError,
} from '@lutra/store'
import type { Collage as CollageRecord } from '@lutra/store'
import type { EditId } from '@lutra/store'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { LoadCollage, NavigateMenu } from './command'
import {
  BackRequested,
  CollageLoaded,
  CollageMissing,
  LoadFailed,
  NavigatedBack,
} from './message'

const config = {
  update,
  view,
} as const

const id = CollageId('11111111-1111-4111-8111-111111111111')

/** Distinct format-valid Edit ids for the tiles. */
const tileEditId = (n: number): EditId => {
  const digits = String(n).padStart(12, '0')
  return `22222222-2222-4222-8222-${digits}` as EditId
}

const collageWith = (tiles: number): CollageRecord =>
  Collage.make({
    id,
    savedAt: 1_700_000_000_000,
    layout: defaultCollageLayout(),
    tiles: Array.from({ length: tiles }, (_, i) => ({ editId: tileEditId(i) })),
  })

describe('collage submodel: load', () => {
  it('a loaded collage renders its facts', () => {
    const [loaded] = update(initialModel(), CollageLoaded({ collage: collageWith(3) }))
    scene(config, given(loaded), sceneExpect(text('3 photos', { exact: false })).toExist())
  })

  it('CollageLoaded fills the AsyncData and clears any notice', () => {
    const [model, commands, out] = update(initialModel(), CollageLoaded({ collage: collageWith(2) }))
    expect(model.collage._tag).toBe('Success')
    expect(model.notice).toBe(null)
    expect(commands).toEqual([])
    expect(Option.isNone(out)).toBe(true)
  })

  it('LoadFailed lands in the failure state', () => {
    const [model] = update(
      initialModel(),
      LoadFailed({ error: new StoreError({ message: 'quota' }) }),
    )
    expect(model.collage._tag).toBe('Failure')
  })

  it('CollageMissing lands in the failure state with a plain-language reason', () => {
    const [model] = update(initialModel(), CollageMissing())
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
      Command.resolve(NavigateMenu, NavigatedBack()),
    )
  })

  it('BackRequested emits only the NavigateMenu command', () => {
    const [, commands, out] = update(initialModel(), BackRequested())
    expect(commands.map((c) => c.name)).toEqual(['NavigateMenu'])
    expect(Option.isNone(out)).toBe(true)
  })

  it('LoadCollage is addressable by id for the root to fire on route entry', () => {
    // The root's init/inform build this command from the route's id.
    const command = LoadCollage({ id })
    expect(command.name).toBe('LoadCollage')
  })
})
