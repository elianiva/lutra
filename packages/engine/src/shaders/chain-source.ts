import { Effect, Schema } from 'effect'
import { SRGB_TO_LINEAR } from './colorspace'
import type { BodyRenderer, BodySource, DerivedUniform } from './types'
import type { FieldKey, LutId } from '../brands'
import type { LayerType } from '../layers/schemas'

/**
 * The assembler hit a LUT layer that carries no cube reference.
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

/**
 * Luma histogram bins accumulated by the final pass. One bin per
 * invocation of a workgroup, so each invocation flushes exactly one
 * workgroup-local bin to the global buffer.
 */
export const HISTOGRAM_BINS = WORKGROUP_SIZE * WORKGROUP_SIZE

/**
 * First binding of the per-pass LUT textures: the k-th LUT layer of a pass
 * binds its 3D texture at `LUT_BINDING_BASE + k`.
 */
export const LUT_BINDING_BASE = 8

/** Per-layer entry used by the assembler. */
export interface ChainLayerInfo {
  readonly type: LayerType
  readonly body: BodyRenderer
  readonly fieldKeys: readonly FieldKey[]
  /** LUT layers only: the cube the frontend binds as the layer's 3D texture. */
  readonly lutId?: LutId
}

export interface UniformSlot {
  /** Visible-layer index in the chain (0-based). */
  readonly layerIndex: number
  /** The field key on the layer (e.g. "stops", "amount"). */
  readonly field: FieldKey
  /** Offset into this pass's uniform buffer (in f32 slots). */
  readonly offset: number
}

export interface DerivedSlot extends DerivedUniform {
  /** Visible-layer index in the chain (0-based). */
  readonly layerIndex: number
  /** Offset into this pass's uniform buffer (in f32 slots, 4-aligned). */
  readonly offset: number
}

/**
 * One compute pass: a run of layers fused into one shader. A pass starts
 * at the chain head and at every layer that samples its input; every
 * other layer is per-pixel and runs inside the current pass.
 */
export interface ChainPass {
  /** The complete WGSL source for this pass. */
  readonly source: string
  /** Scalar uniform slots, one per field of every layer in the pass. */
  readonly uniforms: readonly UniformSlot[]
  /** CPU-derived uniform tables (vec4-aligned) of the pass's layers. */
  readonly derived: readonly DerivedSlot[]
  /** Length of the pass's uniform buffer in f32 slots (0 = no u_params). */
  readonly uniformLength: number
  /** Whether this pass uses the filtered sampler (binding 5). */
  readonly usesSampler: boolean
  /** LUT cubes of the pass, in binding order from `LUT_BINDING_BASE`. */
  readonly lutIds: readonly LutId[]
}

/**
 * Result of assembling a chain into an ordered list of WGSL compute passes.
 * Pass 0 reads the source image through an sRGB-decoding view (linear
 * light); every later pass reads the previous pass's rgba16float output
 * (linear light); the last pass encodes to sRGB, writes the display
 * texture, and accumulates the luma histogram (binding 6).
 */
export interface ChainShader {
  readonly passes: readonly ChainPass[]
}

/**
 * A body renderer emits either plain statements (string) or a
 * `BodySource` with optional module-scope helpers. Normalize to the
 * struct form so the assembler can place helpers at module scope.
 */
function normalizeBody(render: string | BodySource): BodySource {
  return Schema.is(Schema.String)(render) ? { stmts: render } : render
}

const roundUp4 = (n: number) => Math.ceil(n / 4) * 4

