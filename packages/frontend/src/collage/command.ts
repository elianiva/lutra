import { Effect, Option, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { pushUrl } from 'foldkit/navigation'
import {
  Collage,
  CollageIdSchema,
  CollageLayout,
  CollageStore as CollageStoreTag,
  EditIdSchema,
  EditStore,
} from '@lutra/store'
import { EncodeError, ExportSettings, ImageEncoder, mimeFor } from '@lutra/engine'
import type { EditId, StoreError } from '@lutra/store'
import {
  CollageDownloaded,
  CollageEncodeFailed,
  CollageEncodePrepared,
  CollageExportSettingsLoaded,
  CollageExportSettingsSaved,
  CollageExportSnapshotFailed,
  CollageExportSnapshotted,
  CollageExportUrlRevoked,
  CollageLoaded,
  CollageSaved,
  CollageMissing,
  LoadFailed,
  NavigatedBack,
  SaveFailed,
} from './message'
import { renderEditTile } from './render-tile'
import { composeGrid } from './compose'
import { peekExportFrame, setExportFrame } from './export-frame'
import { loadExportSettings, saveExportSettings } from '../export-settings'

/**
 * Load one collage by id and resolve its references (docs/adr/0030): tiles
 * whose Edit no longer exists are dropped from the loaded copy — never
 * persisted until the next auto-save — and counted in `dropped` so the
 * screen can show a notice. The referenced edits' summaries ride along as
 * `thumbs` (preview bytes for the surviving tiles).
 */
export const LoadCollage = Command.define('LoadCollage', {
  args: { id: CollageIdSchema },
  execute: ({ id }) =>
    Effect.gen(function* LoadCollage() {
      const collages = yield* CollageStoreTag
      const loaded = yield* collages.load(id)
      if (Option.isNone(loaded)) {
        return CollageMissing()
      }
      const edits = yield* EditStore
      const summaries = yield* edits.list()
      const alive = new Set<EditId>(summaries.map((s) => s.id))
      const record = loaded.value
      const kept = record.tiles.filter((tile) => alive.has(tile.editId))
      const dropped = record.tiles.length - kept.length
      const thumbIds = new Set(kept.map((t) => t.editId))
      return CollageLoaded({
        collage: { ...record, tiles: kept },
        thumbs: summaries.filter((s) => thumbIds.has(s.id)),
        dropped,
      })
    }).pipe(
      Effect.catchTag('StoreError', (err: StoreError) => Effect.succeed(LoadFailed({ error: err }))),
    ),
  messages: [CollageLoaded, CollageMissing, LoadFailed],
})

/**
 * Auto-save the mutated record (docs/adr/0030). The record is ids + layout
 * numbers — hundreds of bytes — so every arrangement change persists
 * immediately; there is no draft and no Save button to lose work.
 */
export const SaveCollage = Command.define('SaveCollage', {
  args: { collage: Collage },
  execute: ({ collage }) =>
    Effect.gen(function* SaveCollage() {
      const store = yield* CollageStoreTag
      yield* store.save(collage)
      return CollageSaved()
    }).pipe(
      Effect.catchTag('StoreError', (err: StoreError) => Effect.succeed(SaveFailed({ error: err }))),
    ),
  messages: [CollageSaved, SaveFailed],
})

/**
 * Back to the main menu. The URL change triggers a `ChangedRoute`, which
 * moves the gallery into place — this Command is just the side effect that
 * starts it.
 */
export const NavigateMenu = Command.define('NavigateMenu', {
  execute: pushUrl('/').pipe(Effect.as(NavigatedBack())),
  messages: [NavigatedBack],
})

// ---- export (docs/adr/0031) ----

/** Export composes at fixed square cells before the scale preset (docs/adr/0031). */
const CELL_EXPORT_SIZE = 1024

/**
 * Compose the export frame once per dialog open: load every referenced
 * Edit in full (source bytes + chain), render each chain to its square cell
 * through the GPU, and draw the grid. The composed ImageData is cached for
 * the dialog's lifetime — pressing Export re-encodes without re-rendering.
 * A tile whose Edit vanished mid-flow, or whose render failed, leaves its
 * cell as background; `failedTiles` counts them so the screen can say so.
 */
export const SnapshotCollageExport = Command.define('SnapshotCollageExport', {
  args: { editIds: S.Array(EditIdSchema), layout: CollageLayout },
  execute: ({ editIds, layout }) =>
    Effect.gen(function* SnapshotCollageExport() {
      const edits = yield* EditStore
      const tiles: ImageData[] = []
      let failedTiles = 0
      for (const id of editIds) {
        const loaded = yield* edits.load(id)
        if (Option.isNone(loaded)) {
          failedTiles += 1
          continue
        }
        const edit = loaded.value
        const tile = yield* renderEditTile({
          cellSize: CELL_EXPORT_SIZE,
          chain: edit.chain,
          source: edit.source,
        })
        if (!tile.ok) {
          failedTiles += 1
        }
        tiles.push(tile.image)
      }
      const image = composeGrid(tiles, layout)
      // The pixels bypass the model entirely (see export-frame.ts).
      setExportFrame(image)
      return CollageExportSnapshotted({ failedTiles })
      }).pipe(
      Effect.matchEager({
        // Any failure of load/render/compose degrades to a dialog error —
        // the collage itself is untouched (auto-save owns its persistence).
        onFailure: (error) =>
          CollageExportSnapshotFailed({ message: `could not compose the collage: ${String(error)}` }),
        onSuccess: (message) => message,
      }),
    ),
  messages: [CollageExportSnapshotted, CollageExportSnapshotFailed],
})

/**
 * Encode the composed frame on Export press — no live size preview (the
 * same trade as the editor's dialog). The previous blob URL is revoked here;
 * the model's `exportUrl` is only ever replaced, never leaked.
 */
export const EncodeCollageExport = Command.define('EncodeCollageExport', {
  args: {
    previousUrl: S.NullOr(S.String),
    settings: ExportSettings,
  },
  execute: ({ settings, previousUrl }) =>
    Effect.gen(function* EncodeCollageExport() {
      const image = peekExportFrame()
      if (!image) {
        return CollageEncodeFailed({ message: 'no composed frame to encode' })
      }
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
      return CollageEncodePrepared({ sizeBytes: bytes.byteLength, url })
    }).pipe(
      Effect.catchTag('EncodeError', (err: EncodeError) =>
        Effect.succeed(CollageEncodeFailed({ message: err.message })),
      ),
    ),
  messages: [CollageEncodePrepared, CollageEncodeFailed],
})

/** Trigger the browser download of the encoded blob (the url stays alive
 *  until the dialog closes — the tweak-and-re-export loop needs it). */
export const DownloadCollageExport = Command.define('DownloadCollageExport', {
  args: { filename: S.String, url: S.String },
  execute: ({ filename, url }) =>
    Effect.sync(() => {
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      return CollageDownloaded({ url })
    }),
  messages: [CollageDownloaded],
})

/** Revoke a blob URL (dialog close, stale encode result). */
export const RevokeCollageExportUrl = Command.define('RevokeCollageExportUrl', {
  args: { url: S.String },
  execute: ({ url }) =>
    Effect.sync(() => {
      URL.revokeObjectURL(url)
    }).pipe(Effect.as(CollageExportUrlRevoked())),
  messages: [CollageExportUrlRevoked],
})

/** Restore persisted export settings (shared key with the editor, docs/adr/0031). */
export const LoadCollageExportSettings = Command.define('LoadCollageExportSettings', {
  execute: Effect.map(loadExportSettings, (settings) => CollageExportSettingsLoaded({ settings })),
  messages: [CollageExportSettingsLoaded],
})

/** Persist export settings (fired on every change; localStorage is cheap). */
export const SaveCollageExportSettings = Command.define('SaveCollageExportSettings', {
  args: { settings: ExportSettings },
  execute: ({ settings }) =>
    Effect.as(Effect.ignore(saveExportSettings(settings)), CollageExportSettingsSaved()),
  messages: [CollageExportSettingsSaved],
})
