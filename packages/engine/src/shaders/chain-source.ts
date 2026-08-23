import { Effect, Schema } from 'effect'
import { SRGB_TO_LINEAR } from './colorspace'
import type { BodyRenderer, BodySource } from './types'
import type { FieldKey, LutId } from '../brands'
import type { LayerType } from '../layers/schemas'

/**
 * The assembler hit a LUT pass whose layer carries no cube reference.
 * `generateChainSource` reports this on its Effect error channel so callers
 * can compose the failure without a synchronous throw.
 */
export class MissingLutReferenceError extends Schema.TaggedError<MissingLutReferenceError>()(
  'MissingLutReferenceError',
  {
    cause: Schema.optional(Schema.Unknown),
    message: Schema.String,
  },
) {}

/**
 * Square workgroup dimension for the generated compute shaders. 256
 * invocations per workgroup (16×16) schedules better than 64 (8×8) on
 * most desktop GPUs; the frontend dispatches with this same value.
 */
export const WORKGROUP_SIZE = 16

/** Per-layer entry used by the assembler. */
export interface ChainLayerInfo {
  readonly type: LayerType
  readonly body: BodyRenderer
  readonly fieldKeys: readonly FieldKey[]
  /**
   * LUT layers only: the cube reference. The id flows through to the
   * pass so the frontend binds the right texture; the size is baked into
   * the shader as the sampling coordinate scale.
   */
  readonly lut?: { readonly id: LutId; readonly size: number }
}

/** One compute pass: a single layer, or a pure linearize/copy step. */
export interface ChainPass {
  /** The complete WGSL source for this pass. */
  readonly source: string
  /**
   * Flat list of uniform slot descriptors for this pass's layer, in the
   * order they appear in the pass's uniform buffer. The frontend uses
   * this to know which float slots to write when a parameter changes.
   */
  readonly uniforms: readonly UniformSlot[]
  /**
   * Whether this pass reads the frame counter (`u_frame`). With
   * `layout: 'auto'` the pipeline only exposes bindings the shader
   * statically uses, so the frontend must include the binding-3 entry
   * (and allocate its buffer) only when this is true.
   */
  readonly usesFrame: boolean
  /**
   * Whether this pass uses a filtered sampler (binding 5) — e.g.
   * clarity, which samples its input with `textureSampleLevel`.
   * `textureLoad`-based bodies (chromatic aberration) do not set it.
   */
  readonly usesSampler: boolean
  /**
   * LUT layers only: the cube id this pass applies. The frontend binds
   * the matching 3D texture (binding 6) and caches it keyed by this id.
   */
  readonly lutId?: LutId
}

/** Result of assembling a chain into an ordered list of WGSL compute passes. */
export interface ChainShader {
  /**
   * Ordered compute passes. Pass 0 reads the source image (sRGB); every
   * later pass reads the previous pass's output (linear light); the last
   * pass encodes back to sRGB and writes the display texture.
   */
  readonly passes: readonly ChainPass[]
  /**
   * Whether any pass reads the frame counter (`u_frame`). The frontend
   * writes the frame buffer once per render when this is true; only
   * passes that statically use it get the binding-3 entry.
   */
  readonly usesFrame: boolean
}

export interface UniformSlot {
  /** Layer index in the chain (0-based). */
  readonly layerIndex: number
  /** The field key on the layer (e.g. "stops", "amount"). */
  readonly field: FieldKey
  /** Offset into this pass's uniform buffer (in f32 slots). */
  readonly offset: number
}

/**
 * A body renderer emits either plain statements (string) or a
 * `BodySource` with optional module-scope helpers. Normalize to the
 * struct form so the assembler can place helpers at module scope.
 */
function normalizeBody(render: string | BodySource): BodySource {
  return Schema.is(Schema.String)(render) ? { stmts: render } : render
}

