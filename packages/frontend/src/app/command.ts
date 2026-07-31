import { Effect, Option, Schema } from 'effect'
import { Command, File as FoldkitFile, Render } from 'foldkit'
import { createLayer, createRenderRequest, GpuError, type Layer, type LayerType } from '@lutra/engine'
import { GpuBackend } from '../gpu/backend'
import {
  FilePickCancelled,
  ImageDecoded,
  ImageFailedToDecode,
  RenderedFrame,
  RenderFailed,
  ExportFinished,
  ExportFailed,
} from './message'
import { SelectedImageFile } from './message'
import { ENGINE_REGISTRY } from '../editor/layerMeta'

// The engine owns the WGSL body renderers and builds the render request
// (shader + uniforms + source); the frontend owns the WebGPU device and the
// canvas. `createRenderRequest` assembles the chain source and packs
// uniforms, then `GpuBackend.execute` runs it and blits the result onto the
// center-stage canvas. The frontend has no duplicate layer definitions — it
// consumes the engine's registry.
export const createLayerFor = (type: LayerType): Layer =>
  createLayer(type, ENGINE_REGISTRY)

/**
 * Opens the native file picker restricted to image files. If the user selects
 * a file, dispatches `SelectedImageFile`; if they cancel, dispatches
 * `FilePickCancelled`.
 */
export const PickImageFile = Command.define(
  'PickImageFile',
  SelectedImageFile,
  FilePickCancelled,
)(
  FoldkitFile.select(['image/*', '.jpg', '.jpeg', '.png', '.webp', '.avif']).pipe(
    Effect.map(
      Option.match({
        onNone: () => FilePickCancelled(),
        onSome: (file) => SelectedImageFile({ file }),
      }),
    ),
  ),
)

const errMsg = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/**
 * Decode a user-selected File into an ImageBitmap at its native resolution.
 * A decode error becomes `ImageFailedToDecode`; any defect (a bug) crashes
 * rather than being relabeled.
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
    Effect.catchIf(
      (err): err is Error => err instanceof Error,
      (err) => Effect.succeed(ImageFailedToDecode({ error: errMsg(err) })),
    ),
  ),
)

/**
 * Render the current chain (plus an optional draft appended last) through
 * WebGPU straight into the center-stage canvas. `stamp` is the model revision
 * at dispatch time so a render that arrives after a newer mutation can be
 * ignored (or re-triggered) by `update`.
 *
 * The command yields `Render.afterCommit` first: it is dispatched by the
 * message that mounted the canvas (e.g. `ImageDecoded`), and must not query
 * the DOM until that render has committed.
 *
 * Failure cases are handled separately: a missing canvas is reported inline;
 * `GpuError`s (unknown layer type, shader generation, device/canvas failures)
 * become `RenderFailed`. Defects crash.
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
    yield* Render.afterCommit
    const canvas = document.getElementById('lutra-canvas') as HTMLCanvasElement | null
    if (!canvas) return RenderFailed({ reason: 'Canvas not ready' })

    const chain: Layer[] = [...(layers as ReadonlyArray<Layer>)]
    if (draft) chain.push(draft as Layer)

    const request = yield* createRenderRequest(chain, ENGINE_REGISTRY, bitmap, stamp)
    const backend = yield* GpuBackend
    yield* backend.execute(request, canvas)
    return RenderedFrame({ stamp })
  }).pipe(
    Effect.catchTag('GpuError', (err: GpuError) =>
      Effect.succeed(RenderFailed({ reason: err.message })),
    ),
  ),
)

/**
 * Encode the last rendered frame as PNG and trigger a browser download. The
 * GPU backend reads the frame back to an ImageBitmap (the one place the
 * display path's no-readback rule is relaxed — export is a button click, not
 * a slider tick). Uses `HTMLCanvasElement.toBlob` (callback) wrapped in a
 * promise since the DOM canvas lacks `convertToBlob` (that's an
 * `OffscreenCanvas` method).
 *
 * Failure cases are handled separately: the snapshot `GpuError`, the missing
 * 2d context, and the encode error each map to `ExportFailed`. Defects crash.
 */
export const ExportImage = Command.define(
  'ExportImage',
  ExportFinished,
  ExportFailed,
)(
  Effect.gen(function* () {
    const backend = yield* GpuBackend
    const bitmap = yield* backend.snapshot()
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
    // Delay the revoke: browsers start the download asynchronously, and
    // revoking the object URL in the same tick can abort it.
    yield* Effect.callback<void>((resume) => {
      const handle = setTimeout(() => resume(Effect.void), 500)
      return Effect.sync(() => clearTimeout(handle))
    })
    URL.revokeObjectURL(url)
    return ExportFinished({ url })
  }).pipe(
    Effect.catchIf(
      (err): err is GpuError => err instanceof GpuError,
      (err) => Effect.succeed(ExportFailed({ reason: err.message })),
    ),
    Effect.catchIf(
      (err): err is Error => err instanceof Error,
      (err) => Effect.succeed(ExportFailed({ reason: errMsg(err) })),
    ),
  ),
)
