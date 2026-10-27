import { Context, Effect, Layer, Option, Ref } from 'effect'
import { GpuError, LUT_BINDING_BASE, WORKGROUP_SIZE } from '@lutra/engine'
import type { ChainPass, LutCube, RenderRequest } from '@lutra/engine'
import { HISTOGRAM_BINS, HistogramRing, makeSlot } from './histogram-ring'
import type { HistogramSlot } from './histogram-ring'
import { presentModeToWgsl } from './present-mode'
import type { ComparePresent } from './present-mode'
import { bindGroupCacheKey } from './pass-descriptor'
import { toHalfFloats } from './half-float'
import { linearSourceOf } from './linear-source'
import type { LinearImage } from '../lib/linear-image'
import {
  canvasDimensionsEqual,
  canvasDimensionsOf,
  sessionKeyEquals,
  toSessionKey,
} from './session-key'

export type { ComparePresent } from './present-mode'

export class RenderHandle {
  constructor(
    readonly dstTex: GPUTexture,
    readonly width: number,
    readonly height: number,
    readonly readback: HistogramSlot,
    readonly generation: number = 0,
  ) {}
}

interface GpuContext {
  readonly device: GPUDevice
  readonly sampler: GPUSampler
  readonly swapFormat: GPUTextureFormat
  readonly blitPipeline: GPURenderPipeline
}

