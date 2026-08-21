import { describe, it, expect } from 'vitest'
import { Option } from 'effect'
import { AsyncData } from 'foldkit'
import {
  Command,
  click,
  expect as sceneExpect,
  given,
  role,
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
import type { Model } from './model'
import { update } from './update'
import { view } from './view'
import { NavigateMenu, SaveCollage } from './command'
import {
  BackRequested,
  ChangedColumns,
  ChangedGutter,
  CollageLoaded,
  CollageMissing,
  LoadFailed,
  MovedTile,
  NavigatedBack,
  RemovedTile,
  SaveFailed,
  ToggledBackground,
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

const collageWith = (
  tiles: readonly number[],
  layout?: Partial<{ columns: number; gutter: number; background: 'dark' | 'light' }>,
): CollageRecord =>
  Collage.make({
    id,
    savedAt: 1_700_000_000_000,
    layout: { ...defaultCollageLayout(), ...layout },
    tiles: tiles.map((n) => ({ editId: tileEditId(n) })),
  })

const loadedWith = (...args: Parameters<typeof collageWith>): Model => {
  const [model] = update(initialModel(), CollageLoaded({ collage: collageWith(...args), thumbs: [], dropped: 0 }))
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
      sceneExpect(role('button', { name: 'Remove photo 0' })).toExist(),
      sceneExpect(role('button', { name: 'Remove photo 2' })).toExist(),
      // Reading-order move buttons hide only at the array ends.
      sceneExpect(role('button', { name: 'Move photo 0 earlier' })).toBeAbsent(),
      sceneExpect(role('button', { name: 'Move photo 2 later' })).toBeAbsent(),
      sceneExpect(role('button', { name: 'Move photo 1 later' })).toExist(),
    )
  })

  it('CollageLoaded fills the AsyncData; a clean load shows no notice and saves nothing', () => {
    const [model, commands, out] = update(
      initialModel(),
      CollageLoaded({ collage: collageWith([1]), thumbs: [], dropped: 0 }),
    )
    expect(model.collage._tag).toBe('Success')
    expect(model.notice).toBe(null)
    expect(commands).toEqual([])
    expect(Option.isNone(out)).toBe(true)
  })

  it('dropped dangling references surface a notice', () => {
    const [model] = update(
      initialModel(),
      CollageLoaded({ collage: collageWith([1]), thumbs: [], dropped: 2 }),
    )
    expect(model.notice).toBe('2 photos removed — their edits were deleted')
  })

  it('one dropped reference reads in the singular', () => {
    const [model] = update(
      initialModel(),
      CollageLoaded({ collage: collageWith([1]), thumbs: [], dropped: 1 }),
    )
    expect(model.notice).toBe('1 photo removed — their edits were deleted')
  })

  it('LoadFailed lands in the failure state', () => {
    const [model] = update(
      initialModel(),
      LoadFailed({ error: new StoreError({ message: 'quota' }) }),
    )
    expect(model.collage._tag).toBe('Failure')
  })

  it('CollageMissing lands in the failure state', () => {
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
})

describe('collage submodel: arrangement auto-saves', () => {
  it('ChangedColumns clamps to 2–6 and queues a save', () => {
    const loaded = loadedWith([1, 2, 3], { columns: 3 })
    const [high, highCommands] = update(loaded, ChangedColumns({ columns: 99 }))
    expect(collageOf(high).layout.columns).toBe(6)
    expect(highCommands.map((c) => c.name)).toEqual(['SaveCollage'])
    const [low] = update(loaded, ChangedColumns({ columns: 0 }))
    expect(collageOf(low).layout.columns).toBe(2)
  })

  it('ChangedGutter clamps to 0–32', () => {
    const loaded = loadedWith([1, 2, 3])
    const [high] = update(loaded, ChangedGutter({ gutter: 100 }))
    const [low] = update(loaded, ChangedGutter({ gutter: -5 }))
    expect(collageOf(high).layout.gutter).toBe(32)
    expect(collageOf(low).layout.gutter).toBe(0)
  })

  it('ToggledBackground flips dark ↔ light', () => {
    const loaded = loadedWith([1, 2, 3], { background: 'dark' })
    const [flipped] = update(loaded, ToggledBackground())
    expect(collageOf(flipped).layout.background).toBe('light')
    const [back] = update(flipped, ToggledBackground())
    expect(collageOf(back).layout.background).toBe('dark')
  })

  it('RemovedTile drops by index and queues a save', () => {
    const loaded = loadedWith([7, 8, 9])
    const [model, commands] = update(loaded, RemovedTile({ index: 1 }))
    expect(collageOf(model).tiles.map((t) => t.editId)).toEqual([tileEditId(7), tileEditId(9)])
    expect(commands.map((c) => c.name)).toEqual(['SaveCollage'])
  })

  it('MovedTile splices reading order and queues a save', () => {
    const loaded = loadedWith([7, 8, 9])
    const [model, commands] = update(loaded, MovedTile({ from: 2, to: 0 }))
    expect(collageOf(model).tiles.map((t) => t.editId)).toEqual([
      tileEditId(9),
      tileEditId(7),
      tileEditId(8),
    ])
    expect(commands.map((c) => c.name)).toEqual(['SaveCollage'])
  })

  it('arrangement messages with nothing loaded are ignored — no edge, no save', () => {
    for (const message of [
      ChangedColumns({ columns: 5 }),
      ChangedGutter({ gutter: 16 }),
      ToggledBackground(),
      RemovedTile({ index: 0 }),
      MovedTile({ from: 0, to: 1 }),
    ]) {
      const [model, commands] = update(initialModel(), message)
      expect(model).toEqual(initialModel())
      expect(commands).toEqual([])
    }
  })

  it('a failed auto-save surfaces a notice instead of losing the change silently', () => {
    const loaded = loadedWith([1, 2, 3])
    const [model] = update(loaded, SaveFailed({ error: new StoreError({ message: 'quota' }) }))
    expect(model.notice).toBe('Could not save the collage: quota')
  })

  it('the mutated record rides the SaveCollage command', () => {
    const loaded = loadedWith([1, 2, 3], { gutter: 8 })
    const [, commands] = update(loaded, ChangedGutter({ gutter: 16 }))
    expect(commands.map((c) => c.name)).toEqual(['SaveCollage'])
  })
})
