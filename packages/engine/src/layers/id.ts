import type { LayerId } from "./schemas"

let counter = 0

/** Create a new unique LayerId. */
export const nextLayerId = (): LayerId => `layer-${++counter}` as LayerId

/** Reset the counter (test-only). */
export function _resetLayerCounter(): void {
  counter = 0
}
