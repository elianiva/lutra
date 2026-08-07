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

type Resource =
  | GpuBackend
  | LutStore
  | CanvasRef
  | ImageEncoder
  | KeyValueStore
  | EditStore
  | LutThumbnailer

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

/**
 * The root orchestrated update (docs/adr/0009). Routing facts (`ChangedRoute`,
 * `Navigated`) are handled here; a `Got*Message` delegates to the owning
 * Submodel's `update` and lifts the results. The root owns navigation, so it
 * reacts to the Gallery's `OpenedEdit` OutMessage by pushing the editor URL.
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
    }),
  )
