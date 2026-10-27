import { Effect, Option, Queue, Schema as S, Stream } from 'effect'
import { Dom, Subscription } from 'foldkit'
import { OfflineFill } from '../offline/fill'
import { OfflineMessage, fillEventToMessage } from '../offline/messages'
import { AppMessage, RootMessage } from './message'
import { EditorMessage } from '../editor/message'
import type { Model } from './model'
import { isRawFile } from '../lib/decode-image'
import { GalleryMessage } from '../gallery/message' /**
 * The root's subscriptions (docs/adr/0007-offline): the three bridges that feed
 * the offline slice from the outside world.
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
  isRawFile(file) ||
  /\.(jpe?g|png|webp|avif|gif|bmp|tiff|heic|heif)$/i.test(file.name)

const pasteTarget = (): EventTarget => ('window' in globalThis ? globalThis.window : document)

interface ClipboardLike extends Event {
  clipboardData: DataTransfer | null
}

const isClipboardEvent = (event: Event): event is ClipboardLike => 'clipboardData' in event

export const subscriptions = Subscription.aggregate<Model, AppMessage, OfflineFill>()(
  Subscription.make<Model, AppMessage, OfflineFill>()((entry) => ({
    galleryPaste: entry(
      { routeTag: S.String },
      {
        modelToDependencies: (model: Model) => ({ routeTag: model.route._tag }),
        dependenciesToStream: ({ routeTag }: { routeTag: string }) =>
          Stream.when(
            Dom.streamFromEventFilterMap({
              target: pasteTarget,
              type: 'paste',
              options: { passive: false },
              filterMapEvent: (event: Event): Option.Option<AppMessage> => {
                if (!isClipboardEvent(event)) {
                  return Option.none()
                }
                const dt = event.clipboardData
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
                event.preventDefault()
                return Option.some(
                  RootMessage.GotGalleryMessage({
                    message: GalleryMessage.FilesPasted({ files: images }),
                  }),
                )
              },
            }),
            Effect.sync(() => routeTag === 'Gallery'),
          ),
      },
    ),
    /**
     * The editor's ⌘K: opens the add-adjustment palette, the one search path
     * into the thirteen tools (docs/adr/0013-materials). A document listener
     * rather than a mount, because the palette is only in the DOM while it is
     * open — the binding has to outlive it.
     */
    editorPaletteShortcut: entry(
      { routeTag: S.String },
      {
        modelToDependencies: (model: Model) => ({ routeTag: model.route._tag }),
        dependenciesToStream: ({ routeTag }: { routeTag: string }) =>
          Stream.when(
            Stream.callback<AppMessage>((queue) =>
              Effect.gen(function* () {
                const onKeyDown = (event: KeyboardEvent) => {
                  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') {
                    return
                  }
                  event.preventDefault()
                  Queue.offerUnsafe(
                    queue,
                    RootMessage.GotEditorMessage({ message: EditorMessage.ToggledPalette() }),
                  )
                }
                yield* Effect.acquireRelease(
                  Effect.sync(() => {
                    document.addEventListener('keydown', onKeyDown)
                    return onKeyDown
                  }),
                  (listener) =>
                    Effect.sync(() => document.removeEventListener('keydown', listener)),
                )
                return yield* Effect.never
              }),
            ),
            Effect.sync(() => routeTag === 'Editor'),
          ),
      },
    ),
    connectivity: Subscription.persistentEntry(
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
    offlineFill: Subscription.persistentEntry(
      Stream.flatMap(Stream.service(OfflineFill), (service) =>
        Stream.fromPubSub(service.events),
      ).pipe(Stream.map((event): AppMessage => fillEventToMessage(event))),
    ),
  })),
)
