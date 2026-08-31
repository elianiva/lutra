import { Effect, Match, Schema as S } from 'effect'
import { Command, Update } from 'foldkit'
import { pushUrl } from 'foldkit/navigation'
import { evo } from 'foldkit/struct'
import type { EditStore, CollageStore } from '@lutra/store'
import { EditIdSchema, CollageIdSchema } from '@lutra/store'
import type { GpuBackend } from '../gpu/backend'
import type { CanvasRef } from '../gpu/canvas-ref'
import type { LutStore } from '../luts/store'
import type { LutThumbnailer } from '../thumbs/worker-layer'
import type { ImageEncoder } from '@lutra/engine'
import type { KeyValueStore } from 'effect/unstable/persistence/KeyValueStore'
import { AppMessage, RootMessage } from './message'
import type { Model } from './model'
import { GalleryRoute, EditorRoute, CollageRoute, CollageHomeRoute } from '../route'
import type { AppRoute } from '../route'
import * as Gallery from '../gallery'
import * as Editor from '../editor'
import * as Collage from '../collage'
import { OfflineMessage } from '../offline/messages'
import { offlineMachine } from '../offline/machine'
import type { Offline } from '../offline/model'
import { EditorMessage } from '../editor/message'
import { StartOfflineFill, DismissOfflineToast } from './offline-command'
import type { OfflineFill } from '../offline/fill'

type Resource =
  | GpuBackend
  | LutStore
  | CanvasRef
  | ImageEncoder
  | KeyValueStore
  | EditStore
  | CollageStore
  | LutThumbnailer
  | OfflineFill

export type UpdateReturn = Update.Return<Model, AppMessage, Resource>

/** Push the editor URL for an Edit the user opened from the gallery. The URL
 *  change triggers a `ChangedRoute`, which moves the editor into place — this
 *  Command is just the side effect that starts it. */
const NavigateToEdit = Command.define('NavigateToEdit', {
  args: { id: EditIdSchema },
  execute: ({ id }) => pushUrl(`/edit/${id}`).pipe(Effect.as(RootMessage.NavigatedTo())),
  messages: [RootMessage.NavigatedTo],
})

/** Push the menu URL for a bare `/collage` (no id): collages are created
 *  persist-first from the gallery, so there is no "new collage" screen to
 *  show — the bare form is a redirect, not a destination. */
const NavigateHome = Command.define('NavigateHome', {
  execute: pushUrl('/').pipe(Effect.as(RootMessage.NavigatedTo())),
  messages: [RootMessage.NavigatedTo],
})

/** Push the collage URL for a Collage the user created from the gallery. The
 *  URL change triggers a `ChangedRoute`, which moves the collage screen into
 *  place — this Command is just the side effect that starts it. */
const NavigateToCollage = Command.define('NavigateToCollage', {
  args: { id: CollageIdSchema },
  execute: ({ id }) => pushUrl(`/collage/${id}`).pipe(Effect.as(RootMessage.NavigatedTo())),
  messages: [RootMessage.NavigatedTo],
})

const withRoute = (model: Model, route: Model['route']) => evo(model, { route: (_) => route })

/** The route changed (browser back/forward, a pushed URL): set the route and
 *  let the active Submodel derive its state — one arm per Submodel, calling
 *  its `informRouteChanged` (informingSubmodels.md). */
