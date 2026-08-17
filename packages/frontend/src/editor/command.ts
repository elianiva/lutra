import { DateTime, Effect, Option, Ref, Schema } from 'effect'
import { Command, File as FoldkitFile, Render } from 'foldkit'
import * as Persistence from 'effect/unstable/persistence/KeyValueStore'
import type { StoreError } from '@lutra/store'
import { Edit, EditStore, EditIdSchema, newEditId } from '@lutra/store'
import {
  type EncodeError,
  type GpuError,
  type LutParseError,
  createLayer,
  createRenderRequest,
  ExportSettings,
  defaultExportSettings,
  mimeFor,
  ImageEncoder,
  Layer,
  LAYER_TYPES,
  LutIdSchema,
  type LayerType,
  type LutCube,
  type LutId,
} from '@lutra/engine'
import { GpuBackend, RenderHandle } from '../gpu/backend'
import { CanvasRef } from '../gpu/canvas-ref'
import type { LutLoadError } from '../luts/store'
import { LutStore } from '../luts/store'
import { LutThumbnailer } from '../thumbs/worker-layer'
import {
  CanvasUnavailableError,
  EditNotFoundError,
  ImageDecodeError,
  LayerCreationError,
  ThumbnailEncodeError,
} from '../errors'
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
  LutRecentsLoaded,
  LutRecentsSaved,
  LutThumbGenerated,
  LutThumbFailed,
  LutThumbsRevoked,
  SaveFailed,
  EditSaved,
  CatalogLoaded,
  CatalogFailed,
  FramePresented,
  PresentState,
  SelectedImageFile,
  LayerCreated,
  LayerCreationFailed,
} from './message'
import { ENGINE_REGISTRY } from '../editor/layer-meta'

// The frontend consumes the engine's registry directly — no duplicate layer
// definitions. Layer creation stays an Effect until the CreateLayer command
// crosses into the foldkit message boundary.
export const createLayerFor = (type: LayerType) => createLayer(type, ENGINE_REGISTRY)

/**
 * Assemble a draft layer outside the synchronous phase transition. A schema
 * or registry failure is converted to a message carrying a frontend error;
 * defects remain defects and are not relabeled as user failures.
 */
export const CreateLayer = Command.define('CreateLayer', {
  args: { type: Schema.Literals(LAYER_TYPES) },
  execute: ({ type }) => Effect.gen(function* () {
    const layer = yield* createLayerFor(type)
    return LayerCreated({ layer })
  }).pipe(
      Effect.catchTags({
        SchemaError: (cause) =>
          Effect.succeed(
            LayerCreationFailed({
              error: new LayerCreationError({
                cause,
                message: `Failed to create ${type} layer: ${String(cause)}`,
              }),
            }),
          ),
        UnknownLayerTypeError: (cause) =>
          Effect.succeed(
            LayerCreationFailed({
              error: new LayerCreationError({
                cause,
                message: `Failed to create ${type} layer: ${String(cause)}`,
              }),
            }),
          ),
      }),
    ),
  messages: [LayerCreated, LayerCreationFailed],
})

/**
 * Opens the native file picker restricted to image files. If the user selects
 * a file, dispatches `SelectedImageFile`; if they cancel, dispatches
 * `FilePickCancelled`.
 */
export const PickImageFile = Command.define('PickImageFile', {
  execute: FoldkitFile.select(['image/*', '.jpg', '.jpeg', '.png', '.webp', '.avif']).pipe(
    Effect.map(
      Option.match({
        onNone: () => FilePickCancelled(),
        onSome: (file) => SelectedImageFile({ file }),
      }),
    ),
  ),
  messages: [SelectedImageFile, FilePickCancelled],
})

/**
 * Decode a user-selected File into an ImageBitmap at its native resolution.
 * A decode error becomes `ImageFailedToDecode` carrying the domain error;
 * any defect (a bug) crashes rather than being relabeled.
 */
