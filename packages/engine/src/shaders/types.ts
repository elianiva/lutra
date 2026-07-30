/**
 * A body renderer emits the WGSL statements for one layer, inlined into the
 * compute shader at the layer's index.
 *
 * The body operates on a `color` variable (vec3<f32>, linear light) and has
 * access to the pixel coordinate via `coord` (vec2<u32>) and optionally the
 * source texture via `srcTex`. Uniforms are namespaced with the layer index
 * (e.g., `l0_stops`, `l1_amount`, ...).
 */
export type BodyRenderer = (layerIndex: number) => string
