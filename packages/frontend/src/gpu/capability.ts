import { Effect, Schema } from 'effect'

/**
 * The result of probing for WebGPU at boot. `supported: true` means the
 * browser exposes `navigator.gpu` and returned a GPU adapter; `supported:
 * false` carries an optional `reason` (human-readable) for the failure.
 *
 * This is the single gate that decides whether the editor is reachable. The
 * root view renders an "unsupported" screen when `supported` is false, so a
 * no-WebGPU device gets a clear remediation message instead of a hard crash
 * (docs/adr/0001-rendering-engine). The GPU `GpuBackend` resource is built lazily, so it never
 * touches the device at boot — the only thing that dies on a missing GPU is
 * the edit screen, which we replace with that message.
 */
export const WebGpuCapability = Schema.Struct({
  supported: Schema.Boolean,
  reason: Schema.String,
})
export type WebGpuCapability = Schema.Schema.Type<typeof WebGpuCapability>

export const webGpuSupported: WebGpuCapability = { supported: true, reason: '' }

const unsupportedWebGpu = (reason: string): WebGpuCapability => ({ supported: false, reason })

/**
 * Probe for WebGPU once at boot. Never fails: any failure (no `navigator.gpu`,
 * `requestAdapter()` returning null, an unexpected throw) is folded into an
 * unsupported result with a reason string.
 */
export const detectWebGpu = Effect.gen(function* () {
  const result = yield* Effect.tryPromise({
    catch: (): { capability: WebGpuCapability; maxTextureDimension2D: number | null } =>
      ({ capability: unsupportedWebGpu('WebGPU probe threw an unexpected error.'), maxTextureDimension2D: null }),
    try: async (): Promise<{ capability: WebGpuCapability; maxTextureDimension2D: number | null }> => {
      if (navigator.gpu === undefined) {
        return {
          capability: unsupportedWebGpu(
            'navigator.gpu is undefined — this browser does not expose WebGPU.',
          ),
          maxTextureDimension2D: null,
        }
      }
      const adapter = await navigator.gpu.requestAdapter()
      if (adapter === null) {
        return {
          capability: unsupportedWebGpu('WebGPU is present but requestAdapter() returned no GPU adapter.'),
          maxTextureDimension2D: null,
        }
      }
      return {
        capability: webGpuSupported,
        maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
      }
    },
  })
  if (result.maxTextureDimension2D !== null) {
    // Diagnostic: probe uses default adapter, acquireGpu uses high-performance — they may differ.
    // Logged here so P1's requiredLimits change is observable without changing gating.
    yield* Effect.logDebug(
      `[WebGPU] probe maxTextureDimension2D=${result.maxTextureDimension2D}`,
    )
  }
  return result.capability
})
