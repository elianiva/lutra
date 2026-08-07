import { Document, type Html, type HtmlBuilder } from 'foldkit/html'
import { Match, Schema as S } from 'effect'
import type { Model } from './model'
import type { RootMessage } from './message'
import { GotGalleryMessage, GotEditorMessage } from './message'
import { GalleryRoute, EditorRoute } from '../route'
import * as Gallery from '../gallery'
import * as Editor from '../editor'

/**
 * The root's view (docs/adr/0009). Emits a whole-document shell and embeds
 * exactly one Submodel under the active route arm, each in its own slot, so
 * navigating gallery↔editor tears down one and builds the other fresh (route
 * view identity). The `toParentMessage` for each wraps every child Message in
 * the root's `Got*Message` so the child boundary stays intact.
 */
export const view = (model: Model, h: HtmlBuilder<RootMessage>): Document => ({
  title: 'Lutra',
  body: h.div([h.Class('flex h-full flex-col bg-bg text-ink')], [activeRoute(model, h)]),
})

const activeRoute = (model: Model, h: HtmlBuilder<RootMessage>) =>
  Match.value(model.route).pipe(
    Match.withReturnType<Html>(),
    Match.when(S.is(GalleryRoute), () =>
      h.submodel({
        slotId: 'gallery',
        model: model.gallery,
        view: Gallery.view,
        toParentMessage: (message) => GotGalleryMessage({ message }),
      }),
    ),
    Match.when(S.is(EditorRoute), () =>
      h.submodel({
        slotId: 'editor',
        model: model.editor,
        view: Editor.view,
        toParentMessage: (message) => GotEditorMessage({ message }),
      }),
    ),
    Match.orElse(() => notFound(h)),
  )

const notFound = (h: HtmlBuilder<RootMessage>) =>
  h.div(
    [h.Class('flex flex-1 items-center justify-center text-sm text-muted')],
    ['Not found'],
  )
