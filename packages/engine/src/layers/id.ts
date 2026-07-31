import { Schema } from "effect"
import { LayerId } from "./schemas"

let counter = 0

/** Create a new unique LayerId. */
export const nextLayerId = (): LayerId =>
  Schema.decodeSync(LayerId)(`layer-${++counter}`)

/** Reset the counter (test-only). */
export function _resetLayerCounter(): void {
  counter = 0
}