/** Assemble one fused pass from the given layers (chain indices). */
function buildPass(
  layers: readonly ChainLayerInfo[],
  indices: readonly number[],
  isLast: boolean,
): ChainPass {
  const uniforms: UniformSlot[] = []
  const derived: DerivedSlot[] = []
  const structFields: string[] = []
  const aliases: string[] = []
  const helpers = new Set<string>()
  const lutIds: LutId[] = []
  const lutDecls: string[] = []
  const stmts: string[] = []
  let usesSampler = false
  let offset = 0
  // Transfer function `color` is currently in. Pass input is linear.
  let encoding: 'linear' | 'srgb' = 'linear'

  for (const [local, li] of indices.entries()) {
    const layer = layers[li]!
    const body = normalizeBody(layer.body(local))
    for (const field of layer.fieldKeys) {
      uniforms.push({ field, layerIndex: li, offset })
      structFields.push(`  l${local}_${field}: f32,`)
      aliases.push(`  let l${local}_${field} = u_params.l${local}_${field};`)
      offset++
    }
    if (body.derived) {
      offset = roundUp4(offset)
      derived.push({ ...body.derived, layerIndex: li, offset })
      structFields.push(`  l${local}_derived: array<vec4<f32>, ${body.derived.length}>,`)
      offset += body.derived.length * 4
    }
    if (body.helpers) {
      helpers.add(body.helpers)
    }
    if (body.usesSampler || body.needsLut) {
      usesSampler = true
    }
    if (body.needsLut) {
      // Validated by generateChainSource before assembly.
      lutIds.push(layer.lutId!)
      lutDecls.push(
        `@group(0) @binding(${LUT_BINDING_BASE + lutIds.length - 1}) var l${local}_lut: texture_3d<f32>;`,
      )
    }
    // LUT bodies see sRGB-encoded color (the film cubes are authored in
    // sRGB); every other body sees linear light.
    const wants = body.needsLut ? 'srgb' : 'linear'
    if (wants !== encoding) {
      stmts.push(
        wants === 'srgb'
          ? '  color = linearToSrgb(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)));'
          : '  color = srgbToLinear(color);',
      )
      encoding = wants
    }
    stmts.push(body.stmts)
  }

  const outExpr = isLast
    ? encoding === 'srgb'
      ? 'clamp(color, vec3<f32>(0.0), vec3<f32>(1.0))'
      : 'linearToSrgb(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)))'
    : encoding === 'srgb'
      ? 'srgbToLinear(color)'
      : 'color'

  const uniformLength = roundUp4(offset)
  const paramsDecl =
    uniformLength > 0
      ? `struct LayerParams {\n${structFields.join('\n')}\n}\n@group(0) @binding(4) var<uniform> u_params: LayerParams;\n`
      : ''
  const samplerDecl = usesSampler ? '@group(0) @binding(5) var samp: sampler;\n' : ''
  // The final pass bins the luma of the stored 8-bit value into
  // workgroup-local counters, then each invocation flushes one bin, so
  // global atomics drop from one per pixel to at most 256 per workgroup
  // (about 5× faster than per-pixel global atomics on an Apple M1).
  const histogramDecl = isLast
    ? `@group(0) @binding(6) var<storage, read_write> bins: array<atomic<u32>, ${HISTOGRAM_BINS}>;
var<workgroup> wgBins: array<atomic<u32>, ${HISTOGRAM_BINS}>;
`
    : ''
  const histogramAccumulate = isLast
    ? `
    let stored = round(outColor * 255.0) / 255.0;
    let luma = dot(stored, vec3<f32>(0.2126, 0.7152, 0.0722));
    atomicAdd(&wgBins[min(u32(luma * ${HISTOGRAM_BINS}.0), ${HISTOGRAM_BINS - 1}u)], 1u);`
    : ''

  const histogramFlush = isLast
    ? `
  workgroupBarrier();
  let count = atomicLoad(&wgBins[localIndex]);
  if (count > 0u) {
    atomicAdd(&bins[localIndex], count);
  }`
    : ''

  const source = `
struct FrameInfo {
  resolution: vec2<f32>,
  pixelScale: f32,
  frame: u32,
}

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var dstTex: texture_storage_2d<${isLast ? 'rgba8unorm' : 'rgba16float'}, write>;
@group(0) @binding(2) var<uniform> u_info: FrameInfo;
${paramsDecl}${samplerDecl}${histogramDecl}${lutDecls.join('\n')}
${SRGB_TO_LINEAR}
${[...helpers].join('\n')}
@compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
fn main(
  @builtin(global_invocation_id) id: vec3<u32>,
  @builtin(local_invocation_index) localIndex: u32,
) {
  let coord = id.xy;
  let u_resolution = u_info.resolution;
  let u_pixelScale = u_info.pixelScale;
  let u_frame = u_info.frame;
  if (coord.x < u32(u_resolution.x) && coord.y < u32(u_resolution.y)) {
    let src = textureLoad(srcTex, coord, 0);
    var color = src.rgb;
    let alpha = src.a;

${aliases.join('\n')}
${stmts.join('\n')}

    let outColor = ${outExpr};
    textureStore(dstTex, coord, vec4<f32>(outColor, alpha));${histogramAccumulate}
  }${histogramFlush}
}
`

  return { derived, lutIds, source, uniformLength, uniforms, usesSampler }
}

/**
 * Generate the ordered WGSL compute passes for the given chain of layers
 * (docs/adr/0001-rendering-engine). Per-pixel layers fuse into one pass;
 * a layer that samples its input (clarity, chromatic aberration) starts a
 * new pass, so it reads the accumulated result of every earlier layer.
 * Passes ping-pong through linear-light rgba16float intermediates; the
 * last pass encodes to sRGB, writes the 8-bit display texture, and
 * accumulates the histogram. An empty chain is one copy pass.
 *
 * Fails with `MissingLutReferenceError` when a LUT body has no cube
 * reference.
 */
export const generateChainSource = Effect.fn('generateChainSource')(function* (
  layers: readonly ChainLayerInfo[],
) {
  const runs: number[][] = [[]]
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li]!
    const body = normalizeBody(layer.body(0))
    if (body.needsLut && layer.lutId === undefined) {
      return yield* Effect.fail(
        new MissingLutReferenceError({
          message: `LUT layer at index ${li} is missing its cube reference`,
        }),
      )
    }
    const current = runs.at(-1)!
    if (body.samplesInput === true && current.length > 0) {
      runs.push([li])
    } else {
      current.push(li)
    }
  }

  const passes = runs.map((run, i) => buildPass(layers, run, i === runs.length - 1))
  return { passes } satisfies ChainShader
})
