import { Effect, Option, Queue, Schema as S, Stream } from 'effect'
import { Subscription } from 'foldkit'
import { OfflineFill } from '../offline/fill'
import { OfflineMessage, fillEventToMessage } from '../offline/messages'
import { AppMessage, RootMessage } from './message'
import { subscriptions as collageSubscriptions } from '../collage/subscriptions'
import type { CollageMessage } from '../collage/message'
import type { Model } from './model'
import { GalleryMessage } from '../gallery/message' /**
 * The root's subscriptions (docs/adr/0007-offline): the two bridges that feed the
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
const isImageFileForPaste = (file: File): boolean =>
  file.type.startsWith('image/') ||
  /\.(jpe?g|png|webp|avif|gif|bmp|tiff|heic|heif)$/i.test(file.name)

export const subscriptions = Subscription.aggregate<Model, AppMessage, OfflineFill>()(
  Subscription.make<Model, AppMessage, OfflineFill>()((entry) => ({
    galleryPaste: entry({ routeTag: S.String }, {
      modelToDependencies: (model: Model) => ({ routeTag: model.route._tag }),
      dependenciesToStream: ({ routeTag }: { routeTag: string }) =>
        Stream.when(
          Subscription.fromEventFilterMap({
            target: (): EventTarget =>
              // happy-dom in tests provides window; fall back to document for SSR
              // or environments without window.
              typeof window !== 'undefined' ? window : document,
            type: 'paste',
            options: { passive: false },
            toMessage: (event: Event): Option.Option<AppMessage> => {
              const e = event as ClipboardEvent
              const dt = e.clipboardData
              if (!dt) {
                return Option.none()
              }
              const files: File[] = []
              for (let i = 0; i < dt.files.length; i++) {
                const f = dt.files.item(i)
                if (f) {
                  files.push(f)
                }
              }
              if (files.length === 0) {
                for (const item of Array.from(dt.items ?? [])) {
                  if (item.kind === 'file') {
                    const f = item.getAsFile()
                    if (f) {
                      files.push(f)
                    }
                  }
                }
              }
              if (files.length === 0) {
                return Option.none()
              }
              const images = files.filter(isImageFileForPaste)
              if (images.length === 0) {
                return Option.none()
              }
              e.preventDefault()
              return Option.some(
                RootMessage.GotGalleryMessage({
                  message: GalleryMessage.FilesPasted({ files: images }),
                }),
              )
            },
          }),
          Effect.sync(() => routeTag === 'Gallery'),
        ),
    }),
    connectivity: Subscription.persistent(
      Stream.callback<AppMessage>((queue) =>
        Effect.gen(function* () {
          const emit = (online: boolean) =>
            Queue.offerUnsafe(queue, OfflineMessage.ConnectivityChanged({ online }))
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
      ).pipe(Stream.map((event): AppMessage => fillEventToMessage(event))),
    ),
  })),
  // The collage screen's gesture listeners (docs/adr/0009-collage): the drag-and-drop
  // machine's document-level pointer/keyboard bridges plus its wheel-zoom and
  // cell-size observers, lifted across the GotCollageMessage boundary.
  Subscription.lift(collageSubscriptions)({
    toChildModel: (model: Model) => model.collage,
    toParentMessage: (message: CollageMessage): AppMessage =>
      RootMessage.GotCollageMessage({ message }),
  }),
)
