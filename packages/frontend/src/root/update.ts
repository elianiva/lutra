import { Effect, Match, Option, Schema as S } from 'effect'
import { Command } from 'foldkit'
import { pushUrl } from 'foldkit/navigation'
import { evo } from 'foldkit/struct'
import { EditStore, EditIdSchema } from '@lutra/store'
import { GpuBackend } from '../gpu/backend'
import { CanvasRef } from '../gpu/canvas-ref'
import { LutStore } from '../luts/store'
import { LutThumbnailer } from '../thumbs/worker-layer'
import { ImageEncoder } from '@lutra/engine'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import type { RootMessage } from './message'
import { GotGalleryMessage, GotEditorMessage, NavigatedTo } from './message'
import type { Model } from './model'
import { GalleryRoute, EditorRoute, type AppRoute } from '../route'
import * as Gallery from '../gallery'
import * as Editor from '../editor'
import { offlineMachine } from '../offline/machine'
import type { Offline } from '../offline/model'
import { OfflineFileFetching, OfflineFileDownloaded, OfflineConnectivityChanged, type EditorMessage } from '../editor/message'
import { StartOfflineFill, DismissOfflineToast } from './offline-command'
import type { OfflineFill } from '../offline/fill'

type Resource =
  | GpuBackend
  | LutStore
  | CanvasRef
  | ImageEncoder
  | KeyValueStore
  | EditStore
  | LutThumbnailer
  | OfflineFill

export type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<RootMessage, never, Resource>>,
]

/** Push the editor URL for an Edit the user opened from the gallery. The URL
 *  change triggers a `ChangedRoute`, which moves the editor into place — this
 *  Command is just the side effect that starts it. */
const NavigateToEdit = Command.define('NavigateToEdit', {
  args: { id: EditIdSchema },
  messages: [NavigatedTo],
  execute: ({ id }) => pushUrl(`/edit/${id}`).pipe(Effect.as(NavigatedTo())),
})

const withRoute = (model: Model, route: Model['route']) => evo(model, { route: (_) => route })

/** The route changed (browser back/forward, a pushed URL): set the route and
 *  let the active Submodel derive its state — one arm per Submodel, calling
 *  its `informRouteChanged` (informingSubmodels.md). */
const applyRoute = (model: Model, route: AppRoute) =>
  Match.value(route).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.when(S.is(GalleryRoute), (route) => {
      const [nextGallery, cmds] = Gallery.informRouteChanged(model.gallery, route)
      const mapped = Command.mapMessages(cmds, (m) => GotGalleryMessage({ message: m }))
      return [withRoute(evo(model, { gallery: (_) => nextGallery }), route), mapped]
    }),
    Match.when(S.is(EditorRoute), (route) => {
      const [nextEditor, cmds] = Editor.informRouteChanged(model.editor, route)
      const mapped = Command.mapMessages(cmds, (m) => GotEditorMessage({ message: m }))
      return [withRoute(evo(model, { editor: (_) => nextEditor }), route), mapped]
    }),
    Match.orElse((route) => [withRoute(model, route), []]),
  )

/** Step the offline machine with a landed message; carries the new phase. */
const stepOffline = (offline: Offline, message: RootMessage): Offline => {
  const result = offlineMachine.step(offline.phase, message)
  return { ...offline, phase: result.state }
}

/** Delegate an offline fact into the editor Submodel (docs/adr/0009: every
 *  child change flows through the child's update) — the LUT bar reads the
 *  per-LUT download states and the online flag from the editor model. The
 *  editor can surface nothing for these facts (no EditCreated), but the out
 *  channel is handled the same way as GotEditorMessage's for safety. */
const delegateToEditor = (model: Model, editorMessage: EditorMessage): UpdateReturn => {
  const [nextEditor, cmds, out] = Editor.update(model.editor, editorMessage)
  const mapped = Command.mapMessages(cmds, (m) => GotEditorMessage({ message: m }))
  return Option.match(out, {
    onNone: () => [evo(model, { editor: (_) => nextEditor }), mapped],
    onSome: ({ id }) => [
      evo(model, { editor: (_) => nextEditor }),
      [...mapped, NavigateToEdit({ id })],
    ],
  })
}

/**
 * The root orchestrated update (docs/adr/0009). Routing facts (`ChangedRoute`,
 * `Navigated`) are handled here; a `Got*Message` delegates to the owning
 * Submodel's `update` and lifts the results. The root owns navigation, so it
 * reacts to the Gallery's `OpenedEdit` OutMessage by pushing the editor URL.
 * The offline messages (docs/adr/0015) are the one root-owned domain: the
 * fill machine steps here, the counters live in the offline slice, and the
 * per-file/connectivity facts delegate into the editor.
 */
