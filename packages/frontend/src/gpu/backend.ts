import { Effect, Layer } from 'effect'
import { GpuBackend, GpuError, type ChainShader } from '@lutra/engine'

// Uncaptured WebGPU errors fire synchronously from the device event bus, at a
// moment where dispatching a new Effect fiber is the right escape hatch: the
// runtime is not on the stack, so route through the default runtime's
// background fork. Surfaces as a structured log line instead of console.
const logUncapturedError = (message: string): void => {
  void Effect.runFork(Effect.logError(`[WebGPU uncapturederror] ${message}`))
}

// ---- WebGPU device acquisition ----

/**
 * Acquire a GPUDevice once, held for the page's lifetime. Provided to the
 * app via `resources` in `makeApplication`, so every render Command's Effect
 * resolves `GpuBackend` against this same device.
 *
 * Acquisition failures are turned into defects (crash the app) so the
 * Layer's error channel is `never` — the runtime requires `Layer<_, never, never>`.
 */
const acquireDevice = Effect.gen(function* () {
  const adapter = yield* Effect.tryPromise({
    try: () => navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }),
    catch: (cause) => new GpuError({ message: 'No WebGPU adapter available', cause }),
  }).pipe(
    Effect.flatMap((adapter) =>
      adapter === null
        ? Effect.fail(new GpuError({ message: 'No WebGPU adapter available' }))
        : Effect.succeed(adapter),
    ),
  )
  const device = yield* Effect.tryPromise({
    try: () => adapter.requestDevice(),
    catch: (cause) => new GpuError({ message: 'Failed to acquire GPU device', cause }),
  })
  device.addEventListener('uncapturederror', (event) => {
    // Surface runtime shader errors. Uncaptured errors are the only signal
    // after a pipeline validates successfully, so they must not vanish.
    logUncapturedError(event.error.message)
  })
  return device
}).pipe(
  // Convert acquisition failures to defects so the Layer error channel is `never`.
  // The app genuinely cannot work without a GPU — crashing with a message is appropriate.
  Effect.catchCause((cause) => Effect.die(cause)),
)

// ---- pipeline cache (keyed by WGSL source) ----

interface CachedPipeline {
  readonly module: GPUShaderModule
  readonly pipeline: GPUComputePipeline
  readonly layout: GPUBindGroupLayout
  readonly hasParams: boolean
}

const roundUp = (n: number, to: number) => Math.ceil(n / to) * to

// ---- the live backend ----

