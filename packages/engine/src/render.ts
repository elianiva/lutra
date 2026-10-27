import { Effect, Schema } from 'effect'
import { FieldKey, LutId } from './brands'
import { numField, strField } from './layers/fields'
import type { Layer, LayerType } from './layers/schemas'
import type { LayerEntry } from './layers/registry'
import type { LutCube } from './luts/cube'
import { generateChainSource } from './shaders/chain-source'
import type { ChainLayerInfo, ChainPass, ChainShader, DerivedSlot } from './shaders/chain-source'

export class GpuError extends Schema.TaggedError<GpuError>()('GpuError', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

/**
 * Last derived table per slot, with the field values it was computed
 * from. Slots are stable while the chain shape is (the shader is cached
 * below), so a slider tick on another layer — or on a field the table
 * does not read — reuses the table instead of recomputing it.
 */
const derivedMemo = new WeakMap<
  DerivedSlot,
  {
    readonly keys: readonly string[]
    readonly values: readonly number[]
    readonly table: Float32Array
  }
>()

function derivedTable(slot: DerivedSlot, layer: Layer): Float32Array {
  const read = (key: string) => numField(layer, FieldKey(key))
  const memo = derivedMemo.get(slot)
  if (memo && memo.keys.every((key, k) => Object.is(read(key), memo.values[k]))) {
    return memo.table
  }
  const keys: string[] = []
  const values: number[] = []
  const table = slot.compute((key) => {
    const value = read(key)
    if (!keys.includes(key)) {
      keys.push(key)
      values.push(value)
    }
    return value
  })
  derivedMemo.set(slot, { keys, table, values })
  return table
}

/**
 * Last assembled shader per registry, keyed by the chain shape (visible
 * layer types and LUT ids). The WGSL depends only on the shape, so a
 * slider tick reuses it instead of re-assembling every pass.
 */
const shaderMemo = new WeakMap<object, { readonly key: string; readonly shader: ChainShader }>()

/**
 * Pack one pass's layer parameter values into a flat Float32Array
 * following the slot layout returned by the assembler: scalar fields,
 * then each body's CPU-derived table at its vec4-aligned offset.
 */
function packUniforms(visibleLayers: readonly Layer[], pass: ChainPass): Float32Array {
  const buf = new Float32Array(pass.uniformLength)

  for (const slot of pass.uniforms) {
    // Schema-validated layers always carry the field as a number; skip
    // anything else rather than coerce garbage.
    const value = numField(visibleLayers[slot.layerIndex]!, slot.field)
    if (!Number.isNaN(value)) {
      buf[slot.offset] = value
    }
  }
  for (const slot of pass.derived) {
    buf.set(derivedTable(slot, visibleLayers[slot.layerIndex]!), slot.offset)
  }

  return buf
}

/**
 * Everything the GPU backend needs to render one frame: the assembled
 * chain passes, the packed uniforms, the source image, and a frame
 * counter (seeds `u_frame` for animated bodies like grain).
 *
 * The engine stops at building the request — WebGPU execution, canvas
 * presentation, and readback are the frontend's concern (it owns the
 * device and the canvas).
 */
export interface RenderRequest {
  readonly shader: ChainShader
  /** Packed uniforms, one Float32Array per pass (aligned with shader.passes). */
  readonly uniforms: readonly Float32Array[]
  readonly srcBitmap: ImageBitmap
  readonly frame: number
  /**
   * Render pixels per preview pixel: 1 in the editor, native/preview
   * long-edge ratio on export. Pixel-sized effects (clarity radius, grain
   * size) scale by it so an export matches the preview it was graded on.
   */
  readonly pixelScale: number
  /**
   * Cubes referenced by LUT layers in the chain, keyed by lutId. The GPU
   * backend uploads each cube to a 3D texture once and caches it.
   */
  readonly luts: ReadonlyMap<LutId, LutCube>
}

/**
 * Build a render request for the given ordered chain of adjustment
 * layers. An empty chain (or all layers hidden) is valid — the
 * assembler emits a passthrough shader, so the request presents the
 * source image unchanged.
 */
export const createRenderRequest = Effect.fn('createRenderRequest')(function* (
  chain: readonly Layer[],
  registry: Record<LayerType, LayerEntry>,
  srcBitmap: ImageBitmap,
  frame: number,
  luts: ReadonlyMap<LutId, LutCube>,
  pixelScale = 1,
) {
  const chainLayers: ChainLayerInfo[] = []
  for (const l of chain) {
    if (!l.visible) continue

    const entry = registry[l.type]
    if (!entry) {
      return yield* Effect.fail(new GpuError({ message: `Unknown layer type: ${l.type}` }))
    }

    // LUT layers carry a cube reference: resolve the id through the
    // LUT map the caller provided. The engine stays pure — it never
    // fetches or parses cubes, and an unresolvable id is a hard error.
    if (l.type === 'lut') {
      const lutId = strField(l, FieldKey('lutId'))
      if (lutId === '') {
        return yield* Effect.fail(new GpuError({ message: 'LUT layer is missing a lutId' }))
      }
      const id = LutId(lutId)
      if (!luts.has(id)) {
        return yield* Effect.fail(new GpuError({ message: `Unknown LUT: ${id}` }))
      }
      chainLayers.push({
        body: entry.body,
        fieldKeys: Object.keys(entry.fields).map(FieldKey),
        lutId: id,
        type: l.type,
      })
    } else {
      chainLayers.push({
        body: entry.body,
        fieldKeys: Object.keys(entry.fields).map(FieldKey),
        type: l.type,
      })
    }
  }

  const chainKey = chainLayers.map((l) => `${l.type}:${l.lutId ?? ''}`).join('|')
  const memo = shaderMemo.get(registry)
  let shader: ChainShader
  if (memo && memo.key === chainKey) {
    shader = memo.shader
  } else {
    shader = yield* generateChainSource(chainLayers).pipe(
      Effect.mapError((cause) => new GpuError({ cause, message: 'Shader generation failed' })),
    )
    shaderMemo.set(registry, { key: chainKey, shader })
  }

  const visible = chain.filter((l) => l.visible)
  const uniforms = shader.passes.map((pass) => packUniforms(visible, pass))

  return { frame, luts, pixelScale, shader, srcBitmap, uniforms }
})
