import { Document, HtmlBuilder } from 'foldkit/html'
import type { Model } from './model'
import type { RootMessage } from './message'
import { GotGalleryMessage, GotEditorMessage } from './message'
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

const activeRoute = (model: Model, h: HtmlBuilder<RootMessage>) => {
  const route = model.route
  if (route._tag === 'Gallery') {
    return h.submodel({
      slotId: 'gallery',
      model: model.gallery,
      view: Gallery.view,
      toParentMessage: (message) => GotGalleryMessage({ message }),
    })
  }
  if (route._tag === 'Editor') {
    return h.submodel({
      slotId: 'editor',
      model: model.editor,
      view: Editor.view,
      toParentMessage: (message) => GotEditorMessage({ message }),
    })
  }
  return notFound(h)
}

const notFound = (h: HtmlBuilder<RootMessage>) =>
  h.div(
    [h.Class('flex flex-1 items-center justify-center text-sm text-muted')],
    ['Not found'],
  )
