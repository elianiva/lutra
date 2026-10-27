import { describe, expect, it } from 'vitest'
import { Message } from './message'
import { initialModel } from './model'
import type { Item, Model, Result } from './model'
import { update } from './update'

const file = (name: string) => new File([new Uint8Array(4)], name, { type: 'image/jpeg' })

const result: Result = {
  blob: new Blob([new Uint8Array(2)]),
  url: 'blob:out',
  width: 1080,
  height: 810,
  sourceWidth: 4000,
  sourceHeight: 3000,
  extension: 'jpg',
}

const withItems = (items: ReadonlyArray<Item>): Model => ({ ...initialModel('light'), items })

const done: Item = {
  id: 1,
  file: file('a.jpg'),
  sourceUrl: 'blob:a',
  status: { _tag: 'Done', result, stale: false },
}
const failed: Item = {
  id: 2,
  file: file('b.jpg'),
  sourceUrl: 'blob:b',
  status: { _tag: 'Failed', error: 'x' },
}

describe('batch processing', () => {
  it('marks finished outputs stale when a setting changes, and reprocesses only those', () => {
    const model = withItems([done, failed])
    const { model: changed } = update(
      model,
      Message.ChangedSettings({ settings: { ...model.settings, format: 'webp' } }),
    )
    expect(changed.items.map((item) => item.status)).toEqual([
      { _tag: 'Done', result, stale: true },
      failed.status,
    ])

    const { model: next, commands = [] } = update(changed, Message.ReprocessRequested())
    expect(next.items.map((item) => item.status._tag)).toEqual(['Working', 'Failed'])
    expect(commands.map((command) => command.args)).toEqual([
      { id: 1, file: done.file, settings: { ...model.settings, format: 'webp' } },
    ])
  })

  it('retries failures when nothing is stale', () => {
    const { commands = [] } = update(withItems([done, failed]), Message.ReprocessRequested())
    expect(commands.map((command) => command.args?.['id'])).toEqual([2])
  })

  it('frees an output that lands after its item was cleared', () => {
    const { model, commands = [] } = update(withItems([]), Message.Processed({ id: 9, result }))
    expect(model.items).toEqual([])
    expect(commands.map((command) => command.name)).toEqual(['RevokeUrls'])
  })
})

describe('collage', () => {
  it('grows the grid to fit dropped photos and keeps the ones already placed', () => {
    const slot = (key: number) => ({
      key,
      file: file(`${key}.jpg`),
      url: `blob:${key}`,
      width: 400,
      height: 300,
      adjust: { zoom: 1, fx: 0.5, fy: 0.5 },
    })
    const start = initialModel('light')
    const seeded = { ...start, collage: { ...start.collage, slots: [null, slot(0), null, null] } }
    const { model } = update(
      seeded,
      Message.SlotsPrepared({ slots: [1, 2, 3, 4].map(slot), failed: 0 }),
    )
    expect(model.collage).toMatchObject({ rows: 2, cols: 3, presetId: '6-grid' })
    expect(model.collage.slots.map((current) => current?.key ?? null)).toEqual([
      0,
      1,
      2,
      3,
      4,
      null,
    ])
  })
})