/** Pure copy: reads the sRGB source texture and writes it unchanged. */
function passthroughPass(): ChainPass {
  const source = `
@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var dstTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> u_resolution: vec2<f32>;

@compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let coord = id.xy;
  if (coord.x >= u32(u_resolution.x) || coord.y >= u32(u_resolution.y)) {
    return;
  }
  var src = textureLoad(srcTex, coord, 0);
  textureStore(dstTex, coord, src);
}
`
  return { source, uniforms: [], usesFrame: false, usesSampler: false }
}

/**
 * Decodes the sRGB source texture into a linear-light rgba16float
 * intermediate. Inserted ahead of the first layer when that layer
 * samples its input texture (e.g. chromatic aberration): bodies always
 * see linear light, including at sampled offsets.
 */
function linearizePass(): ChainPass {
  const source = `
@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var dstTex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> u_resolution: vec2<f32>;

${SRGB_TO_LINEAR}

@compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let coord = id.xy;
  if (coord.x >= u32(u_resolution.x) || coord.y >= u32(u_resolution.y)) {
    return;
  }
  var src = textureLoad(srcTex, coord, 0);
  var color = srgbToLinear(src.rgb);
  textureStore(dstTex, coord, vec4<f32>(color, src.a));
}
`
  return { source, uniforms: [], usesFrame: false, usesSampler: false }
}

interface LayerPassOptions {
  readonly body: string
  /** Module-scope WGSL (functions) emitted ahead of the entry point. */
  readonly helpers: string
  readonly uniforms: readonly UniformSlot[]
  /** Decode the pass input from sRGB (first layer, when nothing pre-linearized). */
  readonly linearize: boolean
  /** Encode the pass output to sRGB (last layer, writing the display texture). */
  readonly encode: boolean
  /** Body samples its pass input at neighbor offsets (linearize pass when first). */
  readonly samplesInput: boolean
  /** Body samples through the filtered sampler (declares binding 5). */
  readonly needsSampler: boolean
  /** Storage format of the pass output. */
  readonly dstFormat: 'rgba8unorm' | 'rgba16float'
}

/**
 * One layer as a compute pass. The body operates on `color` (linear
 * light); the pass owns the colorspace transitions at its boundaries.
 */
function layerPass({
  body,
  helpers,
  uniforms,
  linearize,
  encode,
  samplesInput: _samplesInput,
  needsSampler,
  dstFormat,
}: LayerPassOptions): ChainPass {
  const structFields = uniforms.map((u) => `  l${u.layerIndex}_${u.field}: f32,`).join('\n')
  const structDef = uniforms.length > 0 ? `struct LayerParams {\n${structFields}\n}` : ''

  // WGSL struct members are only in scope through the struct variable, but
  // bodies reference their params unqualified (e.g. `l0_stops`). Bind each
  // member to the bare name inside `main` before the body is inlined.
  const uniformAliases = uniforms
    .map((u) => `  let l${u.layerIndex}_${u.field} = u_params.l${u.layerIndex}_${u.field};`)
    .join('\n')

  const usesFrame = body.includes('u_frame') || helpers.includes('u_frame')
  // Structural flag, not WGSL text sniffing: a body that samples its
  // input with `textureLoad` (chromatic aberration) still sets
  // `samplesInput` for the linearize pass, but only `usesSampler`
  // bodies get the binding-5 sampler declaration — the auto pipeline
  // layout omits declared-but-unused bindings, so an entry for a
  // sampler the shader never references fails bind-group validation.
  const usesSampler = needsSampler
  const colorspace = linearize || encode ? SRGB_TO_LINEAR : ''
  const srcExpr = linearize ? 'srgbToLinear(src.rgb)' : 'src.rgb'
  const outExpr = encode ? 'linearToSrgb(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)))' : 'color'

  const frameDecl = usesFrame ? '@group(0) @binding(3) var<uniform> u_frame: u32;\n' : ''
  const samplerDecl = usesSampler ? '@group(0) @binding(5) var samp: sampler;\n' : ''
  const paramsDecl =
    uniforms.length > 0 ? '@group(0) @binding(4) var<uniform> u_params: LayerParams;\n' : ''

  const source = `
${structDef}

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var dstTex: texture_storage_2d<${dstFormat}, write>;
@group(0) @binding(2) var<uniform> u_resolution: vec2<f32>;
${frameDecl}${samplerDecl}${paramsDecl}
${colorspace}
${helpers}
@compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let coord = id.xy;
  if (coord.x >= u32(u_resolution.x) || coord.y >= u32(u_resolution.y)) {
    return;
  }

  var src = textureLoad(srcTex, coord, 0);
  var color = ${srcExpr};
  let alpha = src.a;

${uniformAliases}
${body}

  let outColor = ${outExpr};
  textureStore(dstTex, coord, vec4<f32>(outColor, alpha));
}
`

  return { source, uniforms, usesFrame, usesSampler }
}

