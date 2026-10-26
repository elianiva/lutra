import { describe, it as vitestIt, expect as vitestExpect } from 'vitest'
import { it } from '@effect/vitest'
import { Command, Mount, expect, given, role, scene } from 'foldkit/scene'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { createLayerFor } from './command'
import { EditorMessage } from './message'
import { PanZoom, RegisterCanvas } from './canvas-stage'
import type { Model } from './model'

import { Arbitrary, Effect, Schema } from 'effect'
import { MockImageBitmap } from '../vitest-setup'
import { Idle } from './phase'

const layer = (type: Parameters<typeof createLayerFor>[0]) => Effect.runSync(createLayerFor(type))

const modelWith = (types: Parameters<typeof createLayerFor>[0][]) => {
  const chain = types.map(layer)
  return {
    ...initialModel(),
    chain,
    phase: Idle(),
    source: { bitmap: new MockImageBitmap(200, 150), error: null, height: 150, width: 200 },
  }
}

/** Select one layer so the inspector shows its position controls. */
const withSelected = (model: Model, index: number): Model => {
  const target = model.chain[index]
  if (target === undefined) {
    throw new Error('fixture: expected a layer at that index')
  }
  return update(model, EditorMessage.SelectedLayer({ id: target.id })).model
}

const config = { update, view } as const

const stageMounts = [
  Mount.resolve(PanZoom, EditorMessage.ScaledCanvas({ offsetX: 0, offsetY: 0, scale: 1 })),
  Mount.resolve(RegisterCanvas, EditorMessage.CanvasRegistered()),
]

const ids = (model: Model) => model.chain.map((l) => l.id)

/**
 * The inspector's position row is the only reorder surface now (the dock
 * selects, the inspector moves). "Move up" means earlier in the chain —
 * toward index 0 — because that is what the dock shows left to right.
 */
describe('layer reorder controls', () => {
  vitestIt('the first layer cannot move earlier; the last cannot move later', () => {
    const model = modelWith(['exposure', 'contrast', 'saturation'])
    scene(
      config,
      given(withSelected(model, 0)),
      ...stageMounts,
      expect(role('button', { name: 'Move up' })).toBeDisabled(),
      expect(role('button', { name: 'Move down' })).toBeEnabled(),
      Command.expectNone(),
    )
    scene(
      config,
      given(withSelected(model, 2)),
      ...stageMounts,
      expect(role('button', { name: 'Move up' })).toBeEnabled(),
      expect(role('button', { name: 'Move down' })).toBeDisabled(),
      Command.expectNone(),
    )
  })

  vitestIt('Move up and Move down swap the layer with its neighbour', () => {
    const model = modelWith(['exposure', 'contrast', 'saturation'])
    const order = ids(model)
    const earlier = update(
      withSelected(model, 1),
      EditorMessage.ReorderedLayer({ from: 1, to: 0 }),
    ).model
    vitestExpect(ids(earlier)).toEqual([order[1], order[0], order[2]])
    const later = update(
      withSelected(model, 1),
      EditorMessage.ReorderedLayer({ from: 1, to: 2 }),
    ).model
    vitestExpect(ids(later)).toEqual([order[0], order[2], order[1]])
  })
})

// Property tests derive their inputs from Effect Schemas and generate through
// Effect's `Arbitrary` (docs/adr/0012-property-testing).

const LayerType = Schema.Literals([
  'exposure',
  'contrast',
  'saturation',
  'vignette',
  'grain',
  'clarity',
])
const Move = Schema.Struct({
  dir: Schema.Literals(['up', 'down']),
  index: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 })),
})

describe('layer reorder semantics (property-based)', () => {
  it.prop(
    'any sequence of adjacent moves keeps the chain a permutation and swaps only neighbours',
    {
      types: Arbitrary.array(Arbitrary.schema(LayerType), { maxLength: 6, minLength: 1 }),
      moves: Arbitrary.array(Arbitrary.schema(Move), { maxLength: 12, minLength: 0 }),
    },
    ({ types, moves }) => {
      let model: Model = modelWith(types)
      const original = ids(model)

      for (const move of moves) {
        const chain = ids(model)
        const target = move.index
        if (target < 0 || target >= chain.length) {
          continue
        }
        const to = move.dir === 'up' ? target - 1 : target + 1
        // The buttons are disabled at the ends, so such a click never lands.
        if (to < 0 || to >= chain.length) {
          continue
        }

        const before = [...chain]
        model = update(model, EditorMessage.ReorderedLayer({ from: target, to })).model
        const after = ids(model)

        // Adjacent swap, everything else untouched.
        vitestExpect(after[to]).toBe(before[target])
        vitestExpect(after[target]).toBe(before[to])
        vitestExpect(after.filter((_, i) => i !== to && i !== target)).toEqual(
          before.filter((_, i) => i !== to && i !== target),
        )
        // Always a permutation of the original layers.
        vitestExpect([...after].sort()).toEqual([...original].sort())
        vitestExpect(new Set(after).size).toBe(after.length)
      }
    },
  )
})
