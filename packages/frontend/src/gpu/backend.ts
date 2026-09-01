import { Context, Effect, Layer, Option, Ref } from 'effect'
import { GpuError, WORKGROUP_SIZE } from '@lutra/engine'
import type { ChainPass, LutCube, RenderRequest } from '@lutra/engine'
import { HISTOGRAM_BINS, HistogramRing, makeSlot } from './histogram-ring'
import type { HistogramSlot } from './histogram-ring'
import { presentModeToWgsl } from './present-mode'
import type { ComparePresent } from './present-mode'
import { descriptorCacheKey, pipelineCacheKey, toPassDescriptor } from './pass-descriptor'

export type { ComparePresent } from './present-mode'

export class RenderHandle {
  constructor(
    readonly dstTex: GPUTexture,
    readonly width: number,
    readonly height: number,
    readonly readback: HistogramSlot,
  ) {}
}

interface GpuContext {
  readonly device: GPUDevice
  readonly sampler: GPUSampler
  readonly swapFormat: GPUTextureFormat
  readonly blitPipeline: GPURenderPipeline
  readonly histogramPipeline: GPUComputePipeline
}

export interface GpuBackendContract {
  /**
   * Execute a render request: run the chain compute shader over the source
   * image, then blit the result straight onto the given canvas. The image
   * never leaves the GPU — no readback on the display path. Resolves with a
   * `RenderHandle` when the submitted GPU work has completed, so callers can
   * coalesce renders (one in flight at a time) without a CPU stall. The
   * final blit applies the given compare presentation state.
   */
  readonly execute: (
    request: RenderRequest,
    canvas: HTMLCanvasElement,
    present: ComparePresent,
  ) => Effect.Effect<RenderHandle, GpuError>
  /**
   * Re-present the last rendered frame with a new compare presentation state
   * — a blit-only pass that never re-runs the chain (docs/adr/0010-editor-ui). The
   * only GPU work is one fullscreen triangle, so divider drags and mode
   * flips stay cheap on large images. No-op when no frame has rendered for
   * the canvas yet.
   */
  readonly present: (
    canvas: HTMLCanvasElement,
    present: ComparePresent,
  ) => Effect.Effect<void, GpuError>
  /**
   * Read the frame identified by `handle` back to the CPU as `ImageData`.
   * Used only by export (encoding needs CPU pixels); never on the display
   * path. The ImageData's buffer is transferable, so the encode worker
   * receives it without a copy.
   */
  readonly snapshot: (handle: RenderHandle) => Effect.Effect<ImageData, GpuError>
  /**
   * Read the histogram bins of the frame identified by `handle` back to the
   * CPU (256 u32 Rec.709 luma counts). The only readback on the display
   * path, and a scoped one: 1KB of aggregate statistics, never the frame.
   * The map was already issued by `execute` once the frame's submit
   * completed, so this never waits on the render queue. Consumes the
   * handle's readback slot (map → read → unmap), freeing it for the ring.
   */
  readonly readHistogram: (
    handle: RenderHandle,
  ) => Effect.Effect<Uint32Array<ArrayBuffer>, GpuError>
}

export class GpuBackend extends Context.Service<GpuBackend, GpuBackendContract>()('GpuBackend') {}

/**
 * Fullscreen-triangle blit: samples the processed storage texture with
 * bilinear filtering and writes it into the canvas swapchain texture. The
 * triangle covers the viewport with no vertex buffer (positions derived from
 * `vertex_index`).
 *
 * Fragment `@builtin(position)` is in framebuffer pixels with the origin at
 * the top-left and y pointing down — the same orientation as the compute
 * dstTex, so no flip is needed.
 *
 * Compare presentation (docs/adr/0010-editor-ui): the blit samples the display texture
 * (dstTex) or the source image (srcTex) per `u_present` — mode 0 graded,
 * 1 source (Toggle showing before), 2 Split (source left of the divider,
 * graded right), 3 Side by side (source in the left half, graded in the
 * right). `u_canvas` is the canvas drawing-buffer size the uv derivation
 * needs — it equals the image size except in Side by side, where the canvas
 * is 2× the image width so both halves show at native resolution (the
 * session is rebuilt on the size change). The divider and the halves live in
 * image space and pan/zoom with the photo.
 */
