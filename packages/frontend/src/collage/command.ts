import { Effect, Option } from 'effect'
import { Command } from 'foldkit'
import { pushUrl } from 'foldkit/navigation'
import {
  Collage,
  CollageIdSchema,
  CollageStore as CollageStoreTag,
  EditStore,
} from '@lutra/store'
import type { CollageStore, EditId, StoreError } from '@lutra/store'
import { CollageLoaded, CollageMissing, CollageSaved, LoadFailed, NavigatedBack, SaveFailed } from './message'

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
