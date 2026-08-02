import { Effect, Option, Ref, Schema } from 'effect'
import { Command, File as FoldkitFile, Render } from 'foldkit'
import * as Persistence from 'effect/unstable/persistence/KeyValueStore'
import { EditStore, EditIdSchema, StoreError } from '@lutra/store'
import {
  createLayer,
  createRenderRequest,
  ExportSettings,
  defaultExportSettings,
  mimeFor,
  EncodeError,
  GpuError,
  ImageEncoder,
  Layer,
  type LayerType,
  type LutCube,
  type LutId,
} from '@lutra/engine'
import { GpuBackend, RenderHandle } from '../gpu/backend'
import { CanvasRef } from '../gpu/canvas-ref'
import { LutStore } from '../luts/store'
import {
  FilePickCancelled,
  ImageDecoded,
  ImageFailedToDecode,
  EditLoaded,
  EditLoadFailed,
  RenderedFrame,
  RenderFailed,
  HistogramComputed,
  HistogramFailed,
  ExportSnapshotted,
  ExportSnapshotFailed,
  ExportPrepared,
  ExportEncodeFailed,
  ExportDownloaded,
  ExportSettingsLoaded,
  ExportUrlRevoked,
  ExportSettingsSaved,
  CatalogLoaded,
  CatalogFailed,
} from './message'
import { SelectedImageFile } from './message'
import { ENGINE_REGISTRY } from '../editor/layer-meta'

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
export const PickImageFile = Command.define('PickImageFile', {
  messages: [SelectedImageFile, FilePickCancelled],
  execute: FoldkitFile.select(['image/*', '.jpg', '.jpeg', '.png', '.webp', '.avif']).pipe(
    Effect.map(
      Option.match({
        onNone: () => FilePickCancelled(),
        onSome: (file) => SelectedImageFile({ file }),
      }),
    ),
  ),
})

const errMsg = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

/**
 * Decode a user-selected File into an ImageBitmap at its native resolution.
 * A decode error becomes `ImageFailedToDecode`; any defect (a bug) crashes
 * rather than being relabeled.
 */
export const DecodeImage = Command.define('DecodeImage', {
  args: { file: Schema.instanceOf(File) },
  messages: [ImageDecoded, ImageFailedToDecode],
  execute: ({ file }) =>
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
})

/**
 * Load the Edit attached to this editor route (`/edit/:id`) and decode its
 * source bytes, so the editor seeds exactly what a freshly picked photo
 * would — an opened Edit reuses the existing Idle phase (CONTEXT.md
 * "Attached edit"). A missing id (stale URL, deleted tile) or an
 * undecodable source becomes `EditLoadFailed`; the error stage shows.
 */
export const LoadEdit = Command.define('LoadEdit', {
  args: { id: EditIdSchema },
  messages: [EditLoaded, EditLoadFailed],
  execute: ({ id }) =>
    Effect.gen(function* () {
      const store = yield* EditStore
      const maybeEdit = yield* store.load(id)
      if (Option.isNone(maybeEdit)) {
        return EditLoadFailed({ error: 'edit not found' })
      }
      const edit = maybeEdit.value
      const bitmap = yield* Effect.tryPromise({
        // The bytes' buffer came from the store as a transferred ArrayBuffer;
        // TS can't know that, hence the BlobPart assertion (as in PrepareExport).
        // oxlint-disable-next-line consistent-type-assertions
        try: () => createImageBitmap(new Blob([edit.source as BlobPart])),
        catch: (cause) => new Error(`Failed to decode saved image: ${String(cause)}`),
      })
      return EditLoaded({
        chain: edit.chain,
        bitmap,
        width: bitmap.width,
        height: bitmap.height,
      })
    }).pipe(
      Effect.catchIf(
        (err): err is StoreError => err instanceof StoreError,
        (err) => Effect.succeed(EditLoadFailed({ error: err.message })),
      ),
      Effect.catchIf(
        (err): err is Error => err instanceof Error,
        (err) => Effect.succeed(EditLoadFailed({ error: errMsg(err) })),
      ),
    ),
})

