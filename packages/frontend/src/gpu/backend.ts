import { Context, Effect, Layer, Option, Ref } from 'effect'
import { GpuError, WORKGROUP_SIZE, type ChainPass, type LutCube, type RenderRequest } from '@lutra/engine'

// ---- service ----

/**
 * A handle to the frame a render produced: the output storage texture plus
 * its dimensions. `execute` returns one per render; it flows through the app
 * (RenderedFrame message → model) so `snapshot` never reads an implicit
 * "last session" — export snapshots exactly the frame it was handed.
 */
export class RenderHandle {
  constructor(
    readonly dstTex: GPUTexture,
    readonly width: number,
    readonly height: number,
  ) {}
}

export interface GpuBackendShape {
  /**
   * Execute a render request: run the chain compute shader over the source
   * image, then blit the result straight onto the given canvas. The image
   * never leaves the GPU — no readback on the display path. Resolves with a
   * `RenderHandle` when the submitted GPU work has completed, so callers can
   * coalesce renders (one in flight at a time) without a CPU stall.
   */
  readonly execute: (
    request: RenderRequest,
    canvas: HTMLCanvasElement,
  ) => Effect.Effect<RenderHandle, GpuError>
  /**
   * Read the frame identified by `handle` back to the CPU as `ImageData`.
   * Used only by export (encoding needs CPU pixels); never on the display
   * path. The ImageData's buffer is transferable, so the encode worker
   * receives it without a copy.
   */
  readonly snapshot: (handle: RenderHandle) => Effect.Effect<ImageData, GpuError>
}

export class GpuBackend extends Context.Service<GpuBackend, GpuBackendShape>()(
  'GpuBackend',
) {}

// Uncaptured WebGPU errors fire synchronously from the device event bus, at a
// moment where dispatching a new Effect fiber is the right escape hatch: the
// runtime is not on the stack, so route through the default runtime's
// background fork. Surfaces as a structured log line instead of console.

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
    // Background-fork the log: the event bus fires outside the Effect
    // runtime's stack, so a raw Effect call here would be lost.
    void Effect.runFork(Effect.logError(`[WebGPU uncapturederror] ${event.error.message}`))
  })
  return device
}).pipe(
  // Convert acquisition failures to defects so the Layer error channel is `never`.
  // The app genuinely cannot work without a GPU — crashing with a message is appropriate.
  Effect.catchTag('GpuError', (cause: GpuError) => Effect.die(cause)),
)

// ---- presentation pass ----

/**
 * Fullscreen-triangle blit: samples the processed storage texture with
 * bilinear filtering and writes it into the canvas swapchain texture. The
 * triangle covers the viewport with no vertex buffer (positions derived from
 * `vertex_index`).
 *
 * Fragment `@builtin(position)` is in framebuffer pixels with the origin at
 * the top-left and y pointing down — the same orientation as the compute
 * dstTex, so no flip is needed.
 */
const BLIT_SOURCE = `
@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> u_resolution: vec2<f32>;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );
  return vec4<f32>(pos[vi], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = pos.xy / u_resolution;
  return textureSample(srcTex, samp, uv);
}
`

const roundUp = (n: number, to: number) => Math.ceil(n / to) * to

// ---- the live backend ----

interface ComputeEntry {
  readonly paramsBuffer: GPUBuffer | null
  readonly bindGroup: GPUBindGroup
  readonly pipeline: GPUComputePipeline
}

/**
 * Image-scoped resources. Rebuilt when the image (or canvas) changes; the
 * source bitmap upload and every texture/buffer allocation happen once per
 * image, not once per render. A slider tick is then a few buffer writes +
 * one dispatch per pass + one submit.
 */
interface Session {
  readonly canvas: HTMLCanvasElement
  readonly ctx: GPUCanvasContext
  readonly width: number
  readonly height: number
  readonly srcTex: GPUTexture
  readonly dstTex: GPUTexture
  /**
   * Ping-pong linear-light rgba16float intermediates. Layer passes read
   * the previous pass's output and write the next; only the final pass
   * writes dstTex (sRGB-encoded rgba8unorm).
   */
  readonly intermediates: [GPUTexture, GPUTexture]
  readonly resolutionBuffer: GPUBuffer
  readonly frameBuffer: GPUBuffer
  readonly blitGroup: GPUBindGroup
  /** Per-pass-source params buffer + compute bind group (both reference session resources). */
  readonly compute: Record<string, ComputeEntry>
}

