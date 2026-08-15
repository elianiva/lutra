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
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export function createLayer<K extends LayerType>(
  type: K,
  registry: Record<LayerType, LayerEntry>,
): Extract<Layer, { type: K }> {
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
  for (const [key, value] of Object.entries(entry.stringFields ?? {})) {
    stringFields[key] = value
  }

  // The spread fields are dynamic (Record<string, number|string>), so TS
  // cannot match the literal against the `Layer` union — the cast is the
  // deliberate escape hatch, and the schema decode at persistence
  // boundaries re-validates the result.
  // oxlint-disable-next-line consistent-type-assertions
  return {
    id: nextLayerId(),
    visible: true,
    type,
    ...fields,
    ...stringFields,
  } as unknown as Extract<Layer, { type: K }>
}
