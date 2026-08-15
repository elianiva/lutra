export { createLayer, UnknownLayerTypeError } from './defaults'
export { nextLayerId } from './id'
export { makeRegistry } from './registry'
export {
  LAYER_TYPES,
  Layer,
  LayerPatch,
  LutLayer,
  ColorMixerLayer,
  ToneCurveLayer,
} from './schemas'
export type { LayerType } from './schemas'
export type { FieldMeta, LayerEntry, LayerRegistry, RegistryInput } from './registry'
export {
  CURVE_DEFAULT_POINTS,
  CURVE_POINT_COUNT,
  CURVE_X_EPS,
  curvePointXField,
  curvePointYField,
  curvePointsOf,
  isCurveNeutral,
  moveCurvePoint,
  resetCurve,
} from './curve'
export type { CurvePoint } from './curve'