export const DecodeImage = Command.define('DecodeImage', {
  args: { file: Schema.instanceOf(File) },
  execute: ({ file }) => Effect.gen(function* () {
    // Read the picked file's stored bytes alongside the decode: they are
    // the Edit's source image, so a later Save-as-new can persist them
    // without holding the File (the store's carrier is bytes).
    const source = yield* Effect.tryPromise({
        catch: (cause) =>
          new ImageDecodeError({
            message: `Failed to read image: ${String(cause)}`,
            cause,
          }),
        try: async () => await file.arrayBuffer(),
      })
      const bitmap = yield* Effect.tryPromise({
        catch: (cause) =>
          new ImageDecodeError({
            message: `Failed to decode image: ${String(cause)}`,
            cause,
          }),
        try: async () => await createImageBitmap(file),
      })
    return ImageDecoded({
      bitmap,
      height: bitmap.height,
      source: new Uint8Array(source),
      width: bitmap.width,
    })
  }).pipe(
    Effect.catchTag('ImageDecodeError', (err: ImageDecodeError) =>
      Effect.succeed(ImageFailedToDecode({ error: err })),
    ),
  ),
  messages: [ImageDecoded, ImageFailedToDecode],
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
  execute: ({ id }) => Effect.gen(function* () {
    const store = yield* EditStore
    const maybeEdit = yield* store.load(id)
    if (Option.isNone(maybeEdit)) {
        return EditLoadFailed({ error: new EditNotFoundError({ message: 'edit not found' }) })
      }
      const edit = maybeEdit.value
      const bitmap = yield* Effect.tryPromise({
        // SAFETY: the edit's bytes are backed by a transferred ArrayBuffer from the store; TS cannot express that, so the BlobPart cast is the documented boundary.
        // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
        try: async () => await createImageBitmap(new Blob([edit.source as BlobPart])),
        catch: (cause) =>
          new ImageDecodeError({
            cause,
            message: `Failed to decode saved image: ${String(cause)}`,
          }),
      })
      return EditLoaded({
        id: edit.id,
        chain: edit.chain,
        bitmap,
        width: bitmap.width,
        height: bitmap.height,
        // The stored source bytes: Save writes them back untouched.
        source: edit.source,
    })
  }).pipe(
    Effect.catchTag('StoreError', (err: StoreError) =>
      Effect.succeed(EditLoadFailed({ error: err })),
    ),
    Effect.catchTag('ImageDecodeError', (err: ImageDecodeError) =>
      Effect.succeed(EditLoadFailed({ error: err })),
    ),
  ),
  messages: [EditLoaded, EditLoadFailed],
})

// ---- save ----

/**
 * A small JPEG of the graded frame, downscaled to fit `maxDim`, to refresh
 * the Edit's thumbnail on every save — the gallery tile shows the graded
 * result, not the raw photo. The readback happens once per save, like the
 * export snapshot (a live preview is not worth a readback per slider tick).
 */
const thumbnailFromFrame = (
  frame: ImageData,
  maxDim = 320,
): Effect.Effect<Uint8Array, ThumbnailEncodeError> =>
  Effect.tryPromise({
    catch: (cause) =>
      cause instanceof ThumbnailEncodeError
        ? cause
        : new ThumbnailEncodeError({
            cause,
            message: `Failed to encode thumbnail: ${String(cause)}`,
          }),
    try: async () => {
      const scale = Math.min(1, maxDim / Math.max(frame.width, frame.height))
      const width = Math.max(1, Math.round(frame.width * scale))
      const height = Math.max(1, Math.round(frame.height * scale))
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new ThumbnailEncodeError({ message: '2d context unavailable' })
      }
      // ImageData → ImageBitmap (ImageData itself is not a CanvasImageSource
      // in this TS lib); close the bitmap when the draw is done.
      const bitmap = await createImageBitmap(frame)
      try {
        ctx.drawImage(bitmap, 0, 0, width, height)
      } finally {
        bitmap.close()
      }
      const blob = await canvas.convertToBlob({ quality: 0.85, type: 'image/jpeg' })
      return new Uint8Array(await blob.arrayBuffer())
    },
  })

/**
 * Persist the committed chain as an Edit through the store seam. `id` null
 * creates a new Edit (fresh id) — the fresh in-editor pick case and Save as;
 * `id` present saves in place. The source bytes pass through untouched
 * (Save never re-encodes the source; Save as duplicates them under a new id)
 * and `savedAt` bumps so the gallery reorders by recency.
 *
 * The thumbnail is regenerated from the graded frame `handle` identifies:
 * one readback + JPEG encode, then `store.save`. Any failure — snapshot,
 * encode, or store (quota, blocked access) — becomes `SaveFailed`; the top
 * bar shows it instead of dropping the save silently.
 */