/**
 * All mutable state lives in Refs scoped to this Layer instance — no module
 * globals, so a rebuilt Layer (test, HMR, a second app instance) starts
 * fresh. The Ref contents:
 *
 * - `sessionRef`: the current image session (canvas + textures). Written by
 *   `ensureSession`, read by `execute`; `snapshot` no longer reaches into
 *   the backend for "the last frame" — it reads the handle `execute`
 *   returned and the app passed along.
 * - `pipelineCache`: compute pipelines keyed by pass source (finite: one
 *   entry per distinct chain layout).
 * - `lutTextures`: uploaded LUT cubes keyed by lutId. A cube is a property
 *   of the layer, not of the image, so entries survive session teardown;
 *   bounded by the vendored catalog.
 */
export const GpuBackendLive = Layer.effect(
  GpuBackend,
  Effect.gen(function* () {
    const device = yield* acquireDevice

    const sessionRef = yield* Ref.make<Option.Option<Session>>(Option.none())
    const pipelineCacheRef = yield* Ref.make<
      Record<string, { readonly pipeline: GPUComputePipeline; readonly layout: GPUBindGroupLayout }>
    >({})
    const lutTexturesRef = yield* Ref.make(new Map<string, GPUTexture>())

    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' })

    const blitModule = device.createShaderModule({ code: BLIT_SOURCE })
    const swapFormat = navigator.gpu.getPreferredCanvasFormat()
    const blitPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: blitModule, entryPoint: 'vs' },
      fragment: {
        module: blitModule,
        entryPoint: 'fs',
        targets: [{ format: swapFormat }],
      },
      primitive: { topology: 'triangle-list' },
    })

    // Device-scoped LUT texture cache: a cube uploads once per lutId and
    // survives image changes (session teardown), because the cube is a
    // property of the layer, not of the image.
    const ensureLutTexture = (lutId: string, cube: LutCube): Effect.Effect<GPUTexture, GpuError> =>
      Effect.gen(function* () {
        const cached = yield* Ref.get(lutTexturesRef).pipe(Effect.map((cache) => cache.get(lutId)))
        if (cached) return cached

        const { size, data } = cube
        // The cube is rgba32float: it matches the Float32Array upload exactly
        // (16 bytes/texel, no conversion). Chrome's writeTexture f32→f16
        // conversion is broken (raw f32 bytes land verbatim in f16 textures,
        // corrupting rows), so rgba16float is not an option. 32-bit float
        // textures are not filterable in WebGPU — the shader body does its
        // own trilinear via textureLoad instead of hardware sampling.
        // dimension MUST be '3d': without it the texture defaults to a 2D
        // array (13 layers), which cannot be read as texture_3d and fails
        // bind-group validation at runtime.
        const tex = device.createTexture({
          size: { width: size, height: size, depthOrArrayLayers: size },
          dimension: '3d',
          format: 'rgba32float',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        })

        // Stride the size³×3 cube into size³×4 texels (alpha = 1).
        const texels = new Float32Array(size * size * size * 4)
        for (let i = 0; i < size * size * size; i++) {
          texels[i * 4] = data[i * 3]!
          texels[i * 4 + 1] = data[i * 3 + 1]!
          texels[i * 4 + 2] = data[i * 3 + 2]!
          texels[i * 4 + 3] = 1
        }
        device.queue.writeTexture(
          { texture: tex },
          texels,
          { bytesPerRow: size * 4 * 4, rowsPerImage: size },
          { width: size, height: size, depthOrArrayLayers: size },
        )

        yield* Ref.update(lutTexturesRef, (cache) => {
          const next = new Map(cache)
          next.set(lutId, tex)
          return next
        })
        return tex
      })

    const destroySession = (s: Session): void => {
      s.srcTex.destroy()
      s.dstTex.destroy()
      s.intermediates[0].destroy()
      s.intermediates[1].destroy()
      s.resolutionBuffer.destroy()
      s.frameBuffer.destroy()
      for (const entry of Object.values(s.compute)) {
        entry.paramsBuffer?.destroy()
      }
    }

    /**
     * Allocate every image-scoped resource for one canvas+image pair. Throws
     * `GpuError` when the canvas has no WebGPU context; device calls may
     * throw raw exceptions, which `ensureSession` wraps.
     */
    const buildSession = (
      canvas: HTMLCanvasElement,
      width: number,
      height: number,
      srcBitmap: ImageBitmap,
    ): Session => {
      const ctx = canvas.getContext('webgpu')
      if (!ctx) {
        throw new GpuError({ message: 'WebGPU canvas context unavailable' })
      }
      ctx.configure({
        device,
        format: swapFormat,
        alphaMode: 'opaque',
      })

      // Source texture: uploaded once per image. Never re-uploaded per render.
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

      // Destination storage texture: the final compute pass writes it (sRGB),
      // the blit samples it, and export copies it back to the CPU.
      const dstTex = device.createTexture({
        size: { width, height, depthOrArrayLayers: 1 },
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_SRC,
      })

      // Ping-pong linear-light intermediates (rgba16float so multi-pass
      // grading doesn't band like 8-bit would). Pass i reads the previous
      // pass's output and writes the other.
      const makeIntermediate = (): GPUTexture =>
        device.createTexture({
          size: { width, height, depthOrArrayLayers: 1 },
          format: 'rgba16float',
          usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        })
      const intermediates: [GPUTexture, GPUTexture] = [makeIntermediate(), makeIntermediate()]

      // Uniform buffers. `u_resolution` is written once; `u_frame` is
      // rewritten every render (grain animates).
      const resolutionBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })
      device.queue.writeBuffer(resolutionBuffer, 0, new Float32Array([width, height]))
      const frameBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })

      const blitGroup = device.createBindGroup({
        layout: blitPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: dstTex.createView() },
          { binding: 1, resource: sampler },
          { binding: 2, resource: { buffer: resolutionBuffer } },
        ],
      })

      return {
        canvas,
        ctx,
        width,
        height,
        srcTex,
        dstTex,
        intermediates,
        resolutionBuffer,
        frameBuffer,
        blitGroup,
        compute: {},
      }
    }

    /**
     * Get the session for a canvas+image, rebuilding it when the canvas or
     * dimensions change (destroying the previous session's resources). The
     * session lives in `sessionRef`; a failed rebuild leaves the ref empty
     * rather than pointing at half-destroyed resources.
     */
    const ensureSession = (
      canvas: HTMLCanvasElement,
      width: number,
      height: number,
      srcBitmap: ImageBitmap,
    ): Effect.Effect<Session, GpuError> =>
      Effect.gen(function* () {
        const current = yield* Ref.get(sessionRef)
        if (
          Option.isSome(current) &&
          current.value.canvas === canvas &&
          current.value.width === width &&
          current.value.height === height
        ) {
          return current.value
        }
        if (Option.isSome(current)) {
          destroySession(current.value)
          yield* Ref.set(sessionRef, Option.none())
        }
        const s = yield* Effect.try({
          try: () => buildSession(canvas, width, height, srcBitmap),
          catch: (cause) =>
            cause instanceof GpuError
              ? cause
              : new GpuError({ message: 'Failed to prepare canvas', cause }),
        })
        yield* Ref.set(sessionRef, Option.some(s))
        return s
      })

    /**
     * Get (or lazily create) the pipeline + bind group for one compute pass.
     * Cached per pass source; within a session the same pass source always
     * binds the same src/dst pair, because the pass's position in the chain
     * is fixed and its source encodes linearize/encode/dstFormat, which pin
     * it to that position. LUT passes vary the bound 3D texture with the
     * layer's lutId, so their cache key includes it.
     */
    const getCompute = (
      s: Session,
      pass: ChainPass,
      src: GPUTexture,
      dst: GPUTexture,
      luts: ReadonlyMap<string, LutCube>,
    ): Effect.Effect<ComputeEntry, GpuError> =>
      Effect.gen(function* () {
        const cacheKey = pass.lutId !== undefined ? `${pass.source}::lut:${pass.lutId}` : pass.source
        const cached = s.compute[cacheKey]
        if (cached) return cached

        const pipelines = yield* Ref.get(pipelineCacheRef)
        const cachedPipeline = pipelines[pass.source]
        let compiled = cachedPipeline
        if (!compiled) {
          const module = device.createShaderModule({ code: pass.source })
          const pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module, entryPoint: 'main' },
          })
          const built = {
            pipeline,
            layout: pipeline.getBindGroupLayout(0),
          }
          yield* Ref.update(pipelineCacheRef, (cache) => ({ ...cache, [pass.source]: built }))
          compiled = built
        }

        const hasParams = pass.uniforms.length > 0
        const paramsBuffer = hasParams
          ? device.createBuffer({
              size: roundUp(pass.uniforms.length * 4, 16),
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            })
          : null

        // With `layout: 'auto'` the pipeline only exposes bindings the shader
        // statically uses: binding 3 (frame) exists only when this pass reads
        // `u_frame` (currently grain), binding 4 (params) only when there
        // are uniform slots, binding 5 (sampler) when the pass samples, and
        // binding 6 (the 3D LUT texture) only for LUT passes. Entries must
        // mirror that.
        const entries: Array<GPUBindGroupEntry> = [
          { binding: 0, resource: src.createView() },
          { binding: 1, resource: dst.createView() },
          { binding: 2, resource: { buffer: s.resolutionBuffer } },
        ]
        if (pass.usesFrame) {
          entries.push({ binding: 3, resource: { buffer: s.frameBuffer } })
        }
        if (paramsBuffer) {
          entries.push({ binding: 4, resource: { buffer: paramsBuffer } })
        }
        if (pass.usesSampler) {
          entries.push({ binding: 5, resource: sampler })
        }
        if (pass.lutId !== undefined) {
          const cube = luts.get(pass.lutId)
          if (!cube) {
            return yield* Effect.fail(new GpuError({ message: `LUT cube missing for ${pass.lutId}` }))
          }
          // The view dimension must be explicit: createView() on a 3D
          // texture defaults to e2DArray in Chrome, which fails bind-group
          // validation against the shader's texture_3d (viewDimension e3D).
          const lutTex = yield* ensureLutTexture(pass.lutId, cube)
          entries.push({
            binding: 6,
            resource: lutTex.createView({ dimension: '3d' }),
          })
        }

        const bindGroup = device.createBindGroup({ layout: compiled.layout, entries })
        const entry: ComputeEntry = { paramsBuffer, bindGroup, pipeline: compiled.pipeline }
        s.compute[cacheKey] = entry
        return entry
      })

    return GpuBackend.of({
      execute: (request, canvas) =>
        Effect.gen(function* () {
          const width = request.srcBitmap.width
          const height = request.srcBitmap.height
          if (width === 0 || height === 0) {
            return yield* Effect.fail(new GpuError({ message: 'Empty source bitmap' }))
          }

          const s = yield* ensureSession(canvas, width, height, request.srcBitmap)

          const passes = request.shader.passes

          // Cheap per-tick updates: repack each pass's params buffer and the
          // frame counter once, then dispatch every pass. No allocations, no
          // texture churn.
          if (request.shader.usesFrame) {
            device.queue.writeBuffer(s.frameBuffer, 0, new Uint32Array([request.frame >>> 0]))
          }

          const encoder = device.createCommandEncoder()

          // Pass 1..N: each layer runs as its own compute pass. Pass 0 reads
          // the sRGB source (or the linearize pass output); every later pass
          // reads the previous pass's output through the ping-pong
          // intermediates; the last pass writes the sRGB-encoded dstTex.
          for (let i = 0; i < passes.length; i++) {
            const pass = passes[i]!
            const src = i === 0 ? s.srcTex : s.intermediates[(i - 1) % 2]!
            const dst = i === passes.length - 1 ? s.dstTex : s.intermediates[i % 2]!
            const { paramsBuffer, bindGroup, pipeline } = yield* getCompute(
              s,
              pass,
              src,
              dst,
              request.luts,
            )

            if (paramsBuffer) {
              const paramsData = new Float32Array(roundUp(request.uniforms[i]!.length, 4))
              paramsData.set(request.uniforms[i]!)
              device.queue.writeBuffer(paramsBuffer, 0, paramsData)
            }

            const computePass = encoder.beginComputePass()
            computePass.setPipeline(pipeline)
            computePass.setBindGroup(0, bindGroup)
            computePass.dispatchWorkgroups(
              Math.ceil(width / WORKGROUP_SIZE),
              Math.ceil(height / WORKGROUP_SIZE),
              1,
            )
            computePass.end()
          }

          // Pass 2: blit dstTex onto the canvas swapchain texture.
          const canvasTexture = s.ctx.getCurrentTexture()
          const renderPass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: canvasTexture.createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear',
                storeOp: 'store',
              },
            ],
          })
          renderPass.setPipeline(blitPipeline)
          renderPass.setBindGroup(0, s.blitGroup)
          renderPass.draw(3, 1, 0, 0)
          renderPass.end()

          device.queue.submit([encoder.finish()])

          // Resolve only when the GPU has caught up — lets the caller keep at
          // most one render in flight (no CPU stall; this is a promise).
          yield* Effect.tryPromise({
            try: () => device.queue.onSubmittedWorkDone(),
            catch: (cause) => new GpuError({ message: 'GPU work failed', cause }),
          })

          return new RenderHandle(s.dstTex, s.width, s.height)
        }).pipe(
          // Any unexpected exception (bind group/layout mismatch, browser-
          // specific WGSL rejection) must surface as a GpuError. Without
          // this, a defect escapes the command's catchTag and renderPending
          // stays true forever — the app silently stops rendering.
          Effect.catchDefect((cause: unknown) =>
            Effect.fail(new GpuError({ message: 'Unexpected GPU error', cause })),
          ),
        ),

      snapshot: (handle) =>
        Effect.gen(function* () {
          const { dstTex, width, height } = handle

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
          return imageData
        }),
    })
  }),
)