export const GpuBackendLive = Layer.effect(
  GpuBackend,
  Effect.gen(function* () {
    const device = yield* acquireDevice
    const pipelineCache = new Map<string, CachedPipeline>()

    const getPipeline = (shader: ChainShader): CachedPipeline => {
      const cached = pipelineCache.get(shader.source)
      if (cached) return cached
      const module = device.createShaderModule({ code: shader.source })
      const pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module, entryPoint: 'main' },
      })
      const built = {
        module,
        pipeline,
        layout: pipeline.getBindGroupLayout(0),
        hasParams: shader.uniforms.length > 0,
      }
      pipelineCache.set(shader.source, built)
      return built
    }

    /** Copy a rgba8unorm storage texture back into an ImageBitmap. */
    const readBack = (dstTex: GPUTexture, width: number, height: number) =>
      Effect.gen(function* () {
        const bytesPerRowPadded = roundUp(width * 4, 256)
        const readBuffer = device.createBuffer({
          size: bytesPerRowPadded * height,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        })

        const encoder = device.createCommandEncoder()
        encoder.copyTextureToBuffer(
          { texture: dstTex, mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
          {
            buffer: readBuffer,
            offset: 0,
            bytesPerRow: bytesPerRowPadded,
            rowsPerImage: height,
          },
          { width, height, depthOrArrayLayers: 1 },
        )
        device.queue.submit([encoder.finish()])
        yield* Effect.tryPromise({
          try: () => readBuffer.mapAsync(GPUMapMode.READ),
          catch: (cause) => new GpuError({ message: 'Failed to map readback buffer', cause }),
        })

        const mapped = new Uint8Array(readBuffer.getMappedRange())
        // Un-pad rows into a dense RGBA buffer.
        const dense = new Uint8ClampedArray(width * height * 4)
        for (let y = 0; y < height; y++) {
          const srcOffset = y * bytesPerRowPadded
          const dstOffset = y * width * 4
          dense.set(mapped.subarray(srcOffset, srcOffset + width * 4), dstOffset)
        }
        readBuffer.unmap()
        readBuffer.destroy()

        const imageData = new ImageData(dense, width, height)
        return yield* Effect.tryPromise({
          try: () => createImageBitmap(imageData),
          catch: (cause) => new GpuError({ message: 'Failed to create ImageBitmap', cause }),
        })
      })

    return GpuBackend.of({
      execute: (shader, uniforms, srcBitmap, frame) =>
        Effect.gen(function* () {
          const width = srcBitmap.width
          const height = srcBitmap.height
          if (width === 0 || height === 0) {
            return yield* Effect.fail(new GpuError({ message: 'Empty source bitmap' }))
          }

          const { pipeline, layout, hasParams } = getPipeline(shader)

          // Source texture (rgba8unorm, texture binding).
          const srcTex = device.createTexture({
            size: { width, height, depthOrArrayLayers: 1 },
            format: 'rgba8unorm',
            usage:
              GPUTextureUsage.TEXTURE_BINDING |
              GPUTextureUsage.COPY_DST |
              GPUTextureUsage.RENDER_ATTACHMENT,
          })
          device.queue.copyExternalImageToTexture(
            { source: srcBitmap, flipY: false },
            { texture: srcTex },
            { width, height, depthOrArrayLayers: 1 },
          )

          // Destination storage texture (rgba8unorm, write).
          const dstTex = device.createTexture({
            size: { width, height, depthOrArrayLayers: 1 },
            format: 'rgba8unorm',
            usage:
              GPUTextureUsage.STORAGE_BINDING |
              GPUTextureUsage.COPY_SRC |
              GPUTextureUsage.RENDER_ATTACHMENT,
          })

          // Uniform buffers.
          const resolutionBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          })
          device.queue.writeBuffer(resolutionBuffer, 0, new Float32Array([width, height]))

          const frameBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          })
          device.queue.writeBuffer(
            frameBuffer,
            0,
            new Uint32Array([frame >>> 0]),
          )

          // Tracked alongside `entries` so it can be destroyed deterministically.
          let paramsBuffer: GPUBuffer | null = null

          const entries: Array<GPUBindGroupEntry> = [
            { binding: 0, resource: srcTex.createView() },
            { binding: 1, resource: dstTex.createView() },
            { binding: 2, resource: { buffer: resolutionBuffer } },
            { binding: 3, resource: { buffer: frameBuffer } },
          ]

          if (hasParams) {
            const paramsSize = roundUp(uniforms.length * 4, 16)
            paramsBuffer = device.createBuffer({
              size: paramsSize,
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            })
            // Pad to 4 floats so writeBuffer's byteLength matches the allocation.
            const paramsData = new Float32Array(roundUp(uniforms.length, 4))
            paramsData.set(uniforms)
            device.queue.writeBuffer(paramsBuffer, 0, paramsData)
            entries.push({ binding: 4, resource: { buffer: paramsBuffer } })
          }

          const bindGroup = device.createBindGroup({ layout, entries })

          const encoder = device.createCommandEncoder()
          const pass = encoder.beginComputePass()
          pass.setPipeline(pipeline)
          pass.setBindGroup(0, bindGroup)
          const workX = Math.ceil(width / 8)
          const workY = Math.ceil(height / 8)
          pass.dispatchWorkgroups(workX, workY, 1)
          pass.end()
          device.queue.submit([encoder.finish()])

          // Read back — errors throw for any subsequent copy/test failures so
          // we won't lose errors quietly on the returned path.

          const bitmap = yield* readBack(dstTex, width, height)

          srcTex.destroy()
          dstTex.destroy()
          resolutionBuffer.destroy()
          frameBuffer.destroy()
          paramsBuffer?.destroy()

          return bitmap
        }),
    })
  }),
)
