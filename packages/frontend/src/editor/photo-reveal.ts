import { Effect } from 'effect'

/**
 * The photo reveal: when a decoded photo lands, a Pixelize transition (ported
 * from gl-transitions, MIT) plays over the print for 500 ms. The shader is
 * applied to the loaded photo itself: coarse square blocks of a soft grey
 * draft of it halve in ten steps until the block size reaches the photo's
 * own pixels, then the overlay fades out onto the editor canvas.
 *
 * It runs on a canvas and device of its own: the editor's `GpuBackend` is a
 * Command resource that mounts cannot reach, and the reveal must not queue
 * behind the first render. Without WebGPU, or with reduced motion, nothing
 * plays and the editor canvas shows directly.
 */
export const REVEAL_MS = 500
const FADE_MS = 150

const WGSL = /* wgsl */ `
// u = (width, height, progress, unused)
@group(0) @binding(0) var<uniform> u: vec4f;
@group(0) @binding(1) var photo: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

struct V { @builtin(position) pos: vec4f, @location(0) uv: vec2f }

@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  var o: V;
  o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}

fn toC(uv: vec2f) -> vec3f {
  return textureSampleLevel(photo, smp, uv, 0.0).rgb;
}

// The photo's soft, desaturated draft.
fn fromC(uv: vec2f) -> vec3f {
  var acc = vec3f(0.0);
  for (var k = 0; k < 14; k++) {
    let a = f32(k) * 2.399963;
    let r = 0.03 * sqrt((f32(k) + 0.5) / 14.0);
    acc += toC(uv + vec2f(cos(a), sin(a) * u.x / u.y) * r);
  }
  let c = acc / 14.0;
  return mix(vec3f(dot(c, vec3f(0.2126, 0.7152, 0.0722))), c, 0.45) * 0.9;
}

// Pixelize (gre, gl-transitions): square blocks halve in ten steps.
@fragment fn fs(in: V) -> @location(0) vec4f {
  let p = u.z;
  let dist = ceil((1.0 - p) * 10.0) / 10.0;
  let sq = vec2f(dist / 8.0, dist / 8.0 * u.x / u.y);
  var pos = in.uv;
  if (dist > 0.0) { pos = (floor(in.uv / sq) + 0.5) * sq; }
  return vec4f(mix(fromC(pos), toC(pos), p), 1.0);
}
`

const nextFrame = async () => await new Promise<number>((resolve) => requestAnimationFrame(resolve))

/** Play the reveal on `overlay` over `bitmap`; resolves when it has faded out. */
const play = async (overlay: HTMLCanvasElement, bitmap: ImageBitmap, signal: AbortSignal) => {
  const adapter = await navigator.gpu.requestAdapter()
  const device = await adapter?.requestDevice()
  const context = overlay.getContext('webgpu')
  if (device === undefined || context === null) {
    return
  }
  try {
    const format = navigator.gpu.getPreferredCanvasFormat()
    context.configure({ alphaMode: 'opaque', device, format })
    const texture = device.createTexture({
      format: 'rgba8unorm',
      size: [bitmap.width, bitmap.height],
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    })
    device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [
      bitmap.width,
      bitmap.height,
    ])
    const module = device.createShaderModule({ code: WGSL })
    const pipeline = device.createRenderPipeline({
      fragment: { entryPoint: 'fs', module, targets: [{ format }] },
      layout: 'auto',
      vertex: { entryPoint: 'vs', module },
    })
    const uniforms = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    const group = device.createBindGroup({
      entries: [
        { binding: 0, resource: { buffer: uniforms } },
        { binding: 1, resource: texture.createView() },
        {
          binding: 2,
          resource: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }),
        },
      ],
      layout: pipeline.getBindGroupLayout(0),
    })
    const dpr = Math.min(window.devicePixelRatio, 2)
    overlay.width = Math.max(1, Math.round(overlay.clientWidth * dpr))
    overlay.height = Math.max(1, Math.round(overlay.clientHeight * dpr))
    const start = performance.now()
    while (!signal.aborted) {
      const progress = Math.min((performance.now() - start) / REVEAL_MS, 1)
      device.queue.writeBuffer(
        uniforms,
        0,
        new Float32Array([overlay.width, overlay.height, progress, 0]),
      )
      const encoder = device.createCommandEncoder()
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          { loadOp: 'clear', storeOp: 'store', view: context.getCurrentTexture().createView() },
        ],
      })
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, group)
      pass.draw(3)
      pass.end()
      device.queue.submit([encoder.finish()])
      // The first drawn frame covers nothing yet: show the overlay only now.
      overlay.style.visibility = 'visible'
      if (progress >= 1) {
        break
      }
      await nextFrame()
    }
    overlay.style.transition = `opacity ${String(FADE_MS)}ms ease-out`
    overlay.style.opacity = '0'
    await new Promise((resolve) => setTimeout(resolve, FADE_MS))
  } finally {
    device.destroy()
  }
}

/**
 * Lay a reveal overlay over `canvas` for as long as the surrounding scope is
 * open, and play it. Never fails: a missing GPU just leaves the canvas bare.
 * The reveal runs in a forked fiber, so the caller continues at once.
 */
export const revealPhoto = (canvas: HTMLCanvasElement, bitmap: ImageBitmap) =>
  Effect.gen(function* () {
    const parent = canvas.parentElement
    if (
      parent === null ||
      !('gpu' in navigator) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    const overlay = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const element = document.createElement('canvas')
        element.setAttribute('aria-hidden', 'true')
        element.className = 'pointer-events-none absolute inset-0 z-20 h-full w-full'
        element.style.visibility = 'hidden'
        parent.append(element)
        return element
      }),
      (element) => Effect.sync(() => element.remove()),
    )
    yield* Effect.tryPromise({
      catch: () => undefined,
      try: async (signal) => {
        await play(overlay, bitmap, signal)
      },
    }).pipe(Effect.ignore, Effect.forkScoped)
  })
