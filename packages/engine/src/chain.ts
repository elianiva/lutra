import type { Layer, LayerPatch, LayerType } from "./layers/schemas"
import type { LayerId } from "./brands"
import type { LayerRegistry } from "./layers/registry"
import { createLayer } from "./layers/defaults"

// ---- operations ----

function findIndex(chain: ReadonlyArray<Layer>, id: LayerId): number {
  return chain.findIndex((l) => l.id === id)
}

export function addLayer(
  chain: ReadonlyArray<Layer>,
  type: LayerType,
  registry: LayerRegistry,
): Layer[] {
  return [...chain, createLayer(type, registry)]
}

export function removeLayer(
  chain: ReadonlyArray<Layer>,
  id: LayerId,
): Layer[] {
  const idx = findIndex(chain, id)
  if (idx === -1) return [...chain]
  return [...chain.slice(0, idx), ...chain.slice(idx + 1)]
}

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

export function updateLayerParam(
  chain: ReadonlyArray<Layer>,
  patch: LayerPatch,
): Layer[] {
  const idx = chain.findIndex((l) => l.type === patch.type)
  if (idx === -1) return [...chain]

  const layer = chain[idx]!
  const result = [...chain]
  const updated: Layer = { ...layer, ...patch.patch }
  result[idx] = updated
  return result
}

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

export function replaceChain(_chain: ReadonlyArray<Layer>, layers: Layer[]): Layer[] {
  return [...layers]
}
