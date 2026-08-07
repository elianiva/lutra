import { Submodel } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import { hasImage } from './phase'
import type { EditorMessage } from './message'
import type { Model } from './model'
import { topBar } from './top-bar'
import { toolPanel } from './tool-panel'
import { layerDrawer } from './layer-drawer'
import { canvasStage } from './canvas-stage'
import { lutBar } from './lut-bar'
import { exportDialogView } from './export-dialog'

/**
 * The Editor submodel's view (docs/adr/0009). Branded via `defineView` so it
 * embeds under the root through `h.submodel`, and its `h` is typed to the
 * Editor's own Message union — every handler this view builds dispatches
 * through the Editor boundary (wrapped up as `GotEditorMessage` by the root).
 */
export const view = Submodel.defineView<Model, EditorMessage>((model, h) => layout(h, model))

const layout = (h: HtmlBuilder<EditorMessage>, model: Model) => {
  // "Is an image showing" is a phase check, not a source.status check.
  const imageLoaded = hasImage(model.phase)
  return h.div(
    [h.Class('flex h-full flex-col bg-bg text-ink')],
    [
      topBar(h, model, imageLoaded),
      h.div(
        [h.Class('flex min-h-0 flex-1')],
        [toolPanel(h, model), canvasStage(h, model), layerDrawer(h, model)],
      ),
      // The bottom LUT bar (docs/adr/0012): a third flex-col child, so the
      // canvas shrinks while it is open and the strip sits directly under
      // the photo. Renders nothing without a LUT target.
      lutBar(h, model),
      exportDialogView(h, model),
    ],
  )
}
