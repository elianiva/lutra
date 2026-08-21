import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { moveTile, removeTile } from './tiles'

describe('collage tiles: array operations', () => {
  it('moveTile preserves the multiset of elements for any indices', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { maxLength: 12, minLength: 1 }),
        fc.nat(),
        fc.nat(),
        (tiles, fromRaw, toRaw) => {
          const from = fromRaw % tiles.length
          const to = toRaw % tiles.length
          const moved = moveTile(tiles, from, to)
          expect(moved).toHaveLength(tiles.length)
          expect([...moved].sort()).toEqual([...tiles].sort())
        },
      ),
    )
  })

  it('moveTile places the source element exactly at the target index', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { maxLength: 12, minLength: 2 }),
        fc.nat(),
        fc.nat(),
        (tiles, fromRaw, toRaw) => {
          const from = fromRaw % tiles.length
          const to = toRaw % tiles.length
          const moved = [...moveTile(tiles, from, to)]
          expect(moved[to]).toBe(tiles[from])
        },
      ),
    )
  })

  it('a move followed by its inverse restores the original order', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { maxLength: 12, minLength: 1 }),
        fc.nat(),
        fc.nat(),
        (tiles, fromRaw, toRaw) => {
          const from = fromRaw % tiles.length
          const to = toRaw % tiles.length
          expect([...moveTile(moveTile(tiles, from, to), to, from)]).toEqual(tiles)
        },
      ),
    )
  })

  it('no-op and out-of-range moves return the array unchanged', () => {
    const tiles = ['a', 'b', 'c']
    expect(moveTile(tiles, 1, 1)).toEqual(tiles)
    expect(moveTile(tiles, -1, 0)).toEqual(tiles)
    expect(moveTile(tiles, 0, -1)).toEqual(tiles)
    expect(moveTile(tiles, 3, 0)).toEqual(tiles)
    expect(moveTile(tiles, 0, 3)).toEqual(tiles)
  })

  it('removeTile drops exactly the indexed element', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { maxLength: 12, minLength: 1 }), fc.nat(), (tiles, raw) => {
        const index = raw % tiles.length
        const removed = removeTile(tiles, index)
        expect(removed).toHaveLength(tiles.length - 1)
        expect(removed).toEqual([...tiles.slice(0, index), ...tiles.slice(index + 1)])
      }),
    )
  })

  it('removeTile out of range returns the array unchanged', () => {
    const tiles = ['a', 'b']
    expect(removeTile(tiles, 2)).toEqual(tiles)
    expect(removeTile(tiles, -1)).toEqual(tiles)
  })
})