export const SaveEdit = Command.define('SaveEdit', {
  args: {
    chain: Schema.Array(Layer),
    handle: Schema.instanceOf(RenderHandle),
    id: Schema.NullOr(EditIdSchema),
    source: Schema.Uint8Array,
  },
  execute: ({ id, chain, source, handle }) => Effect.gen(function* () {
    const backend = yield* GpuBackend
    const frame = yield* backend.snapshot(handle)
    const thumbnail = yield* thumbnailFromFrame(frame)
    const store = yield* EditStore
    const editId = id ?? newEditId()
    const savedAt = DateTime.nowUnsafe().epochMilliseconds
    yield* store.save(Edit.make({ chain, id: editId, savedAt, source, thumbnail }))
    return EditSaved({ id: editId, savedAt })
  }).pipe(
      Effect.catchTag('GpuError', (err: GpuError) => Effect.succeed(SaveFailed({ error: err }))),
      Effect.catchTag('StoreError', (err: StoreError) =>
        Effect.succeed(SaveFailed({ error: err })),
      ),
      Effect.catchTag('ThumbnailEncodeError', (err: ThumbnailEncodeError) =>
        Effect.succeed(SaveFailed({ error: err })),
      ),
    ),
  messages: [EditSaved, SaveFailed],
})

/**
 * Load the LUT library catalog (film_luts.json) at startup. Until it
 * lands, the LUT tool stays disabled — a draft cannot reference a LUT id
 * the app doesn't know.
 */
export const LoadCatalog = Command.define('LoadCatalog', {
  execute: Effect.gen(function* () {
    const store = yield* LutStore
    const catalog = yield* store.getCatalog()
    return CatalogLoaded({ catalog })
  }).pipe(
    Effect.catchTag('LutLoadError', (err: LutLoadError) =>
      Effect.succeed(CatalogFailed({ error: err })),
    ),
  ),
  messages: [CatalogLoaded, CatalogFailed],
})

/**
 * Resolve every LUT layer's cube through the LUT store, then hand the
 * id→cube map to the render request (the engine bakes sizes into the
 * shader and the GPU backend uploads textures from it).
 */
const resolveLuts = (
  layers: readonly Layer[],
): Effect.Effect<ReadonlyMap<LutId, LutCube>, LutLoadError | LutParseError, LutStore> =>
  Effect.gen(function* () {
    const store = yield* LutStore
    const luts = new Map<LutId, LutCube>()
    for (const layer of layers) {
      if (layer.type !== 'lut') {
        continue
      }
      if (luts.has(layer.lutId)) {
        continue
      }
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
    // The compare presentation state (docs/adr/0011): the render's final
    // blit applies the current mode and split position.
    present: PresentState,
  },
  execute: ({ layers, draft, bitmap, stamp, present }) => Effect.gen(function* () {
    yield* Render.afterCommit
    // The canvas is registered into the CanvasRef service when it mounts;
    // resolve it from the app context instead of a global DOM query. The
    // afterCommit wait guarantees the mount that registered it has run
    // (mounts fork right after the patch; afterCommit resumes a frame
    // later).
    const canvasRef = yield* CanvasRef
    const canvas = yield* Ref.get(canvasRef)
    if (Option.isNone(canvas)) {
      return RenderFailed({ error: new CanvasUnavailableError({ message: 'Canvas not ready' }) })
    }

    const chain: Layer[] = [...layers]
    if (draft) {
      chain.push(draft)
    }

    const luts = yield* resolveLuts(chain)
    const request = yield* createRenderRequest(chain, ENGINE_REGISTRY, bitmap, stamp, luts)
    const backend = yield* GpuBackend
    const handle = yield* backend.execute(request, canvas.value, present)
    return RenderedFrame({ handle, stamp })
  }).pipe(
      // Every failure of this command surfaces as RenderFailed; the message
      // schema names the failure set.
      Effect.catchTags({
        GpuError: (err) => Effect.succeed(RenderFailed({ error: err })),
        LutLoadError: (err) => Effect.succeed(RenderFailed({ error: err })),
        LutParseError: (err) => Effect.succeed(RenderFailed({ error: err })),
      }),
    ),
  messages: [RenderedFrame, RenderFailed],
})

/**
 * Re-present the last rendered frame with a new compare presentation state
 * — the blit-only counterpart to RenderChain (docs/adr/0011). Presentation
 * changes (mode flip, divider drag) never re-run the chain; this command
 * costs one fullscreen triangle. Dispatched by ChangedCompareMode and
 * ChangedSplitPosition; the model's lastRender, bins, and renderedStamp are
 * untouched. A missing canvas or session is a no-op (the next render or
 * present re-blits anyway).
 */
