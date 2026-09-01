import { DateTime, Effect, Option, Ref, Schema } from 'effect'
import { Command, File as FoldkitFile, Render } from 'foldkit'
import * as Persistence from 'effect/unstable/persistence/KeyValueStore'
import type { StoreError } from '@lutra/store'
import { Edit, EditStore, EditIdSchema, newEditId } from '@lutra/store'
import {
  GpuError,
  createLayer,
  createRenderRequest,
  Layer,
  LAYER_TYPES,
  LutIdSchema,
  type LayerType,
} from '@lutra/engine'
import { GpuBackend, RenderHandle } from '../gpu/backend'
import { CanvasRef } from '../gpu/canvas-ref'
import type { LutLoadError } from '../luts/store'
import { LutStore } from '../luts/store'
import { resolveLuts } from '../luts/resolve'
import { LutThumbnailer } from '../thumbs/worker-layer'
import {
  CanvasUnavailableError,
  EditNotFoundError,
  ImageDecodeError,
  LayerCreationError,
  ThumbnailEncodeError,
} from '../errors'
import { EditorMessage, PresentState } from './message'
import { ENGINE_REGISTRY } from '../editor/layer-meta'
import { toPreviewBitmap } from '../gpu/preview'

export const createLayerFor = (type: LayerType) => createLayer(type, ENGINE_REGISTRY)

/**
 * Assemble a draft layer outside the synchronous phase transition. A schema
 * or registry failure is converted to a message carrying a frontend error;
 * defects remain defects and are not relabeled as user failures.
 */
export const CreateLayer = Command.define('CreateLayer', {
  args: { type: Schema.Literals(LAYER_TYPES) },
  execute: ({ type }) =>
    Effect.gen(function* () {
      const layer = yield* createLayerFor(type)
      return EditorMessage.LayerCreated({ layer })
    }).pipe(
      Effect.catchTags({
        SchemaError: (cause) =>
          Effect.succeed(
            EditorMessage.LayerCreationFailed({
              error: new LayerCreationError({
                cause,
                message: `Failed to create ${type} layer: ${String(cause)}`,
              }),
            }),
          ),
        UnknownLayerTypeError: (cause) =>
          Effect.succeed(
            EditorMessage.LayerCreationFailed({
              error: new LayerCreationError({
                cause,
                message: `Failed to create ${type} layer: ${String(cause)}`,
              }),
            }),
          ),
      }),
    ),
  messages: [EditorMessage.LayerCreated, EditorMessage.LayerCreationFailed],
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
        onNone: () => EditorMessage.FilePickCancelled(),
        onSome: (file) => EditorMessage.SelectedImageFile({ file }),
      }),
    ),
  ),
  messages: [EditorMessage.SelectedImageFile, EditorMessage.FilePickCancelled],
})

/**
 * Decode a user-selected File into an ImageBitmap at its native resolution.
 * A decode error becomes `ImageFailedToDecode` carrying the domain error;
 * any defect (a bug) crashes rather than being relabeled.
 */
