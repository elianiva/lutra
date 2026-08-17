import { Effect, Schema } from 'effect'
import { nextLayerId } from './id'
import type { LayerEntry } from './registry'
import type { LayerType } from './schemas'

/**
 * A layer factory was asked for a type the registry does not define. The
 * registries are static and the UI only picks from `LAYER_TYPES`, so this
 * should be unreachable for normal callers. It remains a typed failure so
 * callers can compose layer creation without a synchronous exception.
 */
export class UnknownLayerTypeError extends Schema.TaggedErrorClass<UnknownLayerTypeError>()(
  'UnknownLayerTypeError',
  {
    cause: Schema.optional(Schema.Unknown),
    message: Schema.String,
  },
) {}

export const createLayer = Effect.fn('createLayer')(function* (
  type: LayerType,
  registry: Record<LayerType, LayerEntry>,
) {
  const entry = Object.hasOwn(registry, type) ? registry[type] : undefined
  if (!entry) {
    return yield* Effect.fail(new UnknownLayerTypeError({ message: `Unknown layer type: ${type}` }))
  }

  const fields: Record<string, number> = {}
  for (const key of Object.keys(entry.fields)) {
    const meta = entry.fields[key]
    if (meta) {
      fields[key] = meta.default
    }
  }

  // String-typed fields (references, e.g. `lutId`) get their registry
  // defaults; the frontend overrides them with catalog data when it knows
  // the catalog (the engine doesn't).
  const stringFields: Record<string, string> = {}
  for (const key of Object.keys(entry.stringFields ?? {})) {
    const value = entry.stringFields?.[key]
    if (value !== undefined) {
      stringFields[key] = value
    }
  }

  // Decode the assembled representation with the entry's owner schema before
  // returning it. This keeps the dynamic field assembly at the boundary and
  // gives the returned layer the same contract as persisted layers.
  return yield* Schema.decodeUnknownEffect(entry.schema)({
    id: nextLayerId(),
    type,
    visible: true,
    ...fields,
    ...stringFields,
  })
})