export const PresentFrame = Command.define('PresentFrame', {
  args: { present: PresentState },
  execute: ({ present }) => Effect.gen(function* () {
    yield* Render.afterCommit
    const canvasRef = yield* CanvasRef
    const canvas = yield* Ref.get(canvasRef)
    if (Option.isNone(canvas)) {
      return FramePresented()
    }
    const backend = yield* GpuBackend
    yield* backend.present(canvas.value, present)
    return FramePresented()
  }).pipe(
      // A present failure (a defect surfaced as GpuError) is best-effort by
      // nature: the next render or present re-blits anyway, so there is
      // nothing to surface and nothing that wedges — unlike a failed
      // RenderChain, which must clear renderPending.
      Effect.catchTag('GpuError', () => Effect.succeed(FramePresented())),
    ),
  messages: [FramePresented],
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
  execute: ({ handle, stamp }) => Effect.gen(function* () {
    const backend = yield* GpuBackend
    const bins = yield* backend.readHistogram(handle)
    return HistogramComputed({ bins, stamp })
  }).pipe(
      Effect.catchTag('GpuError', (err: GpuError) =>
        Effect.succeed(HistogramFailed({ error: err })),
      ),
    ),
  messages: [HistogramComputed, HistogramFailed],
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
  execute: ({ handle }) => Effect.gen(function* () {
    const backend = yield* GpuBackend
    const image = yield* backend.snapshot(handle)
    return ExportSnapshotted({ image })
  }).pipe(
      Effect.catchTag('GpuError', (err: GpuError) =>
        Effect.succeed(ExportSnapshotFailed({ error: err })),
      ),
    ),
  messages: [ExportSnapshotted, ExportSnapshotFailed],
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
    previousUrl: Schema.NullOr(Schema.String),
    settings: ExportSettings,
  },
  execute: ({ image, settings, previousUrl }) => Effect.gen(function* () {
    if (previousUrl) {
      yield* Effect.sync(() => {
        URL.revokeObjectURL(previousUrl)
      })
    }
    const encoder = yield* ImageEncoder
    const bytes = yield* encoder.encode({ image, settings })
    // SAFETY: the encoder returned its output over a transferred ArrayBuffer; TS cannot express that, so the BlobPart cast is the documented boundary.
    // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
    const blob = new Blob([bytes as BlobPart], { type: mimeFor(settings.format) })
    const url = URL.createObjectURL(blob)
    return ExportPrepared({ sizeBytes: bytes.byteLength, url })
  }).pipe(
      Effect.catchTag('EncodeError', (err: EncodeError) =>
        Effect.succeed(ExportEncodeFailed({ error: err })),
      ),
    ),
  messages: [ExportPrepared, ExportEncodeFailed],
})

/** Trigger the browser download of the encoded blob (the url stays alive
 *  until the dialog closes — the tweak-and-re-export loop needs it). */
export const ExportDownload = Command.define('ExportDownload', {
  args: { filename: Schema.String, url: Schema.String },
  execute: ({ url, filename }) =>
    Effect.sync(() => {
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      return ExportDownloaded({ url })
    }),
  messages: [ExportDownloaded],
})

/** Revoke a blob URL (dialog close, stale encode result). */
export const RevokeExportUrl = Command.define('RevokeExportUrl', {
  args: { url: Schema.String },
  execute: ({ url }) =>
    Effect.sync(() => {
      URL.revokeObjectURL(url)
    }).pipe(Effect.as(ExportUrlRevoked())),
  messages: [ExportUrlRevoked],
})

/** Restore persisted export settings (dispatched once at startup). */
export const LoadExportSettings = Command.define('LoadExportSettings', {
  execute: Effect.gen(function* () {
    const store = yield* Persistence.KeyValueStore
    const schemaStore = Persistence.toSchemaStore(store, ExportSettings)
    // `Effect.option` wraps the success (itself an Option) — flatten.
    const saved = Option.flatten(
      yield* schemaStore.get(EXPORT_SETTINGS_KEY).pipe(
        // Missing or corrupt settings fall back to defaults.
        Effect.option,
      ),
    )
    return ExportSettingsLoaded({ settings: Option.getOrElse(defaultExportSettings)(saved) })
  }),
  messages: [ExportSettingsLoaded],
})

