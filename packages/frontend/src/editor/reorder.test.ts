import { describe, it, expect as vitestExpect } from 'vitest'
import * as fc from 'fast-check'
import {
  Command,
  click,
  expect,
  given,
  scene,
  tap,
  all,
  role,
  nth,
  attr,
  findAll,
} from 'foldkit/scene'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { createLayerFor } from './command'
import { ReorderedLayer } from './message'
import type { Model } from './model'

import { Option } from 'effect'
import type { Scene } from 'foldkit/test'

const layer = (type: Parameters<typeof createLayerFor>[0]) => createLayerFor(type)

const modelWith = (types: Parameters<typeof createLayerFor>[0][]) => {
  const chain = types.map(layer)
  return {
    ...initialModel(),
    chain,
  }
}

const config = { update, view } as const

// The drawer renders the chain bottom-up (newest on top), so the first
// [data-layer-id] row in the DOM is chain[last].
const renderedOrder = (s: Scene.SceneSimulation<unknown, unknown, unknown>) =>
  findAll(s.html, '[data-layer-id]')
    .map((r) => attr(r, 'data-layer-id'))
    .map((o): string => o.pipe(Option.getOrElse(() => '')))

describe('layer reorder buttons', () => {
  it('shows Move up enabled only on rows below the top of the stack', () => {
    const model = modelWith(['exposure', 'contrast', 'saturation'])
    scene(
      config,
      given(model),
      // rendered: saturation (top), contrast, exposure (bottom)
      tap((s) => {
        vitestExpect(renderedOrder(s)).toEqual(model.chain.map((l) => l.id).reverse())
      }),
      expect(nth(all.role('button', { name: 'Move up' }), 0)).toBeDisabled(),
      expect(nth(all.role('button', { name: 'Move up' }), 1)).toBeEnabled(),
      expect(nth(all.role('button', { name: 'Move up' }), 2)).toBeEnabled(),
      expect(nth(all.role('button', { name: 'Move down' }), 0)).toBeEnabled(),
      expect(nth(all.role('button', { name: 'Move down' }), 1)).toBeEnabled(),
      expect(nth(all.role('button', { name: 'Move down' }), 2)).toBeDisabled(),
      Command.expectNone(),
    )
  })

  it('clicking Move up on the middle row moves it up', () => {
    const model = modelWith(['exposure', 'contrast', 'saturation'])
    const ids = model.chain.map((l) => l.id)
    scene(
      config,
      given(model),
      // "Move up" on the middle row (contrast)
      click(nth(all.role('button', { name: 'Move up' }), 1)),
      tap((s) => {
        // contrast moved to the top: contrast, saturation, exposure
        vitestExpect(renderedOrder(s)).toEqual([ids[1], ids[2], ids[0]])
      }),
      Command.expectNone(),
    )
  })

  it('clicking Move down on the middle row moves it down', () => {
    const model = modelWith(['exposure', 'contrast', 'saturation'])
    const ids = model.chain.map((l) => l.id)
    scene(
      config,
      given(model),
      // "Move down" on the middle row (contrast)
      click(nth(all.role('button', { name: 'Move down' }), 1)),
      tap((s) => {
        // contrast moved to the bottom: saturation, exposure, contrast
        vitestExpect(renderedOrder(s)).toEqual([ids[2], ids[0], ids[1]])
      }),
      Command.expectNone(),
    )
  })

  it('clicking Move down on the top row moves it down', () => {
    const model = modelWith(['exposure', 'contrast', 'saturation'])
    const ids = model.chain.map((l) => l.id)
    scene(
      config,
      given(model),
      // "Move down" on the top row (saturation)
      click(role('button', { name: 'Move down' })),
      tap((s) => {
        // saturation moved below contrast: contrast, saturation, exposure
        vitestExpect(renderedOrder(s)).toEqual([ids[1], ids[2], ids[0]])
      }),
      Command.expectNone(),
    )
  })

  it('clicking Move up on the bottom row moves it up', () => {
    const model = modelWith(['exposure', 'contrast', 'saturation'])
    const ids = model.chain.map((l) => l.id)
    scene(
      config,
      given(model),
      // "Move up" on the bottom row (exposure)
      click(nth(all.role('button', { name: 'Move up' }), 2)),
      tap((s) => {
        // exposure moved above contrast: saturation, exposure, contrast
        vitestExpect(renderedOrder(s)).toEqual([ids[2], ids[0], ids[1]])
      }),
      Command.expectNone(),
    )
  })
})

// ---- reorder semantics (property-based) ----

// The buttons dispatch ReorderedLayer({ from: chainIndex, to: chainIndex ± 1 })
// — "Move up" targets a higher chain index (the drawer renders bottom-up, so
// that is visually up), "Move down" a lower one. In rendered (top→bottom)
// order each click is an adjacent swap. This pins the splice semantics
// against a reference model for any chain and any click sequence.

const layerTypeArb = fc.constantFrom(
  'exposure',
  'contrast',
  'saturation',
  'vignette',
  'grain',
  'clarity',
)
const clickArb = fc.record({
  dir: fc.constantFrom('up' as const, 'down' as const),
  row: fc.nat({ max: 7 }),
})

describe('layer reorder semantics (property-based)', () => {
  it('any click sequence swaps adjacent rows and keeps the chain a permutation', () => {
    fc.assert(
      fc.property(
        fc.array(layerTypeArb, { maxLength: 6, minLength: 1 }),
        fc.array(clickArb, { maxLength: 12 }),
        (types, clicks) => {
          let model: Model = modelWith(types)
          const original = model.chain.map((l) => l.id)
          // The rendered order (top→bottom) the drawer shows: chain reversed.
          const rendered = [...original].reverse()

          for (const click of clicks) {
            const n = rendered.length
            // A click on a row that does not exist (the drawer has fewer rows
            // than the generated index) is not a dispatch at all.
            if (click.row < 0 || click.row >= n) {
              continue
            }
            const chainIndex = n - 1 - click.row
            // "Move up" needs a row above (rendered row > 0); "Move down" a
            // row below. The buttons are disabled otherwise, so the click never
            // dispatches.
            const legalUp = click.dir === 'up' && click.row > 0
            const legalDown = click.dir === 'down' && click.row < n - 1
            if (!legalUp && !legalDown) {
              continue
            }

            // Reference model: the adjacent swap in rendered order.
            const neighbor = click.dir === 'up' ? click.row - 1 : click.row + 1
            ;[rendered[click.row], rendered[neighbor]] = [rendered[neighbor]!, rendered[click.row]!]

            // The real update path.
            const to = click.dir === 'up' ? chainIndex + 1 : chainIndex - 1
            ;[model] = update(model, ReorderedLayer({ from: chainIndex, to }))

            vitestExpect(model.chain.map((l) => l.id).reverse()).toEqual(rendered)
            // The chain is always a permutation of the original layers.
            vitestExpect(model.chain.map((l) => l.id).sort()).toEqual([...original].sort())
            vitestExpect(new Set(model.chain.map((l) => l.id)).size).toBe(model.chain.length)
          }
        },
      ),
    )
  })
})
