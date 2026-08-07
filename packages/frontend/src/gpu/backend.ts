import { Context, Effect, Layer, Option, Ref } from 'effect'
import { GpuError, WORKGROUP_SIZE, type ChainPass, type LutCube, type RenderRequest } from '@lutra/engine'

// ---- service ----

/**
 * One slot of the histogram readback ring. `execute` copies a frame's bins
 * into `buffer` and issues `map` once the frame's submit completed — so the
 * map never queues behind a later render — then `readHistogram` consumes it
 * (read + unmap, `map` back to null), freeing the slot for the ring's next
 * pass. A slot whose `map` is non-null is never copied into.
 */
interface HistogramSlot {
  readonly buffer: GPUBuffer
  map: Promise<void> | null
}

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
    /** This frame's slot on the histogram readback ring (see HistogramSlot). */
    readonly readback: HistogramSlot,
  ) {}
}

/**
 * The compare presentation state the blit applies (docs/adr/0011): which
 * Compare mode is active, where the Split divider sits (image space, 0..1),
 * and which side Toggle shows. Mirrors the frontend's PresentState schema —
 * the backend stays a plain structural service, so the schema lives at the
 * message boundary only.
 */
export interface ComparePresent {
  readonly mode: 'off' | 'toggle' | 'split' | 'side-by-side'
  readonly splitAt: number
  readonly showBefore: boolean
}

