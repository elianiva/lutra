export { VERSION } from "./version"

// Layer data model
export {
  createLayer,
  nextLayerId,
  _resetLayerCounter,
  makeRegistry,
  LAYER_TYPES,
  Layer,
  LayerId,
  LayerPatch,
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
export type { ChainError } from "./chain"

// Render pipeline
export { render, GpuBackend, GpuError, EmptyChainError } from "./render"
export type { RenderError, GpuBackendShape } from "./render"

// Shader generation
export { generateChainSource, SRGB_TO_LINEAR } from "./shaders"
export type { ChainLayerInfo, ChainShader, UniformSlot, BodyRenderer } from "./shaders"

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
} from "./shaders"
