import { LayerId } from "../brands"

let counter = 0

/** Create a new unique LayerId. */
export const nextLayerId = (): LayerId => LayerId(`layer-${++counter}`)

/** Reset the counter (test-only). */
export function _resetLayerCounter(): void {
  counter = 0
}
