import { Effect, Schema } from "effect"
import { FieldKey, LutId } from "./brands"
import type { Layer, LayerType } from "./layers/schemas"
import type { LayerEntry } from "./layers/registry"
import type { LutCube } from "./luts/cube"
import { generateChainSource, type ChainLayerInfo, type ChainPass, type ChainShader } from "./shaders/chain-source"

// ---- errors ----

export class GpuError extends Schema.TaggedErrorClass<GpuError>()("GpuError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

// ---- uniform packing ----

/**
 * Read a field off a heterogeneous `Layer` union by key. The union
 * members are plain object types, so a widened annotation (not an
 * assertion) yields the record view.
 */
const readField = (layer: Layer, key: FieldKey): unknown => {
  const record: Record<string, unknown> = layer
  return record[key]
}

/**
 * Pack one pass's layer parameter values into a flat Float32Array
 * following the slot layout returned by the assembler.
 */
function packUniforms(
  chain: ReadonlyArray<Layer>,
  pass: ChainPass,
): Float32Array {
  const buf = new Float32Array(pass.uniforms.length)
  const visibleLayers = chain.filter((l) => l.visible)

  for (const slot of pass.uniforms) {
    const layer = visibleLayers[slot.layerIndex]
    if (layer) {
      const value = readField(layer, slot.field)
      // Schema-validated layers always carry the field as a number; skip
      // anything else rather than coerce garbage.
      if (typeof value === "number") {
        buf[slot.offset] = value
      }
    }
  }

  return buf
}

// ---- render request ----

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
  readonly uniforms: ReadonlyArray<Float32Array>
  readonly srcBitmap: ImageBitmap
  readonly frame: number
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
export function createRenderRequest(
  chain: ReadonlyArray<Layer>,
  registry: Record<LayerType, LayerEntry>,
  srcBitmap: ImageBitmap,
  frame: number,
  luts: ReadonlyMap<LutId, LutCube>,
): Effect.Effect<RenderRequest, GpuError> {
  return Effect.gen(function* () {
    // Build chain-layer info for the assembler
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
      if (l.type === "lut") {
        const lutId = readField(l, FieldKey("lutId"))
        if (typeof lutId !== "string") {
          return yield* Effect.fail(new GpuError({ message: "LUT layer is missing a lutId" }))
        }
        const id = LutId(lutId)
        const cube = luts.get(id)
        if (!cube) {
          return yield* Effect.fail(new GpuError({ message: `Unknown LUT: ${id}` }))
        }
        chainLayers.push({
          type: l.type,
          body: entry.body,
          fieldKeys: Object.keys(entry.fields).map(FieldKey),
          lut: { id, size: cube.size },
        })
      } else {
        chainLayers.push({
          type: l.type,
          body: entry.body,
          fieldKeys: Object.keys(entry.fields).map(FieldKey),
        })
      }
    }

    // Assemble the WGSL shader
    let shader: ChainShader
    try {
      shader = generateChainSource(chainLayers)
    } catch (e) {
      return yield* Effect.fail(new GpuError({ message: "Shader generation failed", cause: e }))
    }

    // Pack uniforms per pass from layer parameter values
    const uniforms = shader.passes.map((pass) => packUniforms(chain, pass))

    return { shader, uniforms, srcBitmap, frame, luts }
  })
}
