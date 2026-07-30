import { nextLayerId } from "./id"
import type { LayerRegistry, LayerEntry } from "./registry"
import type { Layer, LayerType } from "./schemas"

/**
 * Create a new layer of the given type with all fields set to their
 * defaults as defined in the registry.
 */
export function createLayer<K extends LayerType>(
  type: K,
  registry: Record<string, LayerEntry>,
): Layer {
  const entry = registry[type]
  if (!entry) {
    throw new Error(`Unknown layer type: ${type}`)
  }

  const fields: Record<string, number> = {}
  for (const key of Object.keys(entry.fields)) {
    const meta = entry.fields[key]
    if (meta) {
      fields[key] = meta.default
    }
  }

  return {
    id: nextLayerId(),
    visible: true,
    type,
    ...fields,
  } as unknown as Layer
}
