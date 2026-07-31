/**
 * WGSL emitted by a body renderer. `stmts` is inlined into the pass's
 * `main` (operating on `color`, linear light, with `coord`,
 * `u_resolution`, and optionally `u_frame`/`srcTex` in scope). `helpers`
 * is optional module-scope WGSL (function definitions) emitted ahead of
 * the entry point — bodies that need reusable noise/interpolation
 * functions (e.g. FBM grain) return these.
 */
export interface BodySource {
  /** Statements inlined into `main` at the layer's index. */
  readonly stmts: string
  /** Module-scope WGSL (functions) emitted before the entry point. */
  readonly helpers?: string
}

/**
 * A body renderer emits the WGSL for one layer, inlined into the
 * compute pass at the layer's index.
 *
 * The body operates on a `color` variable (vec3<f32>, linear light) and
 * has access to the pixel coordinate via `coord` (vec2<u32>), the input
 * texture via `srcTex` (the previous pass's output, linear light), and
 * `u_resolution`. Uniforms are namespaced with the layer index (e.g.,
 * `l0_stops`, `l1_amount`, ...).
 *
 * A body may also return a `BodySource` with module-scope helper
 * functions; a plain string is treated as `{ stmts: string }`.
 */
export type BodyRenderer = (layerIndex: number) => string | BodySource
