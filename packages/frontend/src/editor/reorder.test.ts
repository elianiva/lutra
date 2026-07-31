import { describe, it, expect as vitestExpect } from 'vitest'
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
