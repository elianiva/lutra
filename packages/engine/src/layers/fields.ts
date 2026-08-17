import { Schema } from 'effect'
import type { FieldKey } from '../brands'
import type { Layer } from './schemas'

/**
 * Dynamic field reads off {@link Layer} objects.
 *
 * Layers are plain objects whose per-layer fields are schema-defined
 * (`./schemas.ts`); the *set* of fields differs per layer type, so keyed
 * access goes through a record view. The value union below is the concrete
 * contract the schemas define — never a bare `unknown` — and the predicate
 * helpers are the single place a field value's runtime type is inspected.
 */
export type LayerFieldValue = number | string | boolean

/** Read a layer's dynamic field by key; `undefined` when absent. */
export const readField = (layer: Layer, key: FieldKey): LayerFieldValue | undefined => {
  const record: Record<string, LayerFieldValue> = layer
  return record[key]
}

/** True when the field value is a number (the numeric-param contract). */
export const isFieldNumber = (value: LayerFieldValue | undefined): value is number =>
  Schema.is(Schema.Number)(value)

/** Read a numeric field; NaN when absent or non-numeric. */
export const numField = (layer: Layer, key: FieldKey): number => {
  const value = readField(layer, key)
  return isFieldNumber(value) ? value : Number.NaN
}

/** True when the field value is a string (the string-field contract). */
export const isFieldString = (value: LayerFieldValue | undefined): value is string =>
  Schema.is(Schema.String)(value)

/** Read a string field; '' when absent or non-string. */
export const strField = (layer: Layer, key: FieldKey): string => {
  const value = readField(layer, key)
  return isFieldString(value) ? value : ''
}
