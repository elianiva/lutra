import { SRGB_TO_LINEAR } from "./colorspace"
import type { BodyRenderer } from "./types"

/**
 * Square workgroup dimension for the generated compute shader. 256
 * invocations per workgroup (16×16) schedules better than 64 (8×8) on
 * most desktop GPUs; the frontend dispatches with this same value.
 */
export const WORKGROUP_SIZE = 16

// ---- public types ----

/** Per-layer entry used by the assembler. */
export interface ChainLayerInfo {
  readonly type: string
  readonly body: BodyRenderer
  readonly fieldKeys: ReadonlyArray<string>
}

/** Result of assembling a chain into a complete WGSL compute shader. */
export interface ChainShader {
  /** The complete WGSL source. */
  readonly source: string
  /**
   * Flat list of uniform slot descriptors, in order as they appear in
   * the generated uniform buffer. The frontend uses this to know which
   * float slots to write when a layer parameter changes.
   */
  readonly uniforms: ReadonlyArray<UniformSlot>
  /**
   * Whether any layer body reads the frame counter (`u_frame`). With
   * `layout: 'auto'` the pipeline only exposes bindings the shader
   * statically uses, so the frontend must include the binding-3 entry
   * (and allocate its buffer) only when this is true.
   */
  readonly usesFrame: boolean
}

export interface UniformSlot {
  /** Layer index in the chain (0-based). */
  readonly layerIndex: number
  /** The field key on the layer (e.g. "stops", "amount"). */
  readonly field: string
  /** Offset into the uniform buffer (in f32 slots). */
  readonly offset: number
}

// ---- assembler ----

/**
 * Generate a complete WGSL compute shader for the given ordered list
 * of layers. Returns the source string and a uniform-slot map so the
 * frontend can push parameter values into the uniform buffer.
 */
export function generateChainSource(layers: ReadonlyArray<ChainLayerInfo>): ChainShader {
  if (layers.length === 0) {
    return {
      source: `
@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var dstTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> u_resolution: vec2<f32>;
@group(0) @binding(3) var<uniform> u_frame: u32;

@compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let coord = id.xy;
  if (coord.x >= u32(u_resolution.x) || coord.y >= u32(u_resolution.y)) {
    return;
  }
  var src = textureLoad(srcTex, coord, 0);
  textureStore(dstTex, coord, src);
}
`,
      uniforms: [],
      usesFrame: false,
    }
  }

  const uniformsCorrected: UniformSlot[] = []
  let off = 0
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li]!
    for (const key of layer.fieldKeys) {
      uniformsCorrected.push({ layerIndex: li, field: key, offset: off })
      off++
    }
  }

  // Generate the uniform struct
  const structFields = uniformsCorrected.map((u) => `  l${u.layerIndex}_${u.field}: f32,`)
  const structDef = `struct LayerParams {\n${structFields.join("\n")}\n}`

  // WGSL struct members are only in scope through the struct variable, but
  // bodies reference their params unqualified (e.g. `l0_stops`). Bind each
  // member to the bare name inside `main` before the bodies are inlined.
  const uniformAliases = uniformsCorrected
    .map((u) => `  let l${u.layerIndex}_${u.field} = u_params.l${u.layerIndex}_${u.field};`)
    .join("\n")

  // Generate bodies
  const bodyBlocks = layers.map((layer, i) => layer.body(i))

  // `u_frame` is only referenced by bodies that animate (currently grain);
  // an auto pipeline layout omits bindings the shader never statically uses,
  // so the frontend must know whether binding 3 exists.
  const usesFrame = bodyBlocks.some((body) => body.includes("u_frame"))

  // Build the full source
  const source = `
${structDef}

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var dstTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> u_resolution: vec2<f32>;
@group(0) @binding(3) var<uniform> u_frame: u32;
@group(0) @binding(4) var<uniform> u_params: LayerParams;

${SRGB_TO_LINEAR}

@compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let coord = id.xy;
  if (coord.x >= u32(u_resolution.x) || coord.y >= u32(u_resolution.y)) {
    return;
  }

  var src = textureLoad(srcTex, coord, 0);
  var color = srgbToLinear(src.rgb);
  let alpha = src.a;

${uniformAliases}
${bodyBlocks.join("\n")}

  let outColor = linearToSrgb(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)));
  textureStore(dstTex, coord, vec4<f32>(outColor, alpha));
}
`

  return { source, uniforms: uniformsCorrected, usesFrame }
}