/** Persist export settings (fired on every change; localStorage is cheap). */
export const SaveExportSettings = Command.define('SaveExportSettings', {
  args: { settings: ExportSettings },
  execute: ({ settings }) => Effect.gen(function* () {
    const store = yield* Persistence.KeyValueStore
    yield* Persistence.toSchemaStore(store, ExportSettings)
      .set(EXPORT_SETTINGS_KEY, settings)
      .pipe(Effect.ignore)
    return ExportSettingsSaved()
  }),
  messages: [ExportSettingsSaved],
})

// ---- LUT recents (the bar's Recents tab, docs/adr/0012) ----

const LUT_RECENTS_KEY = 'lutRecents'

/** Restore persisted LUT recents (dispatched once at startup, like
 *  LoadExportSettings). Missing or corrupt recents fall back to []. */
export const LoadLutRecents = Command.define('LoadLutRecents', {
  execute: Effect.gen(function* () {
    const store = yield* Persistence.KeyValueStore
    const schemaStore = Persistence.toSchemaStore(store, Schema.Array(LutIdSchema))
    // `Effect.option` wraps the success (itself an Option) — flatten.
    const saved = Option.flatten(yield* schemaStore.get(LUT_RECENTS_KEY).pipe(Effect.option))
    return LutRecentsLoaded({ recents: Option.getOrElse(() => [])(saved) })
  }),
  messages: [LutRecentsLoaded],
})

/** Persist LUT recents (fired on every bump; localStorage is cheap). */
export const SaveLutRecents = Command.define('SaveLutRecents', {
  args: { recents: Schema.Array(LutIdSchema) },
  execute: ({ recents }) => Effect.gen(function* () {
    const store = yield* Persistence.KeyValueStore
    yield* Persistence.toSchemaStore(store, Schema.Array(LutIdSchema))
      .set(LUT_RECENTS_KEY, recents)
      .pipe(Effect.ignore)
    return LutRecentsSaved()
  }),
  messages: [LutRecentsSaved],
})

// ---- per-photo LUT thumbnails (filmstrip previews, docs/adr/0013) ----

/**
 * Render one per-photo LUT thumbnail: resolve the cube (memoized by the
 * LUT store) and apply it in the thumb worker pool (CPU sampler + JPEG
 * encode). The photo's 200×200 downscale happens once per photo inside the
 * thumbnailer layer (docs/adr/0013), so a group visit costs a single
 * canvas-2D op. Every non-success path — cube fetch, downscale, worker
 * render, encode — becomes `LutThumbFailed`, so the bar silently keeps the
 * vendored generic jpg. The message carries the photo the preview belongs
 * to, so a result that lands after a new image loaded is dropped and
 * revoked by update.
 */
export const GenerateLutThumb = Command.define('GenerateLutThumb', {
  args: {
    bitmap: Schema.instanceOf(ImageBitmap),
    lutId: LutIdSchema,
  },
  execute: ({ lutId, bitmap }) => Effect.gen(function* () {
    const store = yield* LutStore
    const thumbs = yield* LutThumbnailer
    const cube = yield* store.getCube(lutId).pipe(Effect.option)
    if (Option.isNone(cube)) {
      return LutThumbFailed({ lutId })
    }
    const bytes = yield* thumbs.render(lutId, bitmap, cube.value)
    if (Option.isNone(bytes)) {
      return LutThumbFailed({ lutId })
    }
    // SAFETY: the thumb encoder returned its JPEG over a transferred ArrayBuffer; TS cannot express that, so the BlobPart cast is the documented boundary.
    // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
    const blob = new Blob([bytes.value as BlobPart], { type: 'image/jpeg' })
    return LutThumbGenerated({ bitmap, lutId, url: URL.createObjectURL(blob) })
  }),
  messages: [LutThumbGenerated, LutThumbFailed],
})

/** Revoke per-photo preview blob URLs (fired when a new image loads — the
 *  old photo's thumbs are dead the moment the bitmap changes). */
export const RevokeLutThumbs = Command.define('RevokeLutThumbs', {
  args: { urls: Schema.Array(Schema.String) },
  execute: ({ urls }) =>
    Effect.sync(() => {
      for (const url of urls) {
        URL.revokeObjectURL(url)
      }
      return LutThumbsRevoked()
    }),
  messages: [LutThumbsRevoked],
})
