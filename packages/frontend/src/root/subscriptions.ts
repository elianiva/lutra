import { Effect, Queue, Stream } from 'effect'
import { Subscription } from 'foldkit'
import { OfflineFill } from '../offline/fill'
import { ConnectivityChanged, fillEventToMessage } from '../offline/messages'
import { GotCollageMessage } from './message'
import { subscriptions as collageSubscriptions } from '../collage/subscriptions'
import type { CollageMessage } from '../collage/message'
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
export const subscriptions = Subscription.aggregate<Model, RootMessage, OfflineFill>()(
  Subscription.make<Model, RootMessage, OfflineFill>()((_entry) => ({
    connectivity: Subscription.persistent(
      Stream.callback<RootMessage>((queue) =>
        Effect.gen(function* () {
          const emit = (online: boolean) =>
            Queue.offerUnsafe(queue, ConnectivityChanged({ online }))
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
      Stream.flatMap(Stream.service(OfflineFill), (service) => Stream.fromPubSub(service.events))
        .pipe(Stream.map((event): RootMessage => fillEventToMessage(event))),
    ),
  })),
  // The collage screen's gesture listeners (docs/adr/0033): the drag-and-drop
  // machine's document-level pointer/keyboard bridges plus its wheel-zoom and
  // cell-size observers, lifted across the GotCollageMessage boundary.
  Subscription.lift(collageSubscriptions)({
    toChildModel: (model: Model) => model.collage,
    toParentMessage: (message: CollageMessage): RootMessage => GotCollageMessage({ message }),
  }),
)