interface LutPassOptions {
  readonly body: string
  /** Module-scope WGSL (functions) emitted ahead of the entry point. */
  readonly helpers: string
  readonly uniforms: readonly UniformSlot[]
  /** The cube id (frontend binds the matching 3D texture). */
  readonly lutId: LutId
  /** Cube dimension; baked into the sampling coordinate scale. */
  readonly lutSize: number
  /**
   * Pass reads the sRGB source texture directly — the input is already
   * sRGB-encoded, so no linear→sRGB decode. False when the input is a
   * linear intermediate (every LUT pass that is not first in the chain).
   */
  readonly inputIsSrgb: boolean
  /**
   * Pass writes the sRGB display texture — its output is already
   * sRGB-encoded, so no sRGB→linear re-encode. False for LUT passes in
   * the middle of the chain, whose output feeds linear passes.
   */
  readonly outputIsSrgb: boolean
  /** Storage format of the pass output. */
  readonly dstFormat: 'rgba8unorm' | 'rgba16float'
}

/**
 * A LUT layer as a compute pass. The LUT body operates on sRGB-encoded
 * values (the vendored film cubes are authored in sRGB space — see
 * docs/adr/0001-rendering-engine.md), so this pass inverts the usual
 * color-space boundaries: it decodes its linear input to sRGB before the
 * body and re-encodes the result back to linear after, unless one of the
 * two ends is already sRGB (source input / display output).
 */
function lutPass({
  body,
  helpers,
  uniforms,
  lutId,
  lutSize,
  inputIsSrgb,
  outputIsSrgb,
  dstFormat,
}: LutPassOptions): ChainPass {
  const structFields = uniforms.map((u) => `  l${u.layerIndex}_${u.field}: f32,`).join('\n')
  const structDef = uniforms.length > 0 ? `struct LayerParams {\n${structFields}\n}` : ''

  const uniformAliases = uniforms
    .map((u) => `  let l${u.layerIndex}_${u.field} = u_params.l${u.layerIndex}_${u.field};`)
    .join('\n')

  const usesFrame = body.includes('u_frame') || helpers.includes('u_frame')
  const inputExpr = inputIsSrgb
    ? 'src.rgb'
    : 'linearToSrgb(clamp(src.rgb, vec3<f32>(0.0), vec3<f32>(1.0)))'
  const outputExpr = outputIsSrgb ? 'color' : 'srgbToLinear(color)'
  const colorspace = !inputIsSrgb || !outputIsSrgb ? SRGB_TO_LINEAR : ''

  const frameDecl = usesFrame ? '@group(0) @binding(3) var<uniform> u_frame: u32;\n' : ''
  const paramsDecl =
    uniforms.length > 0 ? '@group(0) @binding(4) var<uniform> u_params: LayerParams;\n' : ''

  // The body does its own trilinear interpolation over texel coordinates
  // (textureLoad; 32-bit float textures are not filterable in WebGPU), so
  // the pass only bakes the cube size for the texel-space mapping.
  const sizeConst = `const LUT_SIZE: f32 = ${lutSize}.0;`

  const source = `
${structDef}

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var dstTex: texture_storage_2d<${dstFormat}, write>;
@group(0) @binding(2) var<uniform> u_resolution: vec2<f32>;
${frameDecl}${paramsDecl}@group(0) @binding(6) var lutTex: texture_3d<f32>;

${sizeConst}

${colorspace}
${helpers}
@compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let coord = id.xy;
  if (coord.x >= u32(u_resolution.x) || coord.y >= u32(u_resolution.y)) {
    return;
  }

  var src = textureLoad(srcTex, coord, 0);
  var color = ${inputExpr};
  let alpha = src.a;

${uniformAliases}
${body}

  let outColor = ${outputExpr};
  textureStore(dstTex, coord, vec4<f32>(outColor, alpha));
}
`

  return { lutId, source, uniforms, usesFrame, usesSampler: false }
}