export interface GpuBackendShape {
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
   * — a blit-only pass that never re-runs the chain (docs/adr/0011). The
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
 *
 * Compare presentation (docs/adr/0011): the blit samples the display texture
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
    // Side by side: source in the left half, graded in the right. The
    // canvas is 2× the image width in this mode, so uv ∈ [0, 1) covers
    // both halves and the doubled sample coordinates map each half 1:1
    // (native resolution — the framing view; Split is the full-res
    // inspection view). Both samples run in uniform control flow (mode is
    // uniform); the half selection is a select expression, not control
    // flow — textureSample must not be called from flow that depends on
    // the non-uniform fragment position. Out-of-range coordinates clamp.
    let left = textureSample(srcTex, samp, vec2<f32>(uv.x * 2.0, uv.y));
    let right = textureSample(dstTex, samp, vec2<f32>(uv.x * 2.0 - 1.0, uv.y));
    return select(right, left, uv.x < 0.5);
  }
  if (mode == 2.0) {
    // Split: source left of the divider, graded right. select evaluates
    // both samples unconditionally, which is fine (both textures bound).
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

// ---- histogram pass ----

/** Bins per channel. Matches the 8-bit sRGB-encoded display texture 1:1. */
const HISTOGRAM_BINS = 256

/**
 * Readback ring depth. A slot is mapped from the moment `execute` issues
 * the map (after the frame's submit completed) until `readHistogram`
 * consumes it in the same message cycle — three slots give two full cycles
 * of slack before a slot is reused, so a slow consumer can never collide
 * with a copy.
 */
const HISTOGRAM_SLOTS = 3

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
  // Rec.709 luma — the same coefficients the engine's shader bodies use.
  let luma = dot(color.rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  // [0, 1] -> bin 0..255; 1.0 clamps into the top bin.
  let bin = min(u32(luma * 256.0), 255u);
  atomicAdd(&bins[bin], 1u);
}
`

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
  /**
   * The canvas drawing-buffer size the swapchain was configured at. Equals
   * the image size except in Side by side, where the canvas is 2× the image
   * width (both halves at native resolution); the blit derives its uv from
   * these via `u_canvas`. A change here (a compare-mode toggle) rebuilds the
   * session.
   */
  readonly canvasWidth: number
  readonly canvasHeight: number
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
   * writes dstTex (sRGB-encoded rgba8unorm).
   */
  readonly intermediates: [GPUTexture, GPUTexture]
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
  /** Readback ring: per render, the bins are copied into one slot, which is then mapped. */
  readonly readbacks: [HistogramSlot, HistogramSlot, HistogramSlot]
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

    // Histogram readback ring cursor: which slot the next render copies
    // into. Renders are serialized (one in flight — the caller coalesces
    // via renderPending), so a plain counter is race-free; it just rotates
    // forever, session rebuilds included.
    let readbackCursor = 0

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

    // Device-scoped histogram pipeline (fixed shader, like the blit). The
    // bind group is per session — it references the session's bins
    // accumulator and dstTex, neither of which change per render.
    const histogramModule = device.createShaderModule({ code: HISTOGRAM_SOURCE })
    const histogramPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: histogramModule, entryPoint: 'main' },
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
      s.canvasSizeBuffer.destroy()
      s.frameBuffer.destroy()
      s.presentBuffer.destroy()
      s.binsBuffer.destroy()
      for (const slot of s.readbacks) {
        slot.buffer.destroy()
      }
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
      // Canvas-size uniform for the blit: the swapchain size the blit
      // derives its uv from (2× the image width in Side by side), which can
      // differ from the image-sized `u_resolution` the compute passes use.
      const canvasSizeBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })
      device.queue.writeBuffer(
        canvasSizeBuffer,
        0,
        new Float32Array([canvas.width, canvas.height]),
      )
      const frameBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })

      // Compare presentation uniform: [wgslMode, splitAt, 0, 0], rewritten
      // before every blit (chain renders and present-only re-blits alike).
      const presentBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })

      // The blit group mirrors the shader's bindings: dstTex (0), sampler
      // (1), srcTex (3), the present uniform (4), and the canvas size (5).
      // Note there is no u_resolution (2) here — the blit derives its uv
      // from u_canvas, not the image-sized resolution the compute passes use.
      const blitGroup = device.createBindGroup({
        layout: blitPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: dstTex.createView() },
          { binding: 1, resource: sampler },
          { binding: 3, resource: srcTex.createView() },
          { binding: 4, resource: { buffer: presentBuffer } },
          { binding: 5, resource: { buffer: canvasSizeBuffer } },
        ],
      })

      // Histogram resources, all session-scoped (created once per image,
      // never per render): a storage-only bins accumulator — MAP_READ can't
      // combine with STORAGE (WebGPU usage rules), so the bins cross back
      // via a ring of MAP_READ readback buffers the encoder copies into per
      // render — and the pass's bind group, which only references
      // session-scoped resources. All three readback slots start unmapped
      // with no pending map, so a fresh session's ring is immediately
      // reusable.
      const binsBuffer = device.createBuffer({
        size: HISTOGRAM_BINS * 4,
        // COPY_DST for the per-render zeroing writeBuffer; COPY_SRC for the
        // copy into the readback ring.
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      })
      const histogramGroup = device.createBindGroup({
        layout: histogramPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: dstTex.createView() },
          { binding: 1, resource: { buffer: binsBuffer } },
        ],
      })
      const makeSlot = (): HistogramSlot => ({
        buffer: device.createBuffer({
          size: HISTOGRAM_BINS * 4,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        }),
        map: null,
      })

      return {
        canvas,
        ctx,
        width,
        height,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        srcBitmap,
        srcTex,
        dstTex,
        intermediates,
        resolutionBuffer,
        canvasSizeBuffer,
        frameBuffer,
        presentBuffer,
        blitGroup,
        binsBuffer,
        binsZeros: new Uint32Array(HISTOGRAM_BINS),
        histogramGroup,
        readbacks: [makeSlot(), makeSlot(), makeSlot()],
        compute: {},
      }
    }

    /**
     * Get the session for a canvas+image, rebuilding it when the canvas,
     * the image dimensions, or the canvas drawing-buffer size change (the
     * latter on a Side by side toggle, which doubles the canvas width;
     * destroying the previous session's resources). The session lives in
     * `sessionRef`; a failed rebuild leaves the ref empty rather than
     * pointing at half-destroyed resources.
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
          current.value.height === height &&
          current.value.canvasWidth === canvas.width &&
          current.value.canvasHeight === canvas.height
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

    /**
     * Present the session's display texture onto the canvas swapchain,
     * applying the compare presentation state (docs/adr/0011). The only GPU
     * work is one fullscreen triangle — presentation changes (mode flip,
     * divider drag) never touch the chain compute output, so they cost a
     * blit, not a re-render. Shared by `execute` (the render's final blit)
     * and `present` (the blit-only re-present).
     */
    const blit = (encoder: GPUCommandEncoder, s: Session, present: ComparePresent): void => {
      const wgslMode =
        present.mode === 'off'
          ? 0
          : present.mode === 'toggle'
            ? present.showBefore
              ? 1
              : 0
            : present.mode === 'split'
              ? 2
              : 3
      device.queue.writeBuffer(
        s.presentBuffer,
        0,
        new Float32Array([wgslMode, present.splitAt, 0, 0]),
      )
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
    }

    return GpuBackend.of({
      execute: (request, canvas, present) =>
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

          // Histogram scatter pass: bin the final frame's Rec.709 luma into
          // 256 atomic bins (full-res, exact). The pass writes the
          // session-scoped bins accumulator; the bins are then copied into
          // this frame's slot of the readback ring in the same encoder
          // (MAP_READ buffers can't receive storage writes, so the copy is
          // the bridge). The accumulator is zeroed per render — atomics add
          // across renders, and the previous render's work completed before
          // this one started (execute resolves on onSubmittedWorkDone).
          const slot = s.readbacks[readbackCursor % HISTOGRAM_SLOTS]!
          readbackCursor += 1
          if (slot.map !== null) {
            // Abnormal flow: the previous frame on this slot was never
            // consumed (a dropped RenderedFrame). Wait out its map so we
            // don't copy into a mapped buffer, then reclaim the slot.
            const pending = slot.map
            yield* Effect.ignore(Effect.promise(() => pending))
            slot.buffer.unmap()
            slot.map = null
          }
          device.queue.writeBuffer(s.binsBuffer, 0, s.binsZeros)
          const histogramPass = encoder.beginComputePass()
          histogramPass.setPipeline(histogramPipeline)
          histogramPass.setBindGroup(0, s.histogramGroup)
          histogramPass.dispatchWorkgroups(
            Math.ceil(width / WORKGROUP_SIZE),
            Math.ceil(height / WORKGROUP_SIZE),
            1,
          )
          histogramPass.end()
          encoder.copyBufferToBuffer(s.binsBuffer, 0, slot.buffer, 0, HISTOGRAM_BINS * 4)

          // Finally: blit dstTex (or the compare view of srcTex/dstTex) onto
          // the canvas swapchain texture.
          blit(encoder, s, present)

          device.queue.submit([encoder.finish()])

          // Resolve only when the GPU has caught up — lets the caller keep at
          // most one render in flight (no CPU stall; this is a promise).
          yield* Effect.tryPromise({
            try: () => device.queue.onSubmittedWorkDone(),
            catch: (cause) => new GpuError({ message: 'GPU work failed', cause }),
          })

          // Issue this slot's map NOW, before any later render can submit:
          // mapAsync is enqueued on the queue timeline behind every pending
          // submission, so a map issued later (from the readback command)
          // would queue behind the next render — and the next after that
          // during a drag — landing stale and getting dropped. Issued right
          // after this frame's own submit completed, it resolves before the
          // frame's RenderedFrame is even handled, and readHistogram
          // consumes it with no waiting.
          slot.map = slot.buffer.mapAsync(GPUMapMode.READ)

          return new RenderHandle(s.dstTex, s.width, s.height, slot)
        }).pipe(
          // Any unexpected exception (bind group/layout mismatch, browser-
          // specific WGSL rejection) must surface as a GpuError. Without
          // this, a defect escapes the command's catchTag and renderPending
          // stays true forever — the app silently stops rendering.
          Effect.catchDefect((cause: unknown) =>
            Effect.fail(new GpuError({ message: 'Unexpected GPU error', cause })),
          ),
        ),

      // Blit-only re-present (docs/adr/0011): re-blit the last rendered
      // frame with a new compare presentation state, without re-running the
      // chain. Uses the current session's textures as-is; no-op when no
      // session exists for the canvas (nothing has rendered yet).
      present: (canvas, present) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(sessionRef)
          if (Option.isNone(current) || current.value.canvas !== canvas) {
            return
          }
          const s = current.value
          // The canvas drawing-buffer size may have changed since the
          // session was built — Side by side doubles the canvas width — and
          // the swapchain size is fixed at build (ctx.configure). Rebuild
          // with the stored source bitmap, then blit into the resized
          // canvas.
          const session =
            s.canvasWidth === canvas.width && s.canvasHeight === canvas.height
              ? s
              : yield* ensureSession(canvas, s.width, s.height, s.srcBitmap)
          const encoder = device.createCommandEncoder()
          blit(encoder, session, present)
          device.queue.submit([encoder.finish()])
        }).pipe(
          Effect.catchDefect((cause: unknown) =>
            Effect.fail(new GpuError({ message: 'Unexpected GPU error during present', cause })),
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

      readHistogram: (handle) =>
        Effect.gen(function* () {
          const slot = handle.readback
          const live = yield* Ref.get(sessionRef)
          const map = slot.map
          if (map === null || Option.isNone(live) || !live.value.readbacks.includes(slot)) {
            // Consumed already, or the owning session was torn down (its
            // buffers destroyed — the map would reject). Either way the
            // frame is stale and its bins would be dropped by the stamp
            // guard: resolve with empty bins rather than surfacing a
            // spurious failure.
            return new Uint32Array(HISTOGRAM_BINS)
          }
          // The map was issued by execute after this frame's submit
          // completed, so it resolves without waiting on any later render.
          yield* Effect.tryPromise({
            try: () => map,
            catch: (cause) => new GpuError({ message: 'Failed to map histogram bins buffer', cause }),
          })
          const bins = new Uint32Array(slot.buffer.getMappedRange())
          const copy = new Uint32Array(bins)
          slot.buffer.unmap()
          slot.map = null
          return copy
        }),
    })
  }),
)
