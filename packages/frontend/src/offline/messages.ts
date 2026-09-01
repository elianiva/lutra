import { Schema as S } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { LutIdSchema } from '@lutra/engine'
import type { LutId } from '@lutra/engine'


export interface FillFile {
  readonly path: string
  readonly lutId: LutId | null
}

export type FillEvent =
  | { readonly _tag: 'FillStarted'; readonly total: number; readonly done: number }
  | { readonly _tag: 'FillFileStarted'; readonly file: FillFile }
  | { readonly _tag: 'FillFileCompleted'; readonly file: FillFile }
  | { readonly _tag: 'FillFileFailed'; readonly file: FillFile }
  | { readonly _tag: 'FillPaused' }
  | { readonly _tag: 'FillResumed' }
  // cached").
  | { readonly _tag: 'FillComplete' }
  | { readonly _tag: 'FillQuotaError'; readonly message: string }

export const OfflineMessage = defineMessageUnion({
  OfflineFillStarted: {
    done: S.Number,
    total: S.Number,
  },
  OfflineFileStarted: {
    lutId: S.NullOr(LutIdSchema),
  },
  OfflineFileCompleted: {
    lutId: S.NullOr(LutIdSchema),
  },
  OfflineFileFailed: {
    lutId: S.NullOr(LutIdSchema),
  },
  OfflineFillPaused: {},
  OfflineFillResumed: {},
  OfflineFillComplete: {},
  OfflineQuotaError: {
    message: S.String,
  },
  ConnectivityChanged: {
    online: S.Boolean,
  },
  OfflineFillRequested: {},
  // a quota retry).
  StoragePersisted: {
    persisted: S.Boolean,
  },
  OfflineReadyDismissed: {},
})
export type OfflineMessage = typeof OfflineMessage.Type

/** FillEvent → root message, the bridge the root subscription applies. */
export const fillEventToMessage = (event: FillEvent): OfflineMessage =>
  event._tag === 'FillStarted'
    ? OfflineMessage.OfflineFillStarted({ done: event.done, total: event.total })
    : event._tag === 'FillFileStarted'
      ? OfflineMessage.OfflineFileStarted({ lutId: event.file.lutId })
      : event._tag === 'FillFileCompleted'
        ? OfflineMessage.OfflineFileCompleted({ lutId: event.file.lutId })
        : event._tag === 'FillFileFailed'
          ? OfflineMessage.OfflineFileFailed({ lutId: event.file.lutId })
          : event._tag === 'FillPaused'
            ? OfflineMessage.OfflineFillPaused()
            : event._tag === 'FillResumed'
              ? OfflineMessage.OfflineFillResumed()
              : event._tag === 'FillComplete'
                ? OfflineMessage.OfflineFillComplete()
                : OfflineMessage.OfflineQuotaError({ message: event.message })
