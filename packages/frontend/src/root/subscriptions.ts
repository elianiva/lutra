import { Effect, Queue, Stream } from 'effect'
import { Subscription } from 'foldkit'
import { OfflineFill } from '../offline/fill'
import { ConnectivityChanged, fillEventToMessage } from '../offline/messages'
import type { Model } from './model'
import type { RootMessage } from './message' /**
 * The root's subscriptions (docs/adr/0015): the two bridges that feed the
 * offline slice from the outside world.
 *
 * - `offlineFill`: the fill's per-file PubSub → root messages. The fill
 *   runs in its service layer; this stream is the ONLY consumer of its
 *   events. The PubSub is unbounded, so events published before this stream
 *   attaches (boot order: init commands fire StartOfflineFill before the
 *   subscriptions start) are buffered, not lost.
 * - `connectivity`: the browser's online/offline events (plus the initial
 *   state) → ConnectivityChanged. The fill itself polls navigator.onLine
 *   while it is offline, so this stream is UI-state-only — the machine's
 *   Paused transition and the LUT bar's dimming.
 */
export const subscriptions = Subscription.make<Model, RootMessage, OfflineFill>()((_entry) => ({
  connectivity: Subscription.persistent(
    Stream.callback<RootMessage>((queue) =>
      Effect.gen(function* connectivity() {
        const emit = (online: boolean) => Queue.offerUnsafe(queue, ConnectivityChanged({ online }))
        // The initial state, then the browser's events.
        emit(globalThis.navigator === undefined ? true : navigator.onLine)
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            const onOnline = () => emit(true)
            const onOffline = () => emit(false)
            window.addEventListener('online', onOnline)
            window.addEventListener('offline', onOffline)
            return { onOffline, onOnline }
          }),
          ({ onOnline, onOffline }) =>
            Effect.sync(() => {
              window.removeEventListener('online', onOnline)
              window.removeEventListener('offline', onOffline)
            }),
        )
        return yield* Effect.never
      }),
    ),
  ),
  offlineFill: Subscription.persistent(
    Stream.flatMap(Stream.service(OfflineFill), (service) =>
      Stream.fromPubSub(service.events),
    ).pipe(Stream.map((event): RootMessage => fillEventToMessage(event))),
  ),
}))
