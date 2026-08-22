import { Effect, Option, Schema as S } from 'effect'
import { Duration } from 'effect'
import { Command } from 'foldkit'
import { pushUrl } from 'foldkit/navigation'
import {
  Collage,
  CollageIdSchema,
  CollageLayout,
  CollageStore as CollageStoreTag,
  CollageTile,
  EditIdSchema,
  EditStore,
} from '@lutra/store'
import type { EditId, StoreError } from '@lutra/store'
import {
  CellMeasured,
  CollageExportSnapshotFailed,
  CollageExportSnapshotted,
  CollageLoaded,
  CollageSaved,
  CollageMissing,
  LoadFailed,
  NavigatedBack,
  SaveFailed,
  ThumbsMeasured,
  UndoExpired,
  ZoomSettled,
} from './message'
import { renderEditTile } from './render-tile'
import { cellSize, composeGrid } from './compose'
import { setFrame } from '../export-dialog'

/**
 * Load one collage by id and resolve its references (docs/adr/0030): tiles
 * whose Edit no longer exists are dropped from the loaded copy — never
 * persisted until the next auto-save — and counted in `dropped` so the
 * screen can show a notice. The referenced edits' full source bytes ride
 * along as `photos` (HD preview bytes for the surviving tiles).
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
      const record = loaded.value
      const kept: CollageTile[] = []
      const photos: { id: EditId; source: Uint8Array }[] = []
      let dropped = 0
      for (const tile of record.tiles) {
        const maybe = yield* edits.load(tile.editId)
        if (Option.isSome(maybe)) {
          kept.push(tile)
          photos.push({ id: maybe.value.id, source: maybe.value.source })
        } else {
          dropped += 1
        }
      }
      return CollageLoaded({
        collage: { ...record, tiles: kept },
        photos,
        dropped,
      })
    }).pipe(
      Effect.catchTag('StoreError', (err: StoreError) =>
        Effect.succeed(LoadFailed({ error: err })),
      ),
    ),
  messages: [CollageLoaded, CollageMissing, LoadFailed],
})

/**
 * Decode each referenced source photo once to learn its pixel size
 * (docs/adr/0033) — the framing placement math needs every photo's aspect.
 * Source bytes preserve the full-resolution aspect; a source that fails to
 * decode simply keeps the cover fallback; no error surfaces.
 */
export const MeasureThumbs = Command.define('MeasureThumbs', {
  args: {
    photos: S.Array(S.Struct({ id: EditIdSchema, source: S.Uint8Array })),
  },
  execute: ({ photos }) =>
    Effect.gen(function* MeasureThumbs() {
      const sizes: {
        readonly editId: EditId
        readonly width: number
        readonly height: number
      }[] = []
      for (const { id, source } of photos) {
        // SAFETY: the store hands back image bytes over a transferred ArrayBuffer; TS cannot express that, so the BlobPart cast is the documented boundary.
        // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
        const bytes = source as BlobPart
        const decoded = yield* Effect.option(
          Effect.tryPromise(() => createImageBitmap(new Blob([bytes]))),
        )
        if (Option.isNone(decoded)) {
          continue
        }
        const bitmap = decoded.value
        sizes.push({ editId: id, width: bitmap.width, height: bitmap.height })
        yield* Effect.sync(() => bitmap.close())
      }
      return ThumbsMeasured({ sizes })
    }),
  messages: [ThumbsMeasured],
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
      Effect.catchTag('StoreError', (err: StoreError) =>
        Effect.succeed(SaveFailed({ error: err })),
      ),
    ),
  messages: [CollageSaved, SaveFailed],
})

/**
 * The undo toast's fuse (docs/adr/0033): when it burns out the undo slot
 * clears — unless a newer gesture has already replaced the slot, which the
 * sequence token guards.
 */
export const ScheduleUndoExpiry = Command.define('ScheduleUndoExpiry', {
  args: { seq: S.Number },
  execute: ({ seq }) => Effect.sleep(Duration.seconds(5)).pipe(Effect.as(UndoExpired({ seq }))),
  messages: [UndoExpired],
})

/**
 * A wheel-zoom gesture's quiet period (docs/adr/0033): after the last tick,
 * the drafted framing commits and auto-saves. Re-armed (with a new seq) by
 * every tick, so only the final one lands.
 */
export const ScheduleZoomCommit = Command.define('ScheduleZoomCommit', {
  args: { seq: S.Number },
  execute: ({ seq }) => Effect.sleep(Duration.millis(600)).pipe(Effect.as(ZoomSettled({ seq }))),
  messages: [ZoomSettled],
})

/**
 * One preview cell's CSS-pixel size was measured; the model only cares about
 * changes. Observability of the ResizeObserver — no side effect.
 */
export const ReportCellSize = Command.define('ReportCellSize', {
  args: { width: S.Number, height: S.Number },
  execute: ({ width, height }) => Effect.succeed(CellMeasured({ width, height })),
  messages: [CellMeasured],
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

/**
 * Compose the export frame once per dialog open (docs/adr/0031, 0033): load
 * every referenced Edit in full (source bytes + chain), render each chain at
 * its cell size — through the tile's framing — via the GPU, and draw the
 * grid. The composed ImageData is slotted for the dialog's lifetime —
 * pressing Export re-encodes without re-rendering. A tile whose Edit
 * vanished mid-flow, or whose render failed, leaves its cell as background;
 * `failedTiles` counts them so the screen can say so.
 */
export const SnapshotCollageExport = Command.define('SnapshotCollageExport', {
  args: { tiles: S.Array(CollageTile), layout: CollageLayout },
  execute: ({ tiles, layout }) =>
    Effect.gen(function* SnapshotCollageExport() {
      const edits = yield* EditStore
      const cell = cellSize(layout, tiles.length)
      const images: ImageData[] = []
      let failedTiles = 0
      for (const tile of tiles) {
        const loaded = yield* edits.load(tile.editId)
        if (Option.isNone(loaded)) {
          failedTiles += 1
          continue
        }
        const edit = loaded.value
        const rendered = yield* renderEditTile({
          cell,
          chain: edit.chain,
          framing: tile.framing,
          source: edit.source,
        })
        if (!rendered.ok) {
          failedTiles += 1
        }
        images.push(rendered.image)
      }
      const image = composeGrid(images, layout)
      // The pixels bypass the model entirely (see export-dialog/frame.ts).
      setFrame(image)
      return CollageExportSnapshotted({ failedTiles })
    }).pipe(
      Effect.matchEager({
        // Any failure of load/render/compose degrades to a dialog error —
        // the collage itself is untouched (auto-save owns its persistence).
        onFailure: (error) =>
          CollageExportSnapshotFailed({
            message: `could not compose the collage: ${String(error)}`,
          }),
        onSuccess: (message) => message,
      }),
    ),
  messages: [CollageExportSnapshotted, CollageExportSnapshotFailed],
})