const applyRoute = (model: Model, route: AppRoute) =>
  Match.value(route).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.when(S.is(GalleryRoute), (route) => {
      const { model: nextGallery, commands: cmds = [] } = Gallery.informRouteChanged(
        model.gallery,
        route,
      )
      const mapped = Command.mapMessages(cmds, (m) => RootMessage.GotGalleryMessage({ message: m }))
      return {
        model: withRoute(evo(model, { gallery: (_) => nextGallery }), route),
        commands: mapped,
      }
    }),
    Match.when(S.is(EditorRoute), (route) => {
      const { model: nextEditor, commands: cmds = [] } = Editor.informRouteChanged(
        model.editor,
        route,
      )
      const mapped = Command.mapMessages(cmds, (m) => RootMessage.GotEditorMessage({ message: m }))
      return {
        model: withRoute(evo(model, { editor: (_) => nextEditor }), route),
        commands: mapped,
      }
    }),
    Match.when(S.is(CollageHomeRoute), (route) => {
      // Bare `/collage` is a redirect home, not a screen.
      return { model: withRoute(model, route), commands: [NavigateHome()] }
    }),
    Match.when(S.is(CollageRoute), (route) => {
      const { model: nextCollage, commands: cmds = [] } = Collage.informRouteChanged(
        model.collage,
        route,
      )
      const mapped = Command.mapMessages(cmds, (m) => RootMessage.GotCollageMessage({ message: m }))
      return {
        model: withRoute(evo(model, { collage: (_) => nextCollage }), route),
        commands: mapped,
      }
    }),
    Match.orElse((route) => ({ model: withRoute(model, route) })),
  )

/** Step the offline machine with a landed message; carries the new phase. */
const stepOffline = (offline: Offline, message: AppMessage): Offline => {
  if (!S.is(OfflineMessage)(message)) {
    return offline
  }
  const result = offlineMachine.step(offline.phase, message)
  return { ...offline, phase: result.state }
}

/** Delegate an offline fact into the editor Submodel (docs/adr/0006-frontend-architecture: every
 *  child change flows through the child's update) — the LUT bar reads the
 *  per-LUT download states and the online flag from the editor model. The
 *  editor can surface nothing for these facts (no EditCreated), but the out
 *  channel is handled the same way as GotEditorMessage's for safety. */
const delegateToEditor = (model: Model, editorMessage: EditorMessage): UpdateReturn => {
  const {
    model: nextEditor,
    commands: cmds = [],
    outMessage: out,
  } = Editor.update(model.editor, editorMessage)
  const mapped = Command.mapMessages(cmds, (m) => RootMessage.GotEditorMessage({ message: m }))
  return out === undefined
    ? { model: evo(model, { editor: (_) => nextEditor }), commands: mapped }
    : {
        model: evo(model, { editor: (_) => nextEditor }),
        commands: [...mapped, NavigateToEdit({ id: out.id })],
      }
}

/**
 * The root orchestrated update (docs/adr/0006-frontend-architecture). Routing facts (`ChangedRoute`,
 * `Navigated`) are handled here; a `Got*Message` delegates to the owning
 * Submodel's `update` and lifts the results. The root owns navigation, so it
 * reacts to the Gallery's `OpenedEdit` OutMessage by pushing the editor URL.
 * The offline messages (docs/adr/0007-offline) are the one root-owned domain: the
 * fill machine steps here, the counters live in the offline slice, and the
 * per-file/connectivity facts delegate into the editor.
 */
