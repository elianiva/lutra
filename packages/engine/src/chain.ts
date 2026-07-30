import { Data } from "effect"
import type { Layer, LayerPatch, LayerType } from "./layers/schemas"
import type { LayerId } from "./layers/schemas"
import type { LayerRegistry } from "./layers/registry"
import { createLayer } from "./layers/defaults"

// ---- errors ----

export class LayerNotFoundError extends Data.TaggedError("LayerNotFoundError")<{
  layerId: LayerId
}> {}

export class InvalidPositionError extends Data.TaggedError("InvalidPositionError")<{
  index: number
  chainLength: number
}> {}

export type ChainError = LayerNotFoundError | InvalidPositionError

// ---- operations ----

/** Find a layer by id. Returns the index or -1. */
function findIndex(chain: ReadonlyArray<Layer>, id: LayerId): number {
  return chain.findIndex((l) => l.id === id)
}

/** Append a new layer of the given type at the end of the chain. */
export function addLayer(
  chain: ReadonlyArray<Layer>,
  type: LayerType,
  registry: LayerRegistry,
): Layer[] {
  return [...chain, createLayer(type, registry)]
}

/** Remove a layer by id. Returns the chain unchanged if not found. */
export function removeLayer(
  chain: ReadonlyArray<Layer>,
  id: LayerId,
): Layer[] {
  const idx = findIndex(chain, id)
  if (idx === -1) return [...chain]
  return [...chain.slice(0, idx), ...chain.slice(idx + 1)]
}

/** Move a layer from one position to another. */
export function reorderLayer(
  chain: ReadonlyArray<Layer>,
  id: LayerId,
  newIndex: number,
): Layer[] {
  const idx = findIndex(chain, id)
  if (idx === -1) return [...chain]
  if (newIndex < 0 || newIndex >= chain.length) return [...chain]

  const result = [...chain]
  const [moved] = result.splice(idx, 1)
  result.splice(newIndex, 0, moved!)
  return result
}

/** Update one or more parameters on a layer. */
export function updateLayerParam(
  chain: ReadonlyArray<Layer>,
  patch: LayerPatch,
): Layer[] {
  const idx = chain.findIndex((l) => l.type === patch.type)
  if (idx === -1) return [...chain]

  const layer = chain[idx]!
  const result = [...chain]
  result[idx] = { ...layer, ...patch.patch } as Layer
  return result
}

/** Toggle the visibility of a layer by id. */
export function toggleLayerVisibility(
  chain: ReadonlyArray<Layer>,
  id: LayerId,
): Layer[] {
  const idx = findIndex(chain, id)
  if (idx === -1) return [...chain]

  const result = [...chain]
  const layer = result[idx]!
  result[idx] = { ...layer, visible: !layer.visible }
  return result
}

/** Replace the entire chain. */
export function replaceChain(_chain: ReadonlyArray<Layer>, layers: Layer[]): Layer[] {
  return [...layers]
}