/**
 * Load the LUT library catalog (film_luts.json) at startup. Until it
 * lands, the LUT tool stays disabled — a draft cannot reference a LUT id
 * the app doesn't know.
 */
export const LoadCatalog = Command.define('LoadCatalog', {
  messages: [CatalogLoaded, CatalogFailed],
  execute: Effect.gen(function* () {
    const store = yield* LutStore
    const catalog = yield* store.getCatalog()
    return CatalogLoaded({ catalog })
  }).pipe(
    Effect.catchTag('GpuError', (err: GpuError) =>
      Effect.succeed(CatalogFailed({ error: err.message })),
    ),
  ),
})

/**
 * Resolve every LUT layer's cube through the LUT store, then hand the
 * id→cube map to the render request (the engine bakes sizes into the
 * shader and the GPU backend uploads textures from it).
 */
const resolveLuts = (
  layers: ReadonlyArray<Layer>,
): Effect.Effect<ReadonlyMap<LutId, LutCube>, GpuError, LutStore> =>
  Effect.gen(function* () {
    const store = yield* LutStore
    const luts = new Map<LutId, LutCube>()
    for (const layer of layers) {
      if (layer.type !== 'lut') continue
      if (luts.has(layer.lutId)) continue
      const cube = yield* store.getCube(layer.lutId)
      luts.set(layer.lutId, cube)
    }
    return luts
  })

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
export const RenderChain = Command.define('RenderChain', {
  args: {
    // Decode through the engine's Layer schema so handlers get typed
    // layers — the chain is user data crossing the message boundary.
    layers: Schema.Array(Layer),
    draft: Schema.NullOr(Layer),
    bitmap: Schema.instanceOf(ImageBitmap),
    stamp: Schema.Number,
  },
  messages: [RenderedFrame, RenderFailed],
  execute: ({ layers, draft, bitmap, stamp }) =>
    Effect.gen(function* () {
      yield* Render.afterCommit
      // The canvas is registered into the CanvasRef service when it mounts;
      // resolve it from the app context instead of a global DOM query. The
      // afterCommit wait guarantees the mount that registered it has run
      // (mounts fork right after the patch; afterCommit resumes a frame
      // later).
      const canvasRef = yield* CanvasRef
      const canvas = yield* Ref.get(canvasRef)
      if (Option.isNone(canvas)) return RenderFailed({ reason: 'Canvas not ready' })

      const chain: Layer[] = [...layers]
      if (draft) chain.push(draft)

      const luts = yield* resolveLuts(chain)
      const request = yield* createRenderRequest(chain, ENGINE_REGISTRY, bitmap, stamp, luts)
      const backend = yield* GpuBackend
      const handle = yield* backend.execute(request, canvas.value)
      return RenderedFrame({ stamp, handle })
    }).pipe(
      Effect.catchTag('GpuError', (err: GpuError) =>
        Effect.succeed(RenderFailed({ reason: err.message })),
      ),
    ),
})

/**
 * Read the luminance histogram bins of the frame `handle` identifies back
 * from the GPU. Dispatched by the RenderedFrame handler for every rendered
 * frame — including stale ones, so the per-render bins buffer is always
 * consumed and destroyed (a stale frame's bins are dropped in update, but
 * the buffer must not leak). `readHistogram` maps, copies, unmaps, and
 * destroys the buffer, so a handle's bins are readable exactly once.
 */
export const ReadHistogram = Command.define('ReadHistogram', {
  args: { handle: Schema.instanceOf(RenderHandle), stamp: Schema.Number },
  messages: [HistogramComputed, HistogramFailed],
  execute: ({ handle, stamp }) =>
    Effect.gen(function* () {
      const backend = yield* GpuBackend
      const bins = yield* backend.readHistogram(handle)
      return HistogramComputed({ bins, stamp })
    }).pipe(
      Effect.catchIf(
        (err): err is GpuError => err instanceof GpuError,
        (err) => Effect.succeed(HistogramFailed({ reason: err.message })),
      ),
    ),
})

// ---- export dialog ----

const EXPORT_SETTINGS_KEY = 'exportSettings'

/**
 * Read the frame identified by `handle` back from the GPU once, when the
 * export dialog opens. The ImageData is cached in the model for the dialog's
 * lifetime so pressing Export again re-encodes without another readback.
 */