const BLIT_SOURCE = `
@group(0) @binding(0) var dstTex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(3) var srcTex: texture_2d<f32>;
@group(0) @binding(4) var<uniform> u_present: vec4<f32>;
@group(0) @binding(5) var<uniform> u_canvas: vec2<f32>;

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
  let uv = pos.xy / u_canvas;
  let mode = u_present.x;
  let splitAt = u_present.y;
  if (mode == 3.0) {
    // flow — textureSample must not be called from flow that depends on
    let left = textureSample(srcTex, samp, vec2<f32>(uv.x * 2.0, uv.y));
    let right = textureSample(dstTex, samp, vec2<f32>(uv.x * 2.0 - 1.0, uv.y));
    return select(right, left, uv.x < 0.5);
  }
  if (mode == 2.0) {
    return select(
      textureSample(dstTex, samp, uv),
      textureSample(srcTex, samp, uv),
      uv.x < splitAt,
    );
  }
  if (mode == 1.0) {
    return textureSample(srcTex, samp, uv);
  }
  return textureSample(dstTex, samp, uv);
}
`

const roundUp = (n: number, to: number) => Math.ceil(n / to) * to

/**
 * Scatter-write histogram pass: bins the Rec.709 luma of every texel of the
 * final display texture (sRGB-encoded rgba8unorm) into 256 atomic u32 bins.
 * Full-resolution — every pixel counted exactly once, so clipping and
 * specular peaks are never averaged away by a reduction. Reads dstTex as a
 * plain texture (binding 0), writes the session's bins accumulator
 * (binding 1).
 */