export interface GpuBackendContract {
  /**
   * Execute a render request: run the chain compute passes over the source
   * image, then blit the result straight onto the given canvas. The image
   * never leaves the GPU — no readback on the display path. Resolves with a
   * `RenderHandle` once the frame is submitted and the frame before it has
   * completed, so at most two frames are on the GPU: the CPU prepares the
   * next frame while the GPU runs this one. The final blit applies the
   * given compare presentation state.
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

/** Upload a RAW decode's linear half-float pixels to an `rgba16float` texture. */
const uploadLinearSource = (device: GPUDevice, image: LinearImage): GPUTexture => {
  const size = { depthOrArrayLayers: 1, height: image.height, width: image.width }
  const texture = device.createTexture({
    format: 'rgba16float',
    size,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  })
  device.queue.writeTexture(
    { texture },
    image.data,
    { bytesPerRow: image.width * 8, rowsPerImage: image.height },
    size,
  )
  return texture
}

interface ComputeEntry {
  readonly paramsBuffer: GPUBuffer | null
  readonly bindGroup: GPUBindGroup
  readonly pipeline: GPUComputePipeline
  /** Last render that used the entry; entries a render skips are evicted. */
  lastUsed: number
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
  /**
   * `srcTex` through an `rgba8unorm-srgb` view: loads and filtered samples
   * return linear light decoded by the texture unit, so the first pass needs
   * no decode math and no separate linearize pass. The blit's "before"
   * image reads the plain view (sRGB bytes straight to the swapchain).
   */
  readonly srcLinearView: GPUTextureView
  /** The linear half-float texture behind `srcLinearView` for a RAW source; undefined when the 8-bit `srcTex` serves. */
  readonly srcLinearTex: GPUTexture | undefined
  readonly dstTex: GPUTexture
  /**
   * Ping-pong linear-light rgba16float intermediates. Layer passes read
   * the previous pass's output and write the next; only the final pass
   * writes dstTex (sRGB-encoded rgba8unorm). Lazily allocated —
   * null for passthrough/single-pass chains where the source goes
   * straight to dstTex, saving ~366 MiB on a 6k empty chain.
   */
  intermediates: [GPUTexture, GPUTexture] | null
  /** Per-render `FrameInfo` uniform: resolution, pixel scale, frame counter. */
  readonly infoBuffer: GPUBuffer
  /** Reused staging bytes for `infoBuffer`, viewed as f32 ×3 + u32. */
  readonly infoData: ArrayBuffer
  readonly infoFloats: Float32Array
  readonly infoWords: Uint32Array
  /** Canvas-size uniform for the blit (u_canvas), written once at build. */
  readonly canvasSizeBuffer: GPUBuffer
  /** Compare presentation uniform (mode + split position), written per blit. */
  readonly presentBuffer: GPUBuffer
  readonly blitGroup: GPUBindGroup
  /** Histogram bins accumulator (STORAGE | COPY_SRC) — the final pass atomicAdds into this. */
  readonly binsBuffer: GPUBuffer
  readonly histogramRing: HistogramRing
  /**
   * Per-pass params buffer + compute bind group (both reference session
   * resources), keyed by `bindGroupCacheKey`. Bounded: an entry no render
   * used in the latest frame is destroyed.
   */
  readonly compute: Map<string, ComputeEntry>
  /** Render counter for `ComputeEntry.lastUsed`. */
  renders: number
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
 * - `pipelineCache`: compute pipeline promises keyed by pass source. Pass
 *   sources do not depend on chain position, so the cache holds one entry
 *   per distinct run of layer types.
 * - `previousFrame`: completion of the latest submitted frame; `execute`
 *   waits on it before returning, bounding the GPU queue at two frames.
 * - `lutTextures`: uploaded LUT cubes keyed by lutId. A cube is a property
 *   of the layer, not of the image, so entries survive session teardown;
 *   bounded by the vendored catalog.
 */
export const GpuBackendLive = Layer.effect(
  GpuBackend,
  Effect.gen(function* () {
    const sessionRef = yield* Ref.make<Option.Option<Session>>(Option.none())
    const pipelineCacheRef = yield* Ref.make(new Map<string, Promise<GPUComputePipeline>>())
    const lutTexturesRef = yield* Ref.make(new Map<string, GPUTexture>())
    const previousFrameRef = yield* Ref.make<Promise<void>>(Promise.resolve())

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
            yield* Ref.set(pipelineCacheRef, new Map())
            yield* Ref.set(lutTexturesRef, new Map())
            yield* Ref.set(previousFrameRef, Promise.resolve())
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
      return { device, sampler, swapFormat, blitPipeline } as const
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
        // rgba16float is filterable, so the LUT body takes one hardware
        // trilinear sample. writeTexture copies bytes verbatim, so the f32
        // cube data is converted to half-float bits first.
        const tex = device.createTexture({
          dimension: '3d',
          format: 'rgba16float',
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
          toHalfFloats(texels),
          { bytesPerRow: size * 4 * 2, rowsPerImage: size },
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
      s.srcLinearTex?.destroy()
      s.dstTex.destroy()
      if (s.intermediates) {
        s.intermediates[0].destroy()
        s.intermediates[1].destroy()
      }
      s.infoBuffer.destroy()
      s.canvasSizeBuffer.destroy()
      s.presentBuffer.destroy()
      s.binsBuffer.destroy()
      s.histogramRing.destroy()
      for (const entry of s.compute.values()) {
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
      const { device, sampler, swapFormat, blitPipeline } = gpu
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
            void Effect.runFork(
              Effect.logDebug(`[WebGPU] cleanup destroy skipped: ${String(cause)}`),
            )
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
            viewFormats: ['rgba8unorm-srgb'],
          }),
        )
        // A RAW decode ships its linear 16-bit pixels alongside the bitmap
        // (gpu/linear-source.ts); the chain then starts from those and the
        // 8-bit `srcTex` only feeds the compare blit's "before" half.
        const linearSource = linearSourceOf(srcBitmap)
        const srcLinearTex = linearSource
          ? track(uploadLinearSource(device, linearSource))
          : undefined
        const srcLinearView =
          srcLinearTex?.createView() ?? srcTex.createView({ format: 'rgba8unorm-srgb' })
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

        const infoBuffer = track(
          device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          }),
        )
        const canvasSizeBuffer = track(
          device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          }),
        )
        device.queue.writeBuffer(
          canvasSizeBuffer,
          0,
          new Float32Array([canvas.width, canvas.height]),
        )
        const presentBuffer = track(
          device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          }),
        )

        const infoData = new ArrayBuffer(16)

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
          blitGroup,
          canvas,
          canvasHeight: canvas.height,
          canvasSizeBuffer,
          canvasWidth: canvas.width,
          compute: new Map(),
          ctx,
          dstTex,
          height,
          histogramRing,
          infoBuffer,
          infoData,
          infoFloats: new Float32Array(infoData, 0, 3),
          infoWords: new Uint32Array(infoData),
          intermediates,
          presentBuffer,
          renders: 0,
          srcBitmap,
          srcLinearTex,
          srcLinearView,
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
        const key = toSessionKey(canvas, width, height, srcBitmap)
        if (Option.isSome(current)) {
          const currentKey = toSessionKey(
            current.value.canvas,
            current.value.width,
            current.value.height,
            current.value.srcBitmap,
          )
          if (sessionKeyEquals(currentKey, key)) {
            const storedCanvas = {
              height: current.value.canvasHeight,
              width: current.value.canvasWidth,
            }
            const nextCanvas = canvasDimensionsOf(canvas)
            if (!canvasDimensionsEqual(storedCanvas, nextCanvas)) {
              resizeCanvas(gpu, current.value)
            }
            return current.value
          }
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
     * Compile (or reuse) the pipeline for a pass source. Compilation is
     * async, so it never stalls the main thread, and the in-flight promise is
     * cached, so concurrent renders share one compile. A failed compile is
     * dropped from the cache and surfaces as a GpuError.
     */
    const getPipeline = (
      device: GPUDevice,
      source: string,
    ): Effect.Effect<GPUComputePipeline, GpuError> =>
      Effect.gen(function* () {
        const cache = yield* Ref.get(pipelineCacheRef)
        let pending = cache.get(source)
        if (!pending) {
          pending = device.createComputePipelineAsync({
            compute: { entryPoint: 'main', module: device.createShaderModule({ code: source }) },
            layout: 'auto',
          })
          const compiling = pending
          yield* Ref.update(pipelineCacheRef, (current) => new Map(current).set(source, compiling))
        }
        const compiling = pending
        return yield* Effect.tryPromise({
          catch: (cause) => new GpuError({ cause, message: 'Failed to compile shader pass' }),
          try: async () => await compiling,
        }).pipe(
          Effect.tapError(() =>
            Ref.update(pipelineCacheRef, (current) => {
              const next = new Map(current)
              next.delete(source)
              return next
            }),
          ),
        )
      })

    /**
     * Get (or lazily create) the pipeline + bind group for one compute pass.
     * Pass sources do not encode chain position, so the bind group cache key
     * adds the pass's input/output textures (`bindGroupCacheKey`) and its
     * LUT cubes.
     */
    const getCompute = (
      gpu: GpuContext,
      s: Session,
      pass: ChainPass,
      index: number,
      isLast: boolean,
      luts: ReadonlyMap<string, LutCube>,
    ): Effect.Effect<ComputeEntry, GpuError> =>
      Effect.gen(function* () {
        const { device, sampler } = gpu
        const cacheKey = bindGroupCacheKey(pass, index, isLast)
        const cached = s.compute.get(cacheKey)
        if (cached) {
          return cached
        }

        const pipeline = yield* getPipeline(device, pass.source)
        const src = index === 0 ? s.srcLinearView : s.intermediates![(index - 1) % 2]!.createView()
        const dst = isLast ? s.dstTex : s.intermediates![index % 2]!

        const paramsBuffer =
          pass.uniformLength > 0
            ? device.createBuffer({
                size: roundUp(pass.uniformLength * 4, 16),
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
              })
            : null

        const entries: GPUBindGroupEntry[] = [
          { binding: 0, resource: src },
          { binding: 1, resource: dst.createView() },
          { binding: 2, resource: { buffer: s.infoBuffer } },
        ]
        if (paramsBuffer) {
          entries.push({ binding: 4, resource: { buffer: paramsBuffer } })
        }
        if (pass.usesSampler) {
          entries.push({ binding: 5, resource: sampler })
        }
        if (isLast) {
          entries.push({ binding: 6, resource: { buffer: s.binsBuffer } })
        }
        for (const [k, lutId] of pass.lutIds.entries()) {
          const cube = luts.get(lutId)
          if (!cube) {
            paramsBuffer?.destroy()
            return yield* Effect.fail(new GpuError({ message: `LUT cube missing for ${lutId}` }))
          }
          const lutTex = yield* ensureLutTexture(device, lutId, cube)
          entries.push({
            binding: LUT_BINDING_BASE + k,
            resource: lutTex.createView({ dimension: '3d' }),
          })
        }

        const bindGroup = device.createBindGroup({
          entries,
          layout: pipeline.getBindGroupLayout(0),
        })
        const entry: ComputeEntry = { bindGroup, lastUsed: s.renders, paramsBuffer, pipeline }
        s.compute.set(cacheKey, entry)
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
          const { device } = gpu
          const s = yield* ensureSession(gpu, canvas, width, height, request.srcBitmap)

          const { passes } = request.shader

          if (passes.length > 1) {
            ensureIntermediates(device, s)
          }

          s.renders += 1
          const computes: ComputeEntry[] = []
          for (let i = 0; i < passes.length; i++) {
            const entry = yield* getCompute(
              gpu,
              s,
              passes[i]!,
              i,
              i === passes.length - 1,
              request.luts,
            )
            entry.lastUsed = s.renders
            computes.push(entry)
          }
          // Drop bind groups (and their params buffers) this chain no longer
          // uses; submitted work keeps destroyed buffers alive until it ends.
          for (const [key, entry] of s.compute) {
            if (entry.lastUsed !== s.renders) {
              entry.paramsBuffer?.destroy()
              s.compute.delete(key)
            }
          }

          s.infoFloats.set([width, height, request.pixelScale])
          s.infoWords[3] = request.frame >>> 0
          device.queue.writeBuffer(s.infoBuffer, 0, s.infoData)
          for (const [i, entry] of computes.entries()) {
            if (entry.paramsBuffer) {
              device.queue.writeBuffer(entry.paramsBuffer, 0, request.uniforms[i]!)
            }
          }

          const slot = yield* s.histogramRing.acquire()
          const encoder = device.createCommandEncoder()
          encoder.clearBuffer(s.binsBuffer)
          // One compute pass: every dispatch is its own synchronization
          // scope, so each pass still sees the previous pass's writes.
          const computePass = encoder.beginComputePass()
          for (const entry of computes) {
            computePass.setPipeline(entry.pipeline)
            computePass.setBindGroup(0, entry.bindGroup)
            computePass.dispatchWorkgroups(
              Math.ceil(width / WORKGROUP_SIZE),
              Math.ceil(height / WORKGROUP_SIZE),
              1,
            )
          }
          computePass.end()
          encoder.copyBufferToBuffer(s.binsBuffer, 0, slot.buffer, 0, HISTOGRAM_BINS * 4)

          blit(device, gpu.blitPipeline, gpu.swapFormat, encoder, s, present)

          device.queue.submit([encoder.finish()])
          s.histogramRing.occupy(slot, slot.buffer.mapAsync(GPUMapMode.READ))

          // Keep at most two frames on the GPU: return once the previous
          // frame has completed, so the caller builds the next frame while
          // the GPU runs this one.
          const previous = yield* Ref.getAndSet(
            previousFrameRef,
            device.queue.onSubmittedWorkDone(),
          )
          yield* Effect.tryPromise({
            catch: (cause) => new GpuError({ cause, message: 'GPU work failed' }),
            try: async () => await previous,
          })

          return new RenderHandle(s.dstTex, s.width, s.height, slot, slot.generation)
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
          return yield* live.value.histogramRing.consume(slot, handle.generation)
        }),
    })
  }),
)
