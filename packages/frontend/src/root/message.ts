import { Schema as S } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { AppRoute } from '../route'
import * as Gallery from '../gallery/message'
import * as Editor from '../editor/message'
import * as Collage from '../collage/message'
import { OfflineMessage } from '../offline/messages'

// The root orchestrated Submodel Messages (docs/adr/0009): routing facts the
// root owns (`ChangedRoute`, `Navigated`) plus the `Got*Message` wrappers that
// lift a child Submodel's Message into the root's message universe. The
// wrappers carry routing, not payload — any domain payload lives inside the
// child Message (submodel.md).

export const RootMessage = defineMessageUnion({
  ChangedRoute: { route: AppRoute },
  Navigated: { request: S.Unknown },
  GotGalleryMessage: { message: Gallery.GalleryMessage },
  GotEditorMessage: { message: Editor.EditorMessage },
  GotCollageMessage: { message: Collage.CollageMessage },
  /** The root pushed `/edit/:id` in response to a Gallery `OpenedEdit` fact.
   *  Observability only — the URL change itself drives the route transition. */
  NavigatedTo: {},
})
export type RootMessage = typeof RootMessage.Type

/**
 * The application's full message universe: everything the root's update
 * handles — the root-owned routing/wrappers plus the offline slice
 * (docs/adr/0015). The root owns the fill machine, so its Messages sit in
 * the root loop unwrapped rather than behind a `Got*Message`.
 */
export const AppMessage = S.Union([RootMessage, OfflineMessage])
export type AppMessage = typeof AppMessage.Type
