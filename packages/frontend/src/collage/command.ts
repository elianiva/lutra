import { Effect, Option } from 'effect'
import { Command } from 'foldkit'
import { pushUrl } from 'foldkit/navigation'
import type { CollageStore, StoreError } from '@lutra/store'
import { CollageIdSchema, CollageStore as CollageStoreTag } from '@lutra/store'
import {
  CollageLoaded,
  CollageMissing,
  LoadFailed,
  NavigatedBack,
} from './message'

/**
 * Load one collage by id (`CollageStore.load`). A missing id lands as
 * `CollageMissing` (a distinct message: the id was fine, the record is
 * gone); a backend failure surfaces as `LoadFailed`.
 */
export const LoadCollage = Command.define('LoadCollage', {
  args: { id: CollageIdSchema },
  execute: ({ id }) =>
    Effect.gen(function* LoadCollage() {
      const store = yield* CollageStoreTag
      const loaded = yield* store.load(id)
      return Option.match(loaded, {
        onNone: () => CollageMissing(),
        onSome: (collage) => CollageLoaded({ collage }),
      })
    }).pipe(
      Effect.catchTag('StoreError', (err: StoreError) => Effect.succeed(LoadFailed({ error: err }))),
    ),
  messages: [CollageLoaded, CollageMissing, LoadFailed],
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
