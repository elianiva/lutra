import { Schema as S } from 'effect'
import { Message } from 'foldkit'
import { LutIdSchema } from '@lutra/engine'
import type { LutId } from '@lutra/engine'

// The offline fill's event and message universe (CONTEXT.md "Offline
// library", "Offline fill"). The fill loop publishes FillEvents into its
// PubSub; a root subscription bridges them into the root's message loop as
// the Offline* Messages below. Root update steps the offline machine
// (./machine.ts) and forwards per-file facts into the editor Submodel (its
// LUT bar rows render per-LUT download state).

// ---- the fill's internal events (PubSub payloads) ----

// One library file to mirror: the catalog itself, a `.cube`, or a generic
// thumbnail. `lutId` is set for cube files — the LUT bar rows key on it —
// and null for catalog/thumbnail files.
export interface FillFile {
  readonly path: string
  readonly lutId: LutId | null
}

export type FillEvent =
  // A run began; `total` is the full library size, `done` the count already
  // cached from previous runs (the diff's cached side).
  | { readonly _tag: 'FillStarted'; readonly total: number; readonly done: number }
  | { readonly _tag: 'FillFileStarted'; readonly file: FillFile }
  | { readonly _tag: 'FillFileCompleted'; readonly file: FillFile }
  | { readonly _tag: 'FillFileFailed'; readonly file: FillFile }
  // The device went offline mid-run: the loop waits and resumes on its own.
  | { readonly _tag: 'FillPaused' }
  | { readonly _tag: 'FillResumed' }
  // The run finished every missing file (failures are retried on the next
  // run's diff; a run that ends here means "everything downloadable is
  // cached").
  | { readonly _tag: 'FillComplete' }
  // Storage is full: the run stops, the machine shows QuotaError, and the
  // app retries once with a fresh persist() grant.
  | { readonly _tag: 'FillQuotaError'; readonly message: string }

// ---- root messages (bridged from the PubSub, plus the UI's requests) ----

export const OfflineFillStarted = Message.m('OfflineFillStarted', {
  total: S.Number,
  done: S.Number,
})
export const OfflineFileStarted = Message.m('OfflineFileStarted', {
  lutId: S.NullOr(LutIdSchema),
})
export const OfflineFileCompleted = Message.m('OfflineFileCompleted', {
  lutId: S.NullOr(LutIdSchema),
})
export const OfflineFileFailed = Message.m('OfflineFileFailed', {
  lutId: S.NullOr(LutIdSchema),
})
export const OfflineFillPaused = Message.m('OfflineFillPaused')
export const OfflineFillResumed = Message.m('OfflineFillResumed')
export const OfflineFillComplete = Message.m('OfflineFillComplete')
export const OfflineQuotaError = Message.m('OfflineQuotaError', {
  message: S.String,
})
// The browser's online/offline state (drives the machine's Paused state and
// the LUT bar's offline dimming).
export const ConnectivityChanged = Message.m('ConnectivityChanged', {
  online: S.Boolean,
})
// The user asked to start the fill manually (the saveData gate's "Start
// offline download" button — the auto-start is skipped on metered
// connections).
export const OfflineFillRequested = Message.m('OfflineFillRequested')
// The result of the persist() request the fill makes on start (and again on
// a quota retry).
export const StoragePersisted = Message.m('StoragePersisted', {
  persisted: S.Boolean,
})
// The "Offline ready" toast was dismissed (click or the auto-dismiss timer).
export const OfflineReadyDismissed = Message.m('OfflineReadyDismissed')

/** The offline messages the root's update handles (a subset of RootMessage). */
export const OfflineMessage = S.Union([
  OfflineFillStarted,
  OfflineFileStarted,
  OfflineFileCompleted,
  OfflineFileFailed,
  OfflineFillPaused,
  OfflineFillResumed,
  OfflineFillComplete,
  OfflineQuotaError,
  ConnectivityChanged,
  OfflineFillRequested,
  StoragePersisted,
  OfflineReadyDismissed,
])
export type OfflineMessage = typeof OfflineMessage.Type

/** FillEvent → RootMessage, the bridge the root subscription applies. */
export const fillEventToMessage = (event: FillEvent): OfflineMessage =>
  event._tag === 'FillStarted'
    ? OfflineFillStarted({ total: event.total, done: event.done })
    : event._tag === 'FillFileStarted'
      ? OfflineFileStarted({ lutId: event.file.lutId })
      : event._tag === 'FillFileCompleted'
        ? OfflineFileCompleted({ lutId: event.file.lutId })
        : event._tag === 'FillFileFailed'
          ? OfflineFileFailed({ lutId: event.file.lutId })
          : event._tag === 'FillPaused'
            ? OfflineFillPaused()
            : event._tag === 'FillResumed'
              ? OfflineFillResumed()
              : event._tag === 'FillComplete'
                ? OfflineFillComplete()
                : OfflineQuotaError({ message: event.message })
