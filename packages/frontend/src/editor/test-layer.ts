import { Effect } from 'effect'
import type { LayerType } from '@lutra/engine'
import { createLayerFor } from './command'
import { EditorMessage } from './message'
import type { Model } from './model'
import { update } from './update'
import type { UpdateReturn } from './update'

/** Run the layer factory at a test boundary where a concrete fixture is needed. */
export const createTestLayer = <K extends LayerType>(type: K) =>
  Effect.runSync(createLayerFor(type))

/**
 * Resolve the CreateLayer command emitted by update so unit tests can inspect
 * the post-command model without pretending the factory is synchronous in
 * production.
 */
export const selectTool = (model: Model, type: LayerType): UpdateReturn => {
  const [creating, commands, out] = update(model, EditorMessage.SelectedTool({ type }))
  if (!commands.some((command) => command.name === 'CreateLayer')) {
    return [creating, commands, out]
  }
  return update(creating, EditorMessage.LayerCreated({ layer: createTestLayer(type) }))
}
