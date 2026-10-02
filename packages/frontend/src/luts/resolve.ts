import { Effect } from 'effect'
import type { Layer, LutCube, LutId, LutParseError } from '@lutra/engine'
import type { LutLoadError } from './store'
import { LutStore } from './store'

/**
 * Resolve every LUT layer's cube through the LUT store, handing the
 * id→cube map to a render request (the engine bakes sizes into the shader
 * and the GPU backend uploads textures from it) — one convention for cube
 * resolution.
 */
export const resolveLuts = (
  layers: readonly Layer[],
): Effect.Effect<ReadonlyMap<LutId, LutCube>, LutLoadError | LutParseError, LutStore> =>
  Effect.gen(function* resolveLuts() {
    const store = yield* LutStore
    const luts = new Map<LutId, LutCube>()
    for (const layer of layers) {
      if (layer.type !== 'lut') {
        continue
      }
      if (luts.has(layer.lutId)) {
        continue
      }
      const cube = yield* store.getCube(layer.lutId)
      luts.set(layer.lutId, cube)
    }
    return luts
  })