export const DecodeImage = Command.define('DecodeImage', {
  args: { file: Schema.instanceOf(File) },
  execute: ({ file }) =>
    Effect.gen(function* () {
      const source = yield* Effect.tryPromise({
        catch: (cause) =>
          new ImageDecodeError({
            message: `Failed to read image: ${String(cause)}`,
            cause,
          }),
        try: async () => await file.arrayBuffer(),
      })
      const nativeBitmap = yield* Effect.tryPromise({
        catch: (cause) =>
          new ImageDecodeError({
            message: `Failed to decode image: ${String(cause)}`,
            cause,
          }),
        try: async () => await createImageBitmap(file),
      })
      const bitmap = yield* Effect.tryPromise({
        catch: (cause) =>
          new ImageDecodeError({
            message: `Failed to decode image: ${String(cause)}`,
            cause,
          }),
        try: async () => await toPreviewBitmap(nativeBitmap),
      })
      return EditorMessage.ImageDecoded({
        bitmap,
        height: bitmap.height,
        source: new Uint8Array(source),
        width: bitmap.width,
      })
    }).pipe(
      Effect.catchTag('ImageDecodeError', (err: ImageDecodeError) =>
        Effect.succeed(EditorMessage.ImageFailedToDecode({ error: err })),
      ),
    ),
  messages: [EditorMessage.ImageDecoded, EditorMessage.ImageFailedToDecode],
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
  execute: ({ id }) =>
    Effect.gen(function* () {
      const store = yield* EditStore
      const maybeEdit = yield* store.load(id)
      if (Option.isNone(maybeEdit)) {
        return EditorMessage.EditLoadFailed({
          error: new EditNotFoundError({ message: 'edit not found' }),
        })
      }
      const edit = maybeEdit.value
      const nativeBitmap = yield* Effect.tryPromise({
        // SAFETY: the store hands back image bytes over a transferred ArrayBuffer; TS cannot express that, so the BlobPart cast is the documented boundary.
        // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion, typescript/consistent-type-assertions -- SAFETY: documented BlobPart boundary
        try: async () => await createImageBitmap(new Blob([edit.source as BlobPart])),
        catch: (cause) =>
          new ImageDecodeError({
            cause,
            message: `Failed to decode saved image: ${String(cause)}`,
          }),
      })
      const bitmap = yield* Effect.tryPromise({
        catch: (cause) =>
          new ImageDecodeError({
            cause,
            message: `Failed to decode saved image: ${String(cause)}`,
          }),
        try: async () => await toPreviewBitmap(nativeBitmap),
      })
      return EditorMessage.EditLoaded({
        id: edit.id,
        chain: edit.chain,
        bitmap,
        width: bitmap.width,
        height: bitmap.height,
        source: edit.source,
      })
    }).pipe(
      Effect.catchTag('StoreError', (err: StoreError) =>
        Effect.succeed(EditorMessage.EditLoadFailed({ error: err })),
      ),
      Effect.catchTag('ImageDecodeError', (err: ImageDecodeError) =>
        Effect.succeed(EditorMessage.EditLoadFailed({ error: err })),
      ),
    ),
  messages: [EditorMessage.EditLoaded, EditorMessage.EditLoadFailed],
})

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
  execute: ({ id, chain, source, handle }) =>
    Effect.gen(function* () {
      const backend = yield* GpuBackend
      const frame = yield* backend.snapshot(handle)
      const thumbnail = yield* thumbnailFromFrame(frame)
      const store = yield* EditStore
      const editId = id ?? newEditId()
      const savedAt = DateTime.nowUnsafe().epochMilliseconds
      yield* store.save(Edit.make({ chain, id: editId, savedAt, source, thumbnail }))
      return EditorMessage.EditSaved({ id: editId, savedAt })
    }).pipe(
      Effect.catchTag('GpuError', (err: GpuError) =>
        Effect.succeed(EditorMessage.SaveFailed({ error: err })),
      ),
      Effect.catchTag('StoreError', (err: StoreError) =>
        Effect.succeed(EditorMessage.SaveFailed({ error: err })),
      ),
      Effect.catchTag('ThumbnailEncodeError', (err: ThumbnailEncodeError) =>
        Effect.succeed(EditorMessage.SaveFailed({ error: err })),
      ),
    ),
  messages: [EditorMessage.EditSaved, EditorMessage.SaveFailed],
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
    return EditorMessage.CatalogLoaded({ catalog })
  }).pipe(
    Effect.catchTag('LutLoadError', (err: LutLoadError) =>
      Effect.succeed(EditorMessage.CatalogFailed({ error: err })),
    ),
  ),
  messages: [EditorMessage.CatalogLoaded, EditorMessage.CatalogFailed],
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
    layers: Schema.Array(Layer),
    draft: Schema.NullOr(Layer),
    bitmap: Schema.instanceOf(ImageBitmap),
    stamp: Schema.Number,
    // The compare presentation state (docs/adr/0010-editor-ui): the render's final
    present: PresentState,
  },
  execute: ({ layers, draft, bitmap, stamp, present }) =>
    Effect.gen(function* () {
      yield* Render.afterCommit
      // later).
      const canvasRef = yield* CanvasRef
      const canvas = yield* Ref.get(canvasRef)
      if (Option.isNone(canvas)) {
        return EditorMessage.RenderFailed({
          error: new CanvasUnavailableError({ message: 'Canvas not ready' }),
        })
      }

      const chain: Layer[] = [...layers]
      if (draft) {
        chain.push(draft)
      }

      const luts = yield* resolveLuts(chain)
      const request = yield* createRenderRequest(chain, ENGINE_REGISTRY, bitmap, stamp, luts)
      const backend = yield* GpuBackend
      const handle = yield* backend.execute(request, canvas.value, present)
      return EditorMessage.RenderedFrame({ handle, stamp })
    }).pipe(
      Effect.catchTags({
        GpuError: (err) => Effect.succeed(EditorMessage.RenderFailed({ error: err })),
        LutLoadError: (err) => Effect.succeed(EditorMessage.RenderFailed({ error: err })),
        LutParseError: (err) => Effect.succeed(EditorMessage.RenderFailed({ error: err })),
      }),
    ),
  messages: [EditorMessage.RenderedFrame, EditorMessage.RenderFailed],
})

