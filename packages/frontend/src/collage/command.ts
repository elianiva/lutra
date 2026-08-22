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
import type { EditId, StoreError } from '@lutra/store'
import {
  CollageExportSnapshotFailed,
  CollageExportSnapshotted,
  CollageLoaded,
  CollageSaved,
  CollageMissing,
  LoadFailed,
  NavigatedBack,
  SaveFailed,
} from './message'
import { renderEditTile } from './render-tile'
import { CELL_SIZE, composeGrid } from './compose'
import { setFrame } from '../export-dialog'

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

/**
 * Compose the export frame once per dialog open (docs/adr/0031): load every
 * referenced Edit in full (source bytes + chain), render each chain to its
 * square cell through the GPU, and draw the grid at the shared machine's
 * `CELL_SIZE`. The composed ImageData is slotted for the dialog's lifetime
 * — pressing Export re-encodes without re-rendering. A tile whose Edit
 * vanished mid-flow, or whose render failed, leaves its cell as background;
 * `failedTiles` counts them so the screen can say so.
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
          cellSize: CELL_SIZE,
          chain: edit.chain,
          source: edit.source,
        })
        if (!tile.ok) {
          failedTiles += 1
        }
        tiles.push(tile.image)
      }
      const image = composeGrid(tiles, layout)
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
