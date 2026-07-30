import { Context, Data, Effect } from "effect"
import type { Layer } from "./layers/schemas"
import type { LayerEntry } from "./layers/registry"
import { generateChainSource, type ChainLayerInfo, type ChainShader } from "./shaders/chain-source"

// ---- service interface ----

/**
 * A GPU backend capable of executing a chain shader.
 * The frontend implements this service via Effect Context.
 *
 * Use `Context.Service<GpuBackendShape>()("GpuBackend")` style or the
 * class-based `Context.Service` pattern to create the key.
 */
export interface GpuBackendShape {
  /**
   * Compile and execute a chain shader. The backend receives the
   * complete WGSL source, uniform slot layout, source texture, and
   * frame counter. Returns the output as an ImageBitmap.
   */
  readonly execute: (
    shader: ChainShader,
    uniforms: Float32Array,
    srcBitmap: ImageBitmap,
    frame: number,
  ) => Effect.Effect<ImageBitmap, GpuError>
}

export class GpuBackend extends Context.Service<GpuBackend, GpuBackendShape>()(
  "GpuBackend",
) {}

// ---- errors ----

export class GpuError extends Data.TaggedError("GpuError")<{
  message: string
  cause?: unknown
}> {}

export class EmptyChainError extends Data.TaggedError("EmptyChainError")<{}> {}

export type RenderError = GpuError | EmptyChainError

// ---- uniform packing ----

/**
 * Pack the active (visible) layers' parameter values into a flat
 * Float32Array following the slot layout returned by the assembler.
 */
function packUniforms(
  chain: ReadonlyArray<Layer>,
  shader: ChainShader,
): Float32Array {
  const buf = new Float32Array(shader.uniforms.length)
  const visibleLayers = chain.filter((l) => l.visible)

  for (const slot of shader.uniforms) {
    const layer = visibleLayers[slot.layerIndex]
    if (layer) {
      buf[slot.offset] = (layer as Record<string, unknown>)[slot.field] as number
    }
  }

  return buf
}

// ---- render effect ----

/**
 * Render a source image through an ordered chain of adjustment layers.
 *
 * The chain is assembled into a single WGSL compute shader, uniforms
 * are packed into a flat Float32Array following the slot layout, and
 * the result is dispatched to the GpuBackend for execution.
 */
export function render(
  chain: ReadonlyArray<Layer>,
  registry: Record<string, LayerEntry>,
  srcBitmap: ImageBitmap,
  frame: number,
): Effect.Effect<ImageBitmap, RenderError, GpuBackend> {
  return Effect.gen(function* () {
    if (chain.length === 0) {
      return yield* Effect.fail(new EmptyChainError())
    }

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

    if (chainLayers.length === 0) {
      return yield* Effect.fail(new EmptyChainError())
    }

    // Assemble the WGSL shader
    let shader: ChainShader
    try {
      shader = generateChainSource(chainLayers)
    } catch (e) {
      return yield* Effect.fail(new GpuError({ message: "Shader generation failed", cause: e }))
    }

    // Pack uniforms from layer parameter values
    const uniforms = packUniforms(chain, shader)

    // Dispatch to the backend
    const backend = yield* GpuBackend
    return yield* backend.execute(shader, uniforms, srcBitmap, frame)
  })
}