/**
 * Re-present the last rendered frame with a new compare presentation state
 * — the blit-only counterpart to RenderChain (docs/adr/0010-editor-ui). Presentation
 * changes (mode flip, divider drag) never re-run the chain; this command
 * costs one fullscreen triangle. Dispatched by ChangedCompareMode and
 * ChangedSplitPosition; the model's lastRender, bins, and renderedStamp are
 * untouched. A missing canvas or session is a no-op (the next render or
 * present re-blits anyway).
 */
export const PresentFrame = Command.define('PresentFrame', {
  args: { present: PresentState },
  execute: ({ present }) =>
    Effect.gen(function* () {
      yield* Render.afterCommit
      const canvasRef = yield* CanvasRef
      const canvas = yield* Ref.get(canvasRef)
      if (Option.isNone(canvas)) {
        return EditorMessage.FramePresented()
      }
      const backend = yield* GpuBackend
      yield* backend.present(canvas.value, present)
      return EditorMessage.FramePresented()
    }).pipe(
      // A present failure (a defect surfaced as GpuError) is best-effort by
      Effect.catchTag('GpuError', () => Effect.succeed(EditorMessage.FramePresented())),
    ),
  messages: [EditorMessage.FramePresented],
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
  execute: ({ handle, stamp }) =>
    Effect.gen(function* () {
      const backend = yield* GpuBackend
      const bins = yield* backend.readHistogram(handle)
      return EditorMessage.HistogramComputed({ bins, stamp })
    }).pipe(
      Effect.catchTag('GpuError', (err: GpuError) =>
        Effect.succeed(EditorMessage.HistogramFailed({ error: err })),
      ),
    ),
  messages: [EditorMessage.HistogramComputed, EditorMessage.HistogramFailed],
})

/** Settings persistence is shared with the collage's export dialog (docs/adr/0004-export). */
import { setFrame } from '../export-dialog'

const OFF_PRESENT = { mode: 'off', splitAt: 0, showBefore: false } as const

/**
 * Read the frame back from the GPU once, when the export dialog opens.
 * The ImageData lands in the shared export-dialog frame slot for the
 * dialog's lifetime so pressing Export again re-encodes without another
 * readback — it never rides through the model (docs/adr/0004-export).
 *
 * Preview: the editor grades at preview resolution (FHD-class) so the
 * display `handle` is preview sized. Export must be native. When native
 * `source` + `layers` are provided the command decodes the full-res bytes,
 * re-executes the chain at native size on a detached canvas, and snapshots
 * that frame. When they are absent (tests, or no attached edit) it falls
 * back to snapshotting the preview handle — the old path — so existing
 * scenes keep passing.
 */
export const SnapshotForExport = Command.define('SnapshotForExport', {
  args: {
    handle: Schema.instanceOf(RenderHandle),
    draft: Schema.optional(Schema.NullOr(Layer)),
    layers: Schema.optional(Schema.Array(Layer)),
    source: Schema.optional(Schema.Uint8Array),
  },
  execute: ({ handle, draft, layers, source }) =>
    Effect.gen(function* () {
      if (source && layers) {
        const chain: Layer[] = [...layers]
        if (draft) {
          chain.push(draft)
        }
        const luts = yield* resolveLuts(chain)
        const nativeBitmap = yield* Effect.tryPromise({
          catch: (cause) =>
            new GpuError({
              cause,
              message: `Failed to decode source for export: ${String(cause)}`,
            }),
          try: async () => {
            // SAFETY: the store hands back image bytes over a transferred ArrayBuffer; TS cannot express that, so the BlobPart cast is the documented boundary.
            // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion, typescript/consistent-type-assertions -- SAFETY: documented BlobPart boundary
            const blob = new Blob([source as BlobPart])
            return await createImageBitmap(blob)
          },
        })
        try {
          const request = yield* createRenderRequest(
            chain,
            ENGINE_REGISTRY,
            nativeBitmap,
            0,
            luts,
          )
          const canvas = document.createElement('canvas')
          canvas.width = nativeBitmap.width
          canvas.height = nativeBitmap.height
          const backend = yield* GpuBackend
          const nativeHandle = yield* backend.execute(request, canvas, OFF_PRESENT)
          const image = yield* backend.snapshot(nativeHandle)
          setFrame(image)
          nativeBitmap.close()
          return EditorMessage.ExportSnapshotted()
        } catch (cause) {
          nativeBitmap.close()
          throw cause
        }
      }
      const backend = yield* GpuBackend
      const image = yield* backend.snapshot(handle)
      setFrame(image)
      return EditorMessage.ExportSnapshotted()
    }).pipe(
      Effect.catchTags({
        GpuError: (err: GpuError) =>
          Effect.succeed(EditorMessage.ExportSnapshotFailed({ error: err })),
        LutLoadError: (err) =>
          Effect.succeed(
            EditorMessage.ExportSnapshotFailed({
              error: new GpuError({ cause: err, message: String(err) }),
            }),
          ),
        LutParseError: (err) =>
          Effect.succeed(
            EditorMessage.ExportSnapshotFailed({
              error: new GpuError({ cause: err, message: String(err) }),
            }),
          ),
      }),
    ),
  messages: [EditorMessage.ExportSnapshotted, EditorMessage.ExportSnapshotFailed],
})