export const update = (model: Model, message: AppMessage): UpdateReturn => {
  if (message._tag === 'ChangedRoute') {
    return applyRoute(model, message.route)
  }
  return Match.value(message).pipe(
    Match.withReturnType<UpdateReturn>(),
    Match.tagsExhaustive({
      Navigated: () => ({ model }),
      GotGalleryMessage: ({ message: galleryMessage }) => {
        const {
          model: nextGallery,
          commands: cmds = [],
          outMessage: out,
        } = Gallery.update(model.gallery, galleryMessage)
        const mapped = Command.mapMessages(cmds, (m) =>
          RootMessage.GotGalleryMessage({ message: m }),
        )
        if (out === undefined) {
          return { model: evo(model, { gallery: (_) => nextGallery }), commands: mapped }
        }
        return {
          model: evo(model, { gallery: (_) => nextGallery }),
          commands: [
            ...mapped,
            out._tag === 'OpenedEdit'
              ? NavigateToEdit({ id: out.id })
              : NavigateToCollage({ id: out.id }),
          ],
        }
      },
      GotEditorMessage: ({ message: editorMessage }) => {
        const {
          model: nextEditor,
          commands: cmds = [],
          outMessage: out,
        } = Editor.update(model.editor, editorMessage)
        const mapped = Command.mapMessages(cmds, (m) =>
          RootMessage.GotEditorMessage({ message: m }),
        )
        if (out === undefined) {
          return { model: evo(model, { editor: (_) => nextEditor }), commands: mapped }
        }
        // A save created a new Edit (fresh-pick Save or Save as): push the
        // editor URL for it, exactly as for a gallery tile — reload then
        // re-attaches to the saved Edit (the URL always addresses the
        // editor's attachment).
        return {
          model: evo(model, { editor: (_) => nextEditor }),
          commands: [...mapped, NavigateToEdit({ id: out.id })],
        }
      },
      GotCollageMessage: ({ message: collageMessage }) => {
        const { model: nextCollage, commands: cmds = [] } = Collage.update(
          model.collage,
          collageMessage,
        )
        const mapped = Command.mapMessages(cmds, (m) =>
          RootMessage.GotCollageMessage({ message: m }),
        )
        return { model: evo(model, { collage: (_) => nextCollage }), commands: mapped }
      },
      NavigatedTo: () => ({ model }),

      // offline library (docs/adr/0007-offline)
      // The fill's bridged events: the root owns the machine and the
      // counters; cube-file facts delegate into the editor (the LUT bar's
      // per-row states). Every arm steps the machine first — messages with
      // no edge leave the phase unchanged.

      // A run began: seed the progress counters (total = full library, done
      // = already-cached files the run's diff found).
      OfflineFillStarted: ({ total, done }) => ({
        model: evo(model, {
          offline: (o) => ({ ...stepOffline(o, message), downloaded: done, total }),
        }),
      }),
      // A file fetch began; cube files mark their LUT row fetching.
      OfflineFileStarted: ({ lutId }) =>
        lutId === null
          ? { model }
          : delegateToEditor(model, EditorMessage.OfflineFileFetching({ lutId })),
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
          ? { model: withOffline }
          : delegateToEditor(withOffline, EditorMessage.OfflineFileDownloaded({ lutId }))
      },
      // A file gave up after its retries: no state change — absence in the
      // editor's download map means "not downloaded", and the next run's
      // diff retries it.
      OfflineFileFailed: () => ({ model }),
      // The device went offline mid-run / the loop resumed: the machine
      // follows the loop's own announcements.
      OfflineFillPaused: () => ({ model: evo(model, { offline: (o) => stepOffline(o, message) }) }),
      OfflineFillResumed: () => ({
        model: evo(model, { offline: (o) => stepOffline(o, message) }),
      }),
      // The run finished: Ready, the toast shows, and the auto-dismiss
      // timer starts (a click dismisses it earlier).
      OfflineFillComplete: () => ({
        model: evo(model, {
          offline: (o) => ({ ...stepOffline(o, message), readyToast: true }),
        }),
        commands: [DismissOfflineToast()],
      }),
      // Storage filled up: the machine shows QuotaError and the app retries
      // once — gated on a fresh persist() grant (a denied grant stops the
      // loop; the card's retry button is the manual path back in).
      OfflineQuotaError: () => ({
        model: evo(model, { offline: (o) => stepOffline(o, message) }),
        commands: [StartOfflineFill({ requirePersist: true })],
      }),
      // The browser's online state: the machine's Paused transition (when
      // offline), the slice's flag, and the editor's dimming flag.
      ConnectivityChanged: ({ online }) => {
        const withOffline = evo(model, {
          offline: (o) => ({ ...stepOffline(o, message), online }),
        })
        return delegateToEditor(withOffline, EditorMessage.OfflineConnectivityChanged({ online }))
      },
      // The saveData gate's manual start button.
      OfflineFillRequested: () => ({
        model,
        commands: [StartOfflineFill({ requirePersist: false })],
      }),
      StoragePersisted: ({ persisted }) => ({
        model: evo(model, { offline: (o) => ({ ...o, persisted }) }),
      }),
      OfflineReadyDismissed: () => ({
        model: evo(model, { offline: (o) => ({ ...o, readyToast: false }) }),
      }),
    }),
  )
}
