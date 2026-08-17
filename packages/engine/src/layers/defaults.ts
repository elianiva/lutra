import { Schema } from 'effect'
import { nextLayerId } from './id'
import type { LayerEntry } from './registry'
import type { Layer, LayerType } from './schemas'

// ---- errors ----

/**
 * A layer factory was asked for a type the registry does not define. The
 * registries are static and the UI only picks from `LAYER_TYPES`, so this
 * is a defect (a programmer error), not a recoverable failure — it is
 * thrown, not Effect-failed. Distinct from `GpuError`'s "Unknown layer
 * type" case in `createRenderRequest`, where the chain is user data
 * crossing the persistence boundary and the failure is recoverable.
 */
export class UnknownLayerTypeError extends Schema.TaggedErrorClass<UnknownLayerTypeError>()(
  'UnknownLayerTypeError',
  {
    cause: Schema.optional(Schema.Unknown),
    message: Schema.String,
  },
) {}

export function createLayer<K extends LayerType>(
  type: K,
  registry: Record<LayerType, LayerEntry>,
): Extract<Layer, { type: K }>
export function createLayer(type: LayerType, registry: Record<LayerType, LayerEntry>): Layer {
  const entry = registry[type]
  if (!entry) {
    throw new UnknownLayerTypeError({ message: `Unknown layer type: ${type}` })
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
  return Schema.decodeUnknownSync(entry.schema)({
    id: nextLayerId(),
    type,
    visible: true,
    ...fields,
    ...stringFields,
  })
}
