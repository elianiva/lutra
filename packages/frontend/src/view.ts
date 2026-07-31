import { Html } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import type { Model } from './app/model'
import type { AppMessage } from './app/message'
import { hasImage } from './app/phase'
import { topBar } from './editor/top-bar'
import { toolPanel } from './editor/tool-panel'
import { layerDrawer } from './editor/layer-drawer'
import { canvasStage } from './editor/canvas-stage'

export const view = (model: Model, h: HtmlBuilder<AppMessage>): Html.Document => ({
  title: 'Lutra',
  body: layout(h, model),
})

const layout = (h: HtmlBuilder<AppMessage>, model: Model) => {
  // The image lifecycle is the phase machine's job (app/phase.ts) — "is an
  // image showing" is a phase check, not a source.status check.
  const imageLoaded = hasImage(model.phase)
  return h.div(
    [h.Class('flex h-full flex-col bg-bg text-ink')],
    [
      topBar(h, imageLoaded),
      h.div(
        [h.Class('flex min-h-0 flex-1')],
        [toolPanel(h, model), canvasStage(h, model), layerDrawer(h, model)],
      ),
    ],
  )
}
