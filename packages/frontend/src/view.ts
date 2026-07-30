import { Html } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import type { Model } from './app/model'
import type { AppMessage } from './app/message'
import { topBar } from './editor/topBar'
import { toolPanel } from './editor/toolPanel'
import { layerDrawer } from './editor/layerDrawer'
import { canvasStage } from './editor/canvasStage'

export const view = (model: Model, h: HtmlBuilder<AppMessage>): Html.Document => ({
  title: 'Lutra',
  body: layout(h, model),
})

const layout = (
  h: HtmlBuilder<AppMessage>,
  model: Model,
) => {
  const hasImage = model.source.status === 'loaded' && !!model.source.bitmap
  return h.div(
    [h.Class('flex h-full flex-col bg-bg text-ink')],
    [
      topBar(h, hasImage),
      h.div(
        [h.Class('flex min-h-0 flex-1')],
        [
          toolPanel(h, model.draft !== null),
          canvasStage(h, model),
          layerDrawer(h, model),
        ],
      ),
    ],
  )
}