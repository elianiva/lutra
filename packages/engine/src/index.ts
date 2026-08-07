export { VERSION } from "./version"

// Branded primitives — constructors (Brand.nominal) and the schemas
// (Schema.fromBrand) that decode the same branded types at boundaries.
// Each name exports both its value (constructor/schema) and type meaning.
export { LayerId, LayerIdSchema, LutId, LutIdSchema, FieldKey, FieldKeySchema } from "./brands"

// Layer data model
export {
  createLayer,
  nextLayerId,
  makeRegistry,
  LAYER_TYPES,
  Layer,
  LayerPatch,
  LutLayer,
  UnknownLayerTypeError,
} from "./layers"
export type {
  FieldMeta,
  LayerEntry,
  LayerRegistry,
  RegistryInput,
  LayerType,
} from "./layers"

// Chain operations
export {
  addLayer,
  removeLayer,
  reorderLayer,
  updateLayerParam,
  toggleLayerVisibility,
  replaceChain,
} from "./chain"

// Render pipeline
// The engine builds a render request (shader + uniforms + source + frame);
// execution and canvas presentation live in the frontend's GPU backend.
export { createRenderRequest, GpuError } from "./render"
export type { RenderRequest } from "./render"

// LUT parsing
// Pure `.cube` text → `LutCube`; fetching bytes and GPU upload are the
// frontend's concern.
export { parseCube, LutParseError } from "./luts/cube"
export type { LutCube } from "./luts/cube"

// Shader generation
export {
  generateChainSource,
  SRGB_TO_LINEAR,
  WORKGROUP_SIZE,
  MissingLutReferenceError,
} from "./shaders"
export type { ChainLayerInfo, ChainPass, ChainShader, UniformSlot, BodyRenderer } from "./shaders"

// Shader body renderers — one per layer type. Consumers build a registry
// (`makeRegistry`) from these to drive both `createLayer` and `render`.
export {
  renderExposure,
  renderContrast,
  renderShadows,
  renderHighlights,
  renderWhiteBalance,
  renderSaturation,
  renderGrain,
  renderVignette,
  renderChromaticAberration,
  renderClarity,
  renderLut,
} from "./shaders"

// Export encoding
// The engine owns the encoder contract (`ImageEncoder` service) and the
// jSquash implementation; the frontend provides a worker-backed layer for
// the app (docs/adr/0006).
export {
  EXPORT_FORMATS,
  ExportFormat,
  EXPORT_SCALES,
  ExportQuality,
  ExportScale,
  ExportSettings,
  defaultExportSettings,
  isLossy,
  fileExtension,
  mimeFor,
  EncodeError,
  ImageEncoder,
  ImageEncoderLive,
  encodeImage,
} from "./encode"
export type {
  ExportFormat as ExportFormatType,
  ExportQuality as ExportQualityType,
  ExportScale as ExportScaleType,
  ExportSettings as ExportSettingsType,
  ImageEncoderShape,
} from "./encode"