// LUT recents (the bar's Recents tab, docs/adr/0002-lut-library)

const LUT_RECENTS_KEY = 'lutRecents'

/** Restore persisted LUT recents (dispatched once at startup, like
 *  LoadExportSettings). Missing or corrupt recents fall back to []. */
export const LoadLutRecents = Command.define('LoadLutRecents', {
  execute: Effect.gen(function* () {
    const store = yield* Persistence.KeyValueStore
    const schemaStore = Persistence.toSchemaStore(store, Schema.Array(LutIdSchema))
    const saved = Option.flatten(yield* schemaStore.get(LUT_RECENTS_KEY).pipe(Effect.option))
    return EditorMessage.LutRecentsLoaded({ recents: Option.getOrElse(() => [])(saved) })
  }),
  messages: [EditorMessage.LutRecentsLoaded],
})

/** Persist LUT recents (fired on every bump; localStorage is cheap). */
export const SaveLutRecents = Command.define('SaveLutRecents', {
  args: { recents: Schema.Array(LutIdSchema) },
  execute: ({ recents }) =>
    Effect.gen(function* () {
      const store = yield* Persistence.KeyValueStore
      yield* Persistence.toSchemaStore(store, Schema.Array(LutIdSchema))
        .set(LUT_RECENTS_KEY, recents)
        .pipe(Effect.ignore)
      return EditorMessage.LutRecentsSaved()
    }),
  messages: [EditorMessage.LutRecentsSaved],
})

// per-photo LUT thumbnails (filmstrip previews, docs/adr/0002-lut-library)

/**
 * Render one per-photo LUT thumbnail: resolve the cube (memoized by the
 * LUT store) and apply it in the thumb worker pool (CPU sampler + JPEG
 * encode). The photo's 200×200 downscale happens once per photo inside the
 * thumbnailer layer (docs/adr/0002-lut-library), so a group visit costs a single
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
  execute: ({ lutId, bitmap }) =>
    Effect.gen(function* () {
      const store = yield* LutStore
      const thumbs = yield* LutThumbnailer
      const cube = yield* store.getCube(lutId).pipe(Effect.option)
      if (Option.isNone(cube)) {
        return EditorMessage.LutThumbFailed({ lutId })
      }
      const bytes = yield* thumbs.render(lutId, bitmap, cube.value)
      if (Option.isNone(bytes)) {
        return EditorMessage.LutThumbFailed({ lutId })
      }
      // SAFETY: the thumbnail bytes are produced over a transferred ArrayBuffer; TS cannot express that, so the BlobPart cast is the documented boundary.
      // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion, typescript/consistent-type-assertions -- SAFETY: documented BlobPart boundary
      const blob = new Blob([bytes.value as BlobPart], { type: 'image/jpeg' })
      return EditorMessage.LutThumbGenerated({ bitmap, lutId, url: URL.createObjectURL(blob) })
    }),
  messages: [EditorMessage.LutThumbGenerated, EditorMessage.LutThumbFailed],
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
      return EditorMessage.LutThumbsRevoked()
    }),
  messages: [EditorMessage.LutThumbsRevoked],
})
