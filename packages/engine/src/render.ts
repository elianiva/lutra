import { Effect, Schema } from "effect"
import type { Layer } from "./layers/schemas"
import type { LayerEntry } from "./layers/registry"
import { generateChainSource, type ChainLayerInfo, type ChainPass, type ChainShader } from "./shaders/chain-source"

// ---- errors ----

export class GpuError extends Schema.TaggedErrorClass<GpuError>()("GpuError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

// ---- uniform packing ----

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
      buf[slot.offset] = (layer as Record<string, unknown>)[slot.field] as number
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
}

/**
 * Build a render request for the given ordered chain of adjustment
 * layers. An empty chain (or all layers hidden) is valid — the
 * assembler emits a passthrough shader, so the request presents the
 * source image unchanged.
 */
export function createRenderRequest(
  chain: ReadonlyArray<Layer>,
  registry: Record<string, LayerEntry>,
  srcBitmap: ImageBitmap,
  frame: number,
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
      chainLayers.push({
        type: l.type,
        body: entry.body,
        fieldKeys: Object.keys(entry.fields),
      })
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

    return { shader, uniforms, srcBitmap, frame }
  })
}
