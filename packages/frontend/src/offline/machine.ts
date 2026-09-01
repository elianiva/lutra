import { Option, Schema as S } from 'effect'
import { Machine } from 'foldkit/experimental'
import { to, when } from 'foldkit/experimental/machine'
import { taggedStruct } from 'foldkit/schema'
import { OfflineMessage } from './messages'

//

/** Nothing has been downloaded this session (or the library is already
 *  complete from a previous session — the fill no-ops then). */
export const Idle = taggedStruct('Idle')
/** A fill run is in flight — the loop is mirroring the missing files. */
export const Filling = taggedStruct('Filling')
/** The device went offline mid-run; the loop waits and resumes on its own. */
export const Paused = taggedStruct('Paused')
/** Every downloadable file is cached — the app works offline. */
export const Ready = taggedStruct('Ready')
/** Storage is full; the run stopped and a persist()-granted retry is due. */
export const QuotaError = taggedStruct('QuotaError')

export const OfflinePhase = S.Union([Idle, Filling, Paused, Ready, QuotaError])
export type OfflinePhase = typeof OfflinePhase.Type

export const offlineMachine = Machine.define({
  message: OfflineMessage,
  state: OfflinePhase,
})({
  initial: Idle(),
  states: {
    Filling: {
      on: {
        ConnectivityChanged: [
          when(
            (_state, message) => (message.online ? Option.none() : Option.some(true)),
            'Paused',
            () => Paused(),
          ),
        ],
        OfflineFillPaused: to('Paused', () => Paused()),
        OfflineQuotaError: to('QuotaError', () => QuotaError()),
        OfflineFillComplete: to('Ready', () => Ready()),
      },
    },
    Idle: {
      on: {
        OfflineFillStarted: to('Filling', () => Filling()),
      },
    },
    Paused: {
      on: {
        OfflineFillResumed: to('Filling', () => Filling()),
        OfflineQuotaError: to('QuotaError', () => QuotaError()),
      },
    },
    QuotaError: {
      on: {
        OfflineFillStarted: to('Filling', () => Filling()),
      },
    },
    Ready: {
      on: {},
    },
  },
})
