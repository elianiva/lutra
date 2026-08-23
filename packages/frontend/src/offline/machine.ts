import { Option, Schema as S } from 'effect'
import { Machine } from 'foldkit/experimental'
import { to, when } from 'foldkit/experimental/machine'
import { ts } from 'foldkit/schema'
import { AppMessage } from '../root/message'

// The offline library's fill state machine (CONTEXT.md "Offline fill"). One
// state union owning the fill's lifecycle — the main menu's progress card
// and the "Offline ready" toast read it. The machine is not a runtime:
// `phase` lives in the root Model's offline slice, and root update steps it
// with every landed message. Messages with no edge from the current state
// are ignored — that absence of an edge IS the behavior (a completed fill
// ignores every event; a paused fill ignores a second pause).
//
// The machine steps on the full AppMessage union (like the editor's
// machine steps on EditorMessage): root update steps it with whatever
// message lands; only the offline messages below have edges.

/** Nothing has been downloaded this session (or the library is already
 *  complete from a previous session — the fill no-ops then). */
export const Idle = ts('Idle')
/** A fill run is in flight — the loop is mirroring the missing files. */
export const Filling = ts('Filling')
/** The device went offline mid-run; the loop waits and resumes on its own. */
export const Paused = ts('Paused')
/** Every downloadable file is cached — the app works offline. */
export const Ready = ts('Ready')
/** Storage is full; the run stopped and a persist()-granted retry is due. */
export const QuotaError = ts('QuotaError')

export const OfflinePhase = S.Union([Idle, Filling, Paused, Ready, QuotaError])
export type OfflinePhase = typeof OfflinePhase.Type

export const offlineMachine = Machine.define({
  message: AppMessage,
  state: OfflinePhase,
})({
  initial: Idle(),
  states: {
    Filling: {
      on: {
        // The network dropped (or the loop noticed mid-run): paused. The
        // loop resumes itself and announces it with OfflineFillResumed —
        // the machine never races the loop.
        ConnectivityChanged: [
          when(
            (_state, message) => (message.online ? Option.none() : Option.some(true)),
            'Paused',
            () => Paused(),
          ),
        ],
        OfflineFillPaused: to('Paused', () => Paused()),
        // Storage filled up mid-run: stop and retry once with a fresh grant.
        OfflineQuotaError: to('QuotaError', () => QuotaError()),
        // Every missing file is cached: the app is ready to work offline.
        OfflineFillComplete: to('Ready', () => Ready()),
      },
    },
    Idle: {
      on: {
        // A run began: the loop diffed the catalog and is fetching. Also the
        // edge that leaves QuotaError — the persist-retry restarts the run.
        // (The manual start button's OfflineFillRequested does NOT
        // transition: the run announces itself with Started, and the machine
        // never races the loop.)
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
