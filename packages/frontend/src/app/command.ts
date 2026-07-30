import { Effect, Schema } from 'effect'
import { Command } from 'foldkit'
import { render, createLayer, type Layer, type LayerType } from '@lutra/engine'
import {
  ImageDecoded,
  ImageFailedToDecode,
  RenderedFrame,
  RenderFailed,
  PaintedCanvas,
  ExportFinished,
  ExportFailed,
} from './message'
import { ENGINE_REGISTRY } from '../editor/layerMeta'

// The engine owns the WGSL body renderers; the frontend owns the WebGPU
// device. `render` assembles the chain source, packs uniforms from the
// layers, and hands the compiled shader + uniforms + source bitmap to the
// `GpuBackend` (provided as a runtime resource in main.ts). The frontend has
// no duplicate layer definitions — it consumes the engine's registry.
export const createLayerFor = (type: LayerType): Layer =>
  createLayer(type, ENGINE_REGISTRY)

const errMsg = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/**
 * Decode a user-selected File into an ImageBitmap at its native resolution.
 * Errors are caught and surfaced as `ImageFailedToDecode` so the command's
 * Effect error channel is `never` (required by the runtime's Command type).
 */
export const DecodeImage = Command.define(
  'DecodeImage',
  { file: Schema.instanceOf(File) },
  ImageDecoded,
  ImageFailedToDecode,
)(({ file }) =>
  Effect.tryPromise({
    try: () => createImageBitmap(file),
    catch: (cause) => new Error(`Failed to decode image: ${String(cause)}`),
  }).pipe(
    Effect.map((bitmap) =>
      ImageDecoded({ bitmap, width: bitmap.width, height: bitmap.height }),
    ),
    Effect.catchCause((cause) =>
      Effect.succeed(ImageFailedToDecode({ error: errMsg(cause) })),
    ),
  ),
)

/**
 * Render the current chain (plus an optional draft appended last) through
 * WebGPU. `stamp` is the model revision at dispatch time so a render that
 * arrives after a newer mutation can be ignored by `update`. Render errors
 * become `RenderFailed` successes.
 */
export const RenderChain = Command.define(
  'RenderChain',
  {
    layers: Schema.Array(Schema.Unknown),
    draft: Schema.NullOr(Schema.Unknown),
    bitmap: Schema.instanceOf(ImageBitmap),
    stamp: Schema.Number,
  },
  RenderedFrame,
  RenderFailed,
)(({ layers, draft, bitmap, stamp }) =>
  Effect.gen(function* () {
    const chain: Layer[] = [...(layers as ReadonlyArray<Layer>)]
    if (draft) chain.push(draft as Layer)
    if (chain.length === 0) {
      return RenderFailed({ reason: 'No layers to render' })
    }
    return yield* render(chain, ENGINE_REGISTRY, bitmap, stamp).pipe(
      Effect.map((b) => RenderedFrame({ bitmap: b, stamp })),
      Effect.catchCause((cause) => {
        const err = cause as { message?: string; _tag?: string }
        return Effect.succeed(
          RenderFailed({ reason: err._tag ?? err.message ?? 'Render failed' }),
        )
      }),
    )
  }),
)

/**
 * Paint a rendered ImageBitmap onto the center-stage canvas (looked up by id).
 * Per the foldkit guidance, Model-driven DOM behavior after mount uses a
 * Command dispatched from the Message handler that changed the Model.
 */
export const PaintCanvas = Command.define(
  'PaintCanvas',
  { bitmap: Schema.instanceOf(ImageBitmap) },
  PaintedCanvas,
)(({ bitmap }) =>
  Effect.sync(() => {
    const canvas = document.getElementById('lutra-canvas') as HTMLCanvasElement | null
    if (canvas) {
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width
        canvas.height = bitmap.height
      }
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
    }
    return PaintedCanvas()
  }),
)

/**
 * Encode the rendered bitmap as PNG and trigger a browser download. Uses
 * `HTMLCanvasElement.toBlob` (callback) wrapped in a promise since the DOM
 * canvas lacks `convertToBlob` (that's an `OffscreenCanvas` method).
 */
export const ExportImage = Command.define(
  'ExportImage',
  { bitmap: Schema.instanceOf(ImageBitmap) },
  ExportFinished,
  ExportFailed,
)(({ bitmap }) =>
  Effect.gen(function* () {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return ExportFailed({ reason: 'No 2d context for export' })
    ctx.drawImage(bitmap, 0, 0)
    const blob = yield* Effect.tryPromise({
      try: () =>
        new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => {
            if (b) resolve(b)
            else reject(new Error('Export encode failed'))
          }, 'image/png')
        }),
      catch: (cause) => new Error(errMsg(cause)),
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lutra-edit.png'
    a.click()
    yield* Effect.sleep('500 millis')
    URL.revokeObjectURL(url)
    return ExportFinished({ url })
  }).pipe(
    Effect.catchCause((cause) => Effect.succeed(ExportFailed({ reason: errMsg(cause) }))),
  ),
)