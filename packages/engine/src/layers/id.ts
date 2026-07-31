import { LayerId } from "../brands"

/**
 * Create a new unique LayerId.
 *
 * UUID-based: ids are opaque handles (brands.ts — no format contract), and
 * uniqueness must not depend on shared module state. There is deliberately
 * no counter, no reset hook, and no ordering guarantee — two chains created
 * independently (tests, a second app instance, SSR) cannot collide.
 */
export const nextLayerId = (): LayerId => LayerId(crypto.randomUUID())