export const SnapshotForExport = Command.define('SnapshotForExport', {
  args: { handle: Schema.instanceOf(RenderHandle) },
  messages: [ExportSnapshotted, ExportSnapshotFailed],
  execute: ({ handle }) =>
    Effect.gen(function* () {
      const backend = yield* GpuBackend
      const image = yield* backend.snapshot(handle)
      return ExportSnapshotted({ image })
    }).pipe(
      Effect.catchIf(
        (err): err is GpuError => err instanceof GpuError,
        (err) => Effect.succeed(ExportSnapshotFailed({ reason: err.message })),
      ),
    ),
})

/**
 * Encode the export frame with the given settings and report the resulting
 * size + blob URL. Runs once per Export press — there is no live size
 * preview (encoding for it was too slow). The previous blob URL is revoked
 * here — the model's `exportUrl` is only ever replaced, never leaked.
 */
export const PrepareExport = Command.define('PrepareExport', {
  args: {
    image: Schema.instanceOf(ImageData),
    settings: ExportSettings,
    previousUrl: Schema.NullOr(Schema.String),
  },
  messages: [ExportPrepared, ExportEncodeFailed],
  execute: ({ image, settings, previousUrl }) =>
    Effect.gen(function* () {
      if (previousUrl) yield* Effect.sync(() => URL.revokeObjectURL(previousUrl))
      const encoder = yield* ImageEncoder
      const bytes = yield* encoder.encode({ image, settings })
      // The bytes' buffer came from the worker as a transferred ArrayBuffer;
      // TS can't know that, hence the BlobPart assertion.
      // oxlint-disable-next-line consistent-type-assertions
      const blob = new Blob([bytes as BlobPart], { type: mimeFor(settings.format) })
      const url = URL.createObjectURL(blob)
      return ExportPrepared({ sizeBytes: bytes.byteLength, url })
    }).pipe(
      Effect.catchIf(
        (err): err is EncodeError => err instanceof EncodeError,
        (err) => Effect.succeed(ExportEncodeFailed({ reason: err.message })),
      ),
    ),
})

/** Trigger the browser download of the encoded blob (the url stays alive
 *  until the dialog closes — the tweak-and-re-export loop needs it). */
export const ExportDownload = Command.define('ExportDownload', {
  args: { url: Schema.String, filename: Schema.String },
  messages: [ExportDownloaded],
  execute: ({ url, filename }) =>
    Effect.sync(() => {
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      return ExportDownloaded({ url })
    }),
})

/** Revoke a blob URL (dialog close, stale encode result). */
export const RevokeExportUrl = Command.define('RevokeExportUrl', {
  args: { url: Schema.String },
  messages: [ExportUrlRevoked],
  execute: ({ url }) => Effect.sync(() => URL.revokeObjectURL(url)).pipe(Effect.as(ExportUrlRevoked())),
})

/** Restore persisted export settings (dispatched once at startup). */
export const LoadExportSettings = Command.define('LoadExportSettings', {
  messages: [ExportSettingsLoaded],
  execute: Effect.gen(function* () {
    const store = yield* Persistence.KeyValueStore
    const schemaStore = Persistence.toSchemaStore(store, ExportSettings)
    // `Effect.option` wraps the success (itself an Option) — flatten.
    const saved = Option.flatten(yield* schemaStore.get(EXPORT_SETTINGS_KEY).pipe(
      // Missing or corrupt settings fall back to defaults.
      Effect.option,
    ))
    return ExportSettingsLoaded({ settings: Option.getOrElse(defaultExportSettings)(saved) })
  }),
})

/** Persist export settings (fired on every change; localStorage is cheap). */
export const SaveExportSettings = Command.define('SaveExportSettings', {
  args: { settings: ExportSettings },
  messages: [ExportSettingsSaved],
  execute: ({ settings }) =>
    Effect.gen(function* () {
      const store = yield* Persistence.KeyValueStore
      yield* Persistence.toSchemaStore(store, ExportSettings)
        .set(EXPORT_SETTINGS_KEY, settings)
        .pipe(Effect.ignore)
      return ExportSettingsSaved()
    }),
})