/**
 * Generate the ordered WGSL compute passes for the given chain of
 * layers. Each layer runs as its own pass and reads the previous pass's
 * output, so texture-sampling bodies (chromatic aberration) sample the
 * accumulated result of earlier layers — not the source image. Passes
 * ping-pong through linear-light rgba16float intermediates; only the
 * final pass encodes to sRGB and writes the 8-bit display texture.
 *
 * When the first layer samples its input, a dedicated linearize pass is
 * inserted ahead of it so sampled texels are always linear light.
 *
 * Fails with `MissingLutReferenceError` when a LUT body has no cube
 * reference.
 */
export const generateChainSource = Effect.fn('generateChainSource')(function* (
  layers: readonly ChainLayerInfo[],
) {
  if (layers.length === 0) {
    return { passes: [passthroughPass()], usesFrame: false }
  }

  const bodies = layers.map((layer, i) => normalizeBody(layer.body(i)))
  // Sampling bodies read their pass input at neighbor offsets: the first
  // pass's input is the sRGB source, so it needs a linearize pass ahead of
  // it to keep sampled texels in linear light (CA at continuous radial
  // offsets, clarity in a 9-tap blur — both via textureSampleLevel).
  // Declared structurally by the body, never sniffed from WGSL text.
  const firstBodySamplesSource = bodies[0]!.samplesInput === true

  const passes: ChainPass[] = []
  if (firstBodySamplesSource) {
    passes.push(linearizePass())
  }

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li]!
    const body = bodies[li]!
    const uniforms: UniformSlot[] = []
    let off = 0
    for (const key of layer.fieldKeys) {
      uniforms.push({ field: key, layerIndex: li, offset: off })
      off++
    }
    const isLast = li === layers.length - 1
    if (body.needsLut) {
      // LUT passes invert the color-space boundaries: the body operates
      // on sRGB-encoded values, so decode on the way in and re-encode on
      // the way out, skipping either end when it is already sRGB.
      const { lut } = layer
      if (!lut) {
        return yield* Effect.fail(
          new MissingLutReferenceError({
            message: `LUT layer at index ${li} is missing its cube reference`,
          }),
        )
      }
      passes.push(
        lutPass({
          body: body.stmts,
          dstFormat: isLast ? 'rgba8unorm' : 'rgba16float',
          helpers: body.helpers ?? '',
          inputIsSrgb: li === 0 && !firstBodySamplesSource,
          lutId: lut.id,
          lutSize: lut.size,
          outputIsSrgb: isLast,
          uniforms,
        }),
      )
    } else {
      passes.push(
        layerPass({
          body: body.stmts,
          dstFormat: isLast ? 'rgba8unorm' : 'rgba16float',
          encode: isLast,
          helpers: body.helpers ?? '',
          linearize: li === 0 && !firstBodySamplesSource,
          needsSampler: body.usesSampler === true,
          samplesInput: body.samplesInput === true,
          uniforms,
        }),
      )
    }
  }

  return {
    passes,
    usesFrame: passes.some((p) => p.usesFrame),
  }
})
