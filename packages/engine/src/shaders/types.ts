/**
 * Uniform data a body derives on the CPU from its layer's fields, instead
 * of recomputing it per pixel (e.g. the Tone Curve's spline tangents, the
 * Color Mixer's per-degree hue table). The assembler places it in the
 * pass's uniform struct as `l{i}_derived: array<vec4<f32>, length>`; the
 * body reads it through `u_params.l{i}_derived[k]`.
 */
export interface DerivedUniform {
  /** Number of vec4<f32> entries. */
  readonly length: number
  /** Compute the `length × 4` floats from the layer's numeric fields. */
  readonly compute: (field: (key: string) => number) => Float32Array
}

/**
 * WGSL emitted by a body renderer. `stmts` is inlined into the pass's
 * `main` (operating on `color`, linear light, with `coord`,
 * `u_resolution`, `u_pixelScale`, and `u_frame` in scope). `helpers` is
 * optional module-scope WGSL (function definitions) emitted ahead of the
 * entry point; identical helpers from several layers in one pass are
 * emitted once.
 *
 * Resource needs are declared structurally rather than sniffed from the
 * WGSL text: `samplesInput` marks bodies that read their pass input at
 * neighbor offsets (such a body starts a new pass, so its input holds the
 * accumulated result of every earlier layer); `usesSampler` marks bodies
 * that sample through the filtered binding-5 sampler; and `needsLut` marks
 * LUT bodies, which get a 3D LUT texture (`l{i}_lut`) and see sRGB-encoded
 * `color`.
 */
export interface BodySource {
  /** Statements inlined into `main` at the layer's index. */
  readonly stmts: string
  /** Module-scope WGSL (functions) emitted before the entry point. */
  readonly helpers?: string
  /** Body samples its pass input texture (neighbor access). */
  readonly samplesInput?: boolean
  /** Body samples through the filtered sampler (`samp`). */
  readonly usesSampler?: boolean
  /** Body samples the layer's 3D LUT texture (LUT layer). */
  readonly needsLut?: boolean
  /** CPU-derived uniform table (see `DerivedUniform`). */
  readonly derived?: DerivedUniform
}

/**
 * A body renderer emits the WGSL for one layer, inlined into a compute
 * pass. The index is the layer's position within its pass (not the
 * chain), so a layer's WGSL does not change when layers are added or
 * removed elsewhere in the chain and compiled pipelines stay reusable.
 *
 * The body operates on a `color` variable (vec3<f32>, linear light) and
 * has access to the pixel coordinate via `coord` (vec2<u32>), the pass
 * input texture via `srcTex` (linear light), and `u_resolution`.
 * Uniforms are namespaced with the index (e.g. `l0_stops`, `l1_amount`).
 *
 * A body may also return a `BodySource` with module-scope helper
 * functions; a plain string is treated as `{ stmts: string }`.
 */
export type BodyRenderer = (layerIndex: number) => string | BodySource
