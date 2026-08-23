import { Duration, Effect, Option, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { OfflineFill } from '../offline/fill'
import { OfflineMessage } from '../offline/messages'

// The root's offline commands (docs/adr/0007-offline): the fill's start (with the
// persist() request the offline library depends on — a granted origin is
// never evicted) and the toast's auto-dismiss timer. Defined at the root
// because the offline slice is root-owned; the gallery's strip and the
// editor's LUT bar are both consumers of the same state.

/**
 * Request persistent storage, then start a fill run. The one command for
 * every path into a run: the boot auto-start (saveData unset), the manual
 * start button (saveData set), and the quota retry. `start` is idempotent
 * per run and re-armed after a quota stop, so firing it again is always
 * safe.
 *
 * `requirePersist` gates the start on the persist() grant: the quota retry
 * sets it, so a denied grant stops the retry loop (the machine stays in
 * QuotaError until the user retries from the card). The auto-start and the
 * button don't gate — persist() is a bonus there, not a precondition.
 */
export const StartOfflineFill = Command.define('StartOfflineFill', {
  args: { requirePersist: S.Boolean },
  execute: ({ requirePersist }) =>
    Effect.gen(function* () {
      const fill = yield* OfflineFill
      const persisted = yield* Effect.tryPromise(
        async () => await navigator.storage.persist(),
      ).pipe(Effect.option, Effect.map(Option.getOrElse(() => false)))
      if (!requirePersist || persisted) {
        yield* fill.start()
      }
      return OfflineMessage.StoragePersisted({ persisted })
    }),
  messages: [OfflineMessage.StoragePersisted],
})

/** Auto-dismiss the "Offline ready" toast: dispatch OfflineReadyDismissed
 *  after the toast's lifetime (a click dismisses it earlier). */
export const DismissOfflineToast = Command.define('DismissOfflineToast', {
  execute: Effect.sleep(Duration.seconds(8)).pipe(
    Effect.as(OfflineMessage.OfflineReadyDismissed()),
  ),
  messages: [OfflineMessage.OfflineReadyDismissed],
})