export const update = (model: Model, message: RootMessage): UpdateReturn =>
  Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      ChangedRoute: ({ route }) => applyRoute(model, route),
      Navigated: () => [model, []],
      GotGalleryMessage: ({ message: galleryMessage }) => {
        const [nextGallery, cmds, out] = Gallery.update(model.gallery, galleryMessage)
        const mapped = Command.mapMessages(cmds, (m) => GotGalleryMessage({ message: m }))
        return Option.match(out, {
          onNone: () => [evo(model, { gallery: (_) => nextGallery }), mapped],
          onSome: ({ id }) => [
            evo(model, { gallery: (_) => nextGallery }),
            [...mapped, NavigateToEdit({ id })],
          ],
        })
      },
      GotEditorMessage: ({ message: editorMessage }) => {
        const [nextEditor, cmds, out] = Editor.update(model.editor, editorMessage)
        const mapped = Command.mapMessages(cmds, (m) => GotEditorMessage({ message: m }))
        return Option.match(out, {
          onNone: () => [evo(model, { editor: (_) => nextEditor }), mapped],
          // A save created a new Edit (fresh-pick Save or Save as): push the
          // editor URL for it, exactly as for a gallery tile — reload then
          // re-attaches to the saved Edit (the URL always addresses the
          // editor's attachment).
          onSome: ({ id }) => [
            evo(model, { editor: (_) => nextEditor }),
            [...mapped, NavigateToEdit({ id })],
          ],
        })
      },
      NavigatedTo: () => [model, []],

      // ---- offline library (docs/adr/0015) ----
      // The fill's bridged events: the root owns the machine and the
      // counters; cube-file facts delegate into the editor (the LUT bar's
      // per-row states). Every arm steps the machine first — messages with
      // no edge leave the phase unchanged.

      // A run began: seed the progress counters (total = full library, done
      // = already-cached files the run's diff found).
      OfflineFillStarted: ({ total, done }) => [
        evo(model, {
          offline: (o) => ({ ...stepOffline(o, message), downloaded: done, total }),
        }),
        [],
      ],
      // A file fetch began; cube files mark their LUT row fetching.
      OfflineFileStarted: ({ lutId }) =>
        lutId === null
          ? [model, []]
          : delegateToEditor(model, OfflineFileFetching({ lutId })),
      // A file landed in the cache: bump the count; cube files mark their
      // LUT row downloaded.
      OfflineFileCompleted: ({ lutId }) => {
        const withOffline = evo(model, {
          offline: (o) => ({
            ...stepOffline(o, message),
            downloaded: o.downloaded + 1,
          }),
        })
        return lutId === null
          ? [withOffline, []]
          : delegateToEditor(withOffline, OfflineFileDownloaded({ lutId }))
      },
      // A file gave up after its retries: no state change — absence in the
      // editor's download map means "not downloaded", and the next run's
      // diff retries it.
      OfflineFileFailed: () => [model, []],
      // The device went offline mid-run / the loop resumed: the machine
      // follows the loop's own announcements.
      OfflineFillPaused: () => [evo(model, { offline: (o) => stepOffline(o, message) }), []],
      OfflineFillResumed: () => [evo(model, { offline: (o) => stepOffline(o, message) }), []],
      // The run finished: Ready, the toast shows, and the auto-dismiss
      // timer starts (a click dismisses it earlier).
      OfflineFillComplete: () => [
        evo(model, {
          offline: (o) => ({ ...stepOffline(o, message), readyToast: true }),
        }),
        [DismissOfflineToast()],
      ],
      // Storage filled up: the machine shows QuotaError and the app retries
      // once — gated on a fresh persist() grant (a denied grant stops the
      // loop; the card's retry button is the manual path back in).
      OfflineQuotaError: () => [
        evo(model, { offline: (o) => stepOffline(o, message) }),
        [StartOfflineFill({ requirePersist: true })],
      ],
      // The browser's online state: the machine's Paused transition (when
      // offline), the slice's flag, and the editor's dimming flag.
      ConnectivityChanged: ({ online }) => {
        const withOffline = evo(model, {
          offline: (o) => ({ ...stepOffline(o, message), online }),
        })
        return delegateToEditor(withOffline, OfflineConnectivityChanged({ online }))
      },
      // The saveData gate's manual start button.
      OfflineFillRequested: () => [model, [StartOfflineFill({ requirePersist: false })]],
      StoragePersisted: ({ persisted }) => [
        evo(model, { offline: (o) => ({ ...o, persisted }) }),
        [],
      ],
      OfflineReadyDismissed: () => [
        evo(model, { offline: (o) => ({ ...o, readyToast: false }) }),
        [],
      ],
    }),
  )