const HISTOGRAM_SOURCE = `
@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> bins: array<atomic<u32>, 256>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let size = textureDimensions(srcTex);
  if (gid.x >= size.x || gid.y >= size.y) {
    return;
  }
  let color = textureLoad(srcTex, vec2<i32>(gid.xy), 0);
  let luma = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let bin = min(u32(luma * 256.0), 255u);
  atomicAdd(&bins[bin], 1u);
}
`

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
  /**
   * The canvas drawing-buffer size the swapchain was configured at. Equals
   * the image size except in Side by side, where the canvas is 2× the image
   * width (both halves at native resolution); the blit derives its uv from
   * these via `u_canvas`. A change here (a compare-mode toggle) follows the
   * resize in place — the swapchain re-configures and `u_canvas` is
   * rewritten, but no image-sized resource is touched (the graded frame
   * survives).
   */
  canvasWidth: number
  canvasHeight: number
  /**
   * The uploaded source bitmap, retained so `present` can rebuild the
   * session when the canvas size changes (a Side by side toggle) without
   * the original render request.
   */
  readonly srcBitmap: ImageBitmap
  readonly srcTex: GPUTexture
  readonly dstTex: GPUTexture
  /**
   * Ping-pong linear-light rgba16float intermediates. Layer passes read
   * the previous pass's output and write the next; only the final pass
   * writes dstTex (sRGB-encoded rgba8unorm). Lazily allocated —
   * null for passthrough/single-pass chains where the source goes
   * straight to dstTex, saving ~366 MiB on a 6k empty chain.
   */
  intermediates: [GPUTexture, GPUTexture] | null
  readonly resolutionBuffer: GPUBuffer
  /** Canvas-size uniform for the blit (u_canvas), written once at build. */
  readonly canvasSizeBuffer: GPUBuffer
  readonly frameBuffer: GPUBuffer
  /** Compare presentation uniform (mode + split position), written per blit. */
  readonly presentBuffer: GPUBuffer
  readonly blitGroup: GPUBindGroup
  /** Histogram bins accumulator (STORAGE | COPY_SRC) — the pass atomicAdds into this. */
  readonly binsBuffer: GPUBuffer
  /** 256 zeroes for the per-render accumulator reset (writeBuffer, 1KB). */
  readonly binsZeros: Uint32Array
  readonly histogramGroup: GPUBindGroup
  readonly histogramRing: HistogramRing
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
    const sessionRef = yield* Ref.make<Option.Option<Session>>(Option.none())
    const pipelineCacheRef = yield* Ref.make<
      Record<string, { readonly pipeline: GPUComputePipeline; readonly layout: GPUBindGroupLayout }>
    >({})
    const lutTexturesRef = yield* Ref.make(new Map<string, GPUTexture>())

    const gpuCtxRef = yield* Ref.make<Option.Option<GpuContext>>(Option.none())
    const acquireGpu = Effect.gen(function* () {
      const adapter = yield* Effect.tryPromise({
        catch: (cause) => new GpuError({ cause, message: 'No WebGPU adapter available' }),
        try: async () =>
          await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }),
      }).pipe(
        Effect.flatMap((adapter) =>
          adapter === null
            ? Effect.fail(new GpuError({ message: 'No WebGPU adapter available' }))
            : Effect.succeed(adapter),
        ),
      )
      const device = yield* Effect.tryPromise({
        catch: (cause) => new GpuError({ cause, message: 'Failed to acquire GPU device' }),
        try: async () =>
          await adapter.requestDevice({
            requiredLimits: {
              maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
            },
          }),
      })
      device.addEventListener('uncapturederror', (event) => {
        void Effect.runFork(Effect.logError(`[WebGPU uncapturederror] ${event.error.message}`))
      })
      // Dawn/WebGPU may lose the device on driver reset, OOM, or tab
      void device.lost.then((info) => {
        void Effect.runFork(
          Effect.gen(function* () {
            yield* Effect.logError(`[WebGPU] device lost: ${info.message} (reason: ${info.reason})`)
            const current = yield* Ref.get(sessionRef)
            if (Option.isSome(current)) {
              try {
                destroySession(current.value)
              } catch (cause) {
                yield* Effect.logDebug(`[WebGPU] destroy on lost failed: ${String(cause)}`)
              }
            }
            yield* Ref.set(sessionRef, Option.none())
            yield* Ref.set(gpuCtxRef, Option.none())
          }),
        )
      })
      const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' })
      const swapFormat = navigator.gpu.getPreferredCanvasFormat()
      const blitModule = device.createShaderModule({ code: BLIT_SOURCE })
      const blitPipeline = device.createRenderPipeline({
        fragment: {
          entryPoint: 'fs',
          module: blitModule,
          targets: [{ format: swapFormat }],
        },
        layout: 'auto',
        primitive: { topology: 'triangle-list' },
        vertex: { entryPoint: 'vs', module: blitModule },
      })
      const histogramModule = device.createShaderModule({ code: HISTOGRAM_SOURCE })
      const histogramPipeline = device.createComputePipeline({
        compute: { entryPoint: 'main', module: histogramModule },
        layout: 'auto',
      })
      return { device, sampler, swapFormat, blitPipeline, histogramPipeline } as const
    })
    const getGpu = Effect.gen(function* () {
      const cached = yield* Ref.get(gpuCtxRef)
      if (Option.isSome(cached)) {
        return cached.value
      }
      const ctx = yield* acquireGpu
      yield* Ref.set(gpuCtxRef, Option.some(ctx))
      return ctx
    })

    const ensureLutTexture = (
      device: GPUDevice,
      lutId: string,
      cube: LutCube,
    ): Effect.Effect<GPUTexture, GpuError> =>
      Effect.gen(function* () {
        const cached = yield* Ref.get(lutTexturesRef).pipe(Effect.map((cache) => cache.get(lutId)))
        if (cached) {
          return cached
        }

        const { size, data } = cube
        // (16 bytes/texel, no conversion). Chrome's writeTexture f32→f16
        // textures are not filterable in WebGPU — the shader body does its
        // own trilinear via textureLoad instead of hardware sampling.
        const tex = device.createTexture({
          dimension: '3d',
          format: 'rgba32float',
          size: { depthOrArrayLayers: size, height: size, width: size },
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        })

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
          { depthOrArrayLayers: size, height: size, width: size },
        )

        yield* Ref.update(lutTexturesRef, (cache) => {
          const next = new Map(cache)
          next.set(lutId, tex)
          return next
        })
        return tex
      })

    const destroySession = (s: Session): void => {
      try {
        s.srcBitmap.close()
      } catch (cause) {
        void Effect.runFork(Effect.logDebug(`[WebGPU] bitmap close skipped: ${String(cause)}`))
      }
      s.srcTex.destroy()
      s.dstTex.destroy()
      if (s.intermediates) {
        s.intermediates[0].destroy()
        s.intermediates[1].destroy()
      }
      s.resolutionBuffer.destroy()
      s.canvasSizeBuffer.destroy()
      s.frameBuffer.destroy()
      s.presentBuffer.destroy()
      s.binsBuffer.destroy()
      s.histogramRing.destroy()
      for (const entry of Object.values(s.compute)) {
        entry.paramsBuffer?.destroy()
      }
    }

    /**
     * Clamp the canvas drawing-buffer size to the device's
     * `maxTextureDimension2D` before any `configure` or `createTexture`.
     * The view already caps preview side-by-side to 4096, so this is a
     * defensive fallback — on a compat device (max 4096) a stale 12000-wide
     * canvas would otherwise fail validation. The clamp writes back to the
     * canvas attributes so the swapchain size matches the uniform.
     */
    const clampCanvasToDeviceLimits = (device: GPUDevice, canvas: HTMLCanvasElement): void => {
      const max = device.limits.maxTextureDimension2D
      const clampedW = Math.min(canvas.width, max)
      const clampedH = Math.min(canvas.height, max)
      if (clampedW !== canvas.width || clampedH !== canvas.height) {
        canvas.width = clampedW
        canvas.height = clampedH
      }
    }

    /**
     * Lazily allocate the ping-pong intermediates for a multi-pass chain
     * Called from `execute` when `passes.length > 1` and the session
     * was built without them; a passthrough / single-pass preview holds no
     * 16-bit textures until a second layer is added.
     */
    const ensureIntermediates = (device: GPUDevice, s: Session): void => {
      if (s.intermediates !== null) {
        return
      }
      const makeIntermediate = (): GPUTexture =>
        device.createTexture({
          format: 'rgba16float',
          size: { depthOrArrayLayers: 1, height: s.height, width: s.width },
          usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
        })
      s.intermediates = [makeIntermediate(), makeIntermediate()]
    }

    /**
     * Allocate every image-scoped resource for one canvas+image pair. Throws
     * `GpuError` when the canvas has no WebGPU context; device calls may
     * throw raw exceptions, which `ensureSession` wraps.
     * Transactional — on any throw, already-created GPU objects are
     * destroyed and no leaked session is left behind.
     */
    const buildSession = (
      gpu: GpuContext,
      canvas: HTMLCanvasElement,
      width: number,
      height: number,
      srcBitmap: ImageBitmap,
    ): Session => {
      const { device, sampler, swapFormat, blitPipeline, histogramPipeline } = gpu
      clampCanvasToDeviceLimits(device, canvas)
      const ctx = canvas.getContext('webgpu')
      if (!ctx) {
        throw new GpuError({ message: 'WebGPU canvas context unavailable' })
      }
      const owned: Array<{ destroy: () => void }> = []
      const track = <T extends { destroy: () => void }>(obj: T): T => {
        owned.push(obj)
        return obj
      }
      const cleanup = (): void => {
        for (const obj of owned.reverse()) {
          try {
            obj.destroy()
          } catch (cause) {
            void Effect.runFork(Effect.logDebug(`[WebGPU] cleanup destroy skipped: ${String(cause)}`))
          }
        }
      }
      try {
        ctx.configure({
          alphaMode: 'opaque',
          device,
          format: swapFormat,
        })

        const srcTex = track(
          device.createTexture({
            format: 'rgba8unorm',
            size: { depthOrArrayLayers: 1, height, width },
            usage:
              GPUTextureUsage.TEXTURE_BINDING |
              GPUTextureUsage.COPY_DST |
              GPUTextureUsage.RENDER_ATTACHMENT,
          }),
        )
        device.queue.copyExternalImageToTexture(
          { flipY: false, source: srcBitmap },
          { texture: srcTex },
          { depthOrArrayLayers: 1, height, width },
        )

        const dstTex = track(
          device.createTexture({
            format: 'rgba8unorm',
            size: { depthOrArrayLayers: 1, height, width },
            usage:
              GPUTextureUsage.STORAGE_BINDING |
              GPUTextureUsage.TEXTURE_BINDING |
              GPUTextureUsage.COPY_SRC,
          }),
        )

        const intermediates: [GPUTexture, GPUTexture] | null = null

        const resolutionBuffer = track(
          device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          }),
        )
        device.queue.writeBuffer(resolutionBuffer, 0, new Float32Array([width, height]))
        const canvasSizeBuffer = track(
          device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          }),
        )
        device.queue.writeBuffer(canvasSizeBuffer, 0, new Float32Array([canvas.width, canvas.height]))
        const frameBuffer = track(
          device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          }),
        )

        const presentBuffer = track(
          device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          }),
        )

        const blitGroup = device.createBindGroup({
          entries: [
            { binding: 0, resource: dstTex.createView() },
            { binding: 1, resource: sampler },
            { binding: 3, resource: srcTex.createView() },
            { binding: 4, resource: { buffer: presentBuffer } },
            { binding: 5, resource: { buffer: canvasSizeBuffer } },
          ],
          layout: blitPipeline.getBindGroupLayout(0),
        })

        // combine with STORAGE (WebGPU usage rules), so the bins cross back
        // reusable.
        const binsBuffer = track(
          device.createBuffer({
            size: HISTOGRAM_BINS * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
          }),
        )
        const histogramGroup = device.createBindGroup({
          entries: [
            { binding: 0, resource: dstTex.createView() },
            { binding: 1, resource: { buffer: binsBuffer } },
          ],
          layout: histogramPipeline.getBindGroupLayout(0),
        })
        const histogramRing = new HistogramRing([
          makeSlot(
            track(
              device.createBuffer({
                size: HISTOGRAM_BINS * 4,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
              }),
            ),
          ),
          makeSlot(
            track(
              device.createBuffer({
                size: HISTOGRAM_BINS * 4,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
              }),
            ),
          ),
          makeSlot(
            track(
              device.createBuffer({
                size: HISTOGRAM_BINS * 4,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
              }),
            ),
          ),
        ] as const)

        return {
          binsBuffer,
          binsZeros: new Uint32Array(HISTOGRAM_BINS),
          blitGroup,
          canvas,
          canvasHeight: canvas.height,
          canvasSizeBuffer,
          canvasWidth: canvas.width,
          compute: {},
          ctx,
          dstTex,
          frameBuffer,
          height,
          histogramGroup,
          histogramRing,
          intermediates,
          presentBuffer,
          resolutionBuffer,
          srcBitmap,
          srcTex,
          width,
        }
      } catch (cause) {
        cleanup()
        throw cause instanceof GpuError
          ? cause
          : new GpuError({ cause, message: 'Failed to prepare canvas' })
      }
    }

    /**
     * Follow a canvas drawing-buffer resize in place: re-configure the
     * swapchain (the drawing buffer size is captured at configure time) and
     * rewrite the blit's `u_canvas` uniform. Nothing image-sized changes —
     * `srcTex`, `dstTex`, and the intermediates keep their contents, so the
     * last rendered frame re-presents instead of a blank texture.
     */
    const resizeCanvas = (gpu: GpuContext, s: Session): void => {
      const { device, swapFormat } = gpu
      clampCanvasToDeviceLimits(device, s.canvas)
      s.ctx.configure({ alphaMode: 'opaque', device, format: swapFormat })
      device.queue.writeBuffer(
        s.canvasSizeBuffer,
        0,
        new Float32Array([s.canvas.width, s.canvas.height]),
      )
      s.canvasWidth = s.canvas.width
      s.canvasHeight = s.canvas.height
    }

    /**
     * Get the session for a canvas+image. Rebuilds only when the canvas
     * element, the image dimensions, or the source bitmap change; a canvas
     * drawing-buffer size change alone (a Side by side toggle doubles the
     * canvas width) is followed in place by `resizeCanvas`, preserving the
     * rendered frame. The session lives in `sessionRef`; a failed rebuild
     * leaves the ref empty rather than pointing at half-destroyed
     * resources.
     */
    const ensureSession = (
      gpu: GpuContext,
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
          current.value.height === height &&
          current.value.srcBitmap === srcBitmap
        ) {
          if (
            current.value.canvasWidth !== canvas.width ||
            current.value.canvasHeight !== canvas.height
          ) {
            resizeCanvas(gpu, current.value)
          }
          return current.value
        }
        const s = yield* Effect.try({
          catch: (cause) =>
            cause instanceof GpuError
              ? cause
              : new GpuError({ cause, message: 'Failed to prepare canvas' }),
          try: () => buildSession(gpu, canvas, width, height, srcBitmap),
        })
        if (Option.isSome(current)) {
          destroySession(current.value)
        }
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
      gpu: GpuContext,
      s: Session,
      pass: ChainPass,
      src: GPUTexture,
      dst: GPUTexture,
      luts: ReadonlyMap<string, LutCube>,
    ): Effect.Effect<ComputeEntry, GpuError> =>
      Effect.gen(function* () {
        const { device, sampler } = gpu
        const descriptor = toPassDescriptor(pass)
        const cacheKey = descriptorCacheKey(descriptor)
        const cached = s.compute[cacheKey]
        if (cached) {
          return cached
        }

        const pipelines = yield* Ref.get(pipelineCacheRef)
        const cachedPipeline = pipelines[pipelineCacheKey(descriptor)]
        let compiled = cachedPipeline
        if (!compiled) {
          const module = device.createShaderModule({ code: descriptor.source })
          const pipeline = device.createComputePipeline({
            compute: { entryPoint: 'main', module },
            layout: 'auto',
          })
          const built = {
            layout: pipeline.getBindGroupLayout(0),
            pipeline,
          }
          yield* Ref.update(pipelineCacheRef, (cache) => ({
            ...cache,
            [pipelineCacheKey(descriptor)]: built,
          }))
          compiled = built
        }

        const paramsBuffer = descriptor.hasParams
          ? device.createBuffer({
              size: roundUp(pass.uniforms.length * 4, 16),
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            })
          : null

        const entries: GPUBindGroupEntry[] = [
          { binding: 0, resource: src.createView() },
          { binding: 1, resource: dst.createView() },
          { binding: 2, resource: { buffer: s.resolutionBuffer } },
        ]
        if (descriptor.usesFrame) {
          entries.push({ binding: 3, resource: { buffer: s.frameBuffer } })
        }
        if (paramsBuffer) {
          entries.push({ binding: 4, resource: { buffer: paramsBuffer } })
        }
        if (descriptor.usesSampler) {
          entries.push({ binding: 5, resource: sampler })
        }
        if (descriptor.lutId !== undefined) {
          const cube = luts.get(descriptor.lutId)
          if (!cube) {
            return yield* Effect.fail(
              new GpuError({ message: `LUT cube missing for ${descriptor.lutId}` }),
            )
          }
          const lutTex = yield* ensureLutTexture(device, descriptor.lutId, cube)
          entries.push({
            binding: 6,
            resource: lutTex.createView({ dimension: '3d' }),
          })
        }

        const bindGroup = device.createBindGroup({ entries, layout: compiled.layout })
        const entry: ComputeEntry = { bindGroup, paramsBuffer, pipeline: compiled.pipeline }
        s.compute[cacheKey] = entry
        return entry
      })

    /**
     * Present the session's display texture onto the canvas swapchain,
     * applying the compare presentation state (docs/adr/0010-editor-ui). The only GPU
     * work is one fullscreen triangle — presentation changes (mode flip,
     * divider drag) never touch the chain compute output, so they cost a
     * blit, not a re-render. Shared by `execute` (the render's final blit)
     * and `present` (the blit-only re-present).
     */
    const blit = (
      device: GPUDevice,
      blitPipeline: GPURenderPipeline,
      swapFormat: GPUTextureFormat,
      encoder: GPUCommandEncoder,
      s: Session,
      present: ComparePresent,
    ): void => {
      const wgslMode = presentModeToWgsl(present)
      device.queue.writeBuffer(
        s.presentBuffer,
        0,
        new Float32Array([wgslMode, present.splitAt, 0, 0]),
      )
      const canvasTexture = s.ctx.getCurrentTexture()
      const renderPass = encoder.beginRenderPass({
        colorAttachments: [
          {
            clearValue: { a: 1, b: 0, g: 0, r: 0 },
            loadOp: 'clear',
            storeOp: 'store',
            view: canvasTexture.createView(),
          },
        ],
      })
      renderPass.setPipeline(blitPipeline)
      renderPass.setBindGroup(0, s.blitGroup)
      renderPass.draw(3, 1, 0, 0)
      renderPass.end()
    }

    return GpuBackend.of({
      execute: (request, canvas, present) =>
        Effect.gen(function* () {
          const { width } = request.srcBitmap
          const { height } = request.srcBitmap
          if (width === 0 || height === 0) {
            return yield* Effect.fail(new GpuError({ message: 'Empty source bitmap' }))
          }

          const gpu = yield* getGpu
          const s = yield* ensureSession(gpu, canvas, width, height, request.srcBitmap)

          const { passes } = request.shader

          if (passes.length > 1) {
            ensureIntermediates(gpu.device, s)
          }

          if (request.shader.usesFrame) {
            gpu.device.queue.writeBuffer(s.frameBuffer, 0, new Uint32Array([request.frame >>> 0]))
          }

          const encoder = gpu.device.createCommandEncoder()

          for (let i = 0; i < passes.length; i++) {
            const pass = passes[i]!
            const src = i === 0 ? s.srcTex : s.intermediates![(i - 1) % 2]!
            const dst = i === passes.length - 1 ? s.dstTex : s.intermediates![i % 2]!
            const { paramsBuffer, bindGroup, pipeline } = yield* getCompute(
              gpu,
              s,
              pass,
              src,
              dst,
              request.luts,
            )

            if (paramsBuffer) {
              const paramsData = new Float32Array(roundUp(request.uniforms[i]!.length, 4))
              paramsData.set(request.uniforms[i]!)
              gpu.device.queue.writeBuffer(paramsBuffer, 0, paramsData)
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

          const slot = yield* s.histogramRing.acquire()
          gpu.device.queue.writeBuffer(s.binsBuffer, 0, s.binsZeros)
          const histogramPass = encoder.beginComputePass()
          histogramPass.setPipeline(gpu.histogramPipeline)
          histogramPass.setBindGroup(0, s.histogramGroup)
          histogramPass.dispatchWorkgroups(
            Math.ceil(width / WORKGROUP_SIZE),
            Math.ceil(height / WORKGROUP_SIZE),
            1,
          )
          histogramPass.end()
          encoder.copyBufferToBuffer(s.binsBuffer, 0, slot.buffer, 0, HISTOGRAM_BINS * 4)

          blit(gpu.device, gpu.blitPipeline, gpu.swapFormat, encoder, s, present)

          gpu.device.queue.submit([encoder.finish()])

          // Resolve only when the GPU has caught up — lets the caller keep at
          yield* Effect.tryPromise({
            catch: (cause) => new GpuError({ cause, message: 'GPU work failed' }),
            try: async () => await gpu.device.queue.onSubmittedWorkDone(),
          })

          s.histogramRing.occupy(slot, slot.buffer.mapAsync(GPUMapMode.READ))

          return new RenderHandle(s.dstTex, s.width, s.height, slot)
        }).pipe(
          // specific WGSL rejection) must surface as a GpuError. Without
          Effect.catchDefect((cause: unknown) =>
            Effect.fail(new GpuError({ cause, message: 'Unexpected GPU error' })),
          ),
        ),

      // Blit-only re-present (docs/adr/0010-editor-ui): re-blit the last rendered
      present: (canvas, present) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(sessionRef)
          if (Option.isNone(current) || current.value.canvas !== canvas) {
            return
          }
          const gpu = yield* getGpu
          const session = yield* ensureSession(
            gpu,
            canvas,
            current.value.width,
            current.value.height,
            current.value.srcBitmap,
          )
          const encoder = gpu.device.createCommandEncoder()
          blit(gpu.device, gpu.blitPipeline, gpu.swapFormat, encoder, session, present)
          gpu.device.queue.submit([encoder.finish()])
          // Await GPU completion before FramePresented — otherwise
          yield* Effect.tryPromise({
            catch: (cause) => new GpuError({ cause, message: 'GPU present failed' }),
            try: async () => await gpu.device.queue.onSubmittedWorkDone(),
          })
        }).pipe(
          Effect.catchDefect((cause: unknown) =>
            Effect.fail(new GpuError({ cause, message: 'Unexpected GPU error during present' })),
          ),
        ),

      snapshot: (handle) =>
        Effect.gen(function* () {
          const gpu = yield* getGpu
          const { dstTex, width, height } = handle

          const bytesPerRowPadded = roundUp(width * 4, 256)
          const readBuffer = gpu.device.createBuffer({
            size: bytesPerRowPadded * height,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
          })

          const encoder = gpu.device.createCommandEncoder()
          encoder.copyTextureToBuffer(
            { mipLevel: 0, origin: { x: 0, y: 0, z: 0 }, texture: dstTex },
            {
              buffer: readBuffer,
              bytesPerRow: bytesPerRowPadded,
              offset: 0,
              rowsPerImage: height,
            },
            { depthOrArrayLayers: 1, height, width },
          )
          gpu.device.queue.submit([encoder.finish()])
          yield* Effect.tryPromise({
            catch: (cause) => new GpuError({ cause, message: 'Failed to map readback buffer' }),
            try: async () => await readBuffer.mapAsync(GPUMapMode.READ),
          })

          const mapped = new Uint8Array(readBuffer.getMappedRange())
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

      readHistogram: (handle) =>
        Effect.gen(function* () {
          const slot = handle.readback
          const live = yield* Ref.get(sessionRef)
          if (Option.isNone(live) || !live.value.histogramRing.owns(slot)) {
            return new Uint32Array(HISTOGRAM_BINS)
          }
          return yield* live.value.histogramRing.consume(slot)
        }),
    })
  }),
)
