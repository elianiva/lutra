import { Option } from 'effect'
import { Submodel } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import { Boxes, Layers as LayersIcon, SlidersHorizontal, type IconNode } from 'lucide'
import { hasImage } from './phase'
import type { EditorMessage } from './message'
import { ToggledLutPicker, ToggledMobileSheet } from './message'
import type { Model } from './model'
import { topBar } from './top-bar'
import { toolPanel } from './tool-panel'
import { layerDrawer } from './layer-drawer'
import { canvasStage } from './canvas-stage'
import { lutBar } from './lut-bar'
import { lutTarget } from './lut-bar/target'
import { exportDialogView } from './export-dialog'
import { icon } from '../components/icon'

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
      // The three columns stack on mobile (docs/adr/0024-mobile-ui): the canvas
      // first, the two panels below as max-height bottom sheets toggled by
      // the mobile tab bar. `lg:` restores the side-by-side layout — the
      // sheets and the tab bar render hidden there (their classes are
      // `lg:`-scoped, so the desktop layout is untouched).
      h.div(
        [h.Class('flex min-h-0 flex-1 flex-col lg:flex-row')],
        [
          toolPanel(h, model, model.mobileSheet === 'tools'),
          canvasStage(h, model),
          layerDrawer(h, model, model.mobileSheet === 'layers'),
        ],
      ),
      // The bottom LUT bar (docs/adr/0012): a third flex-col child, so the
      // canvas shrinks while it is open and the strip sits directly under
      // the photo. Renders nothing without a LUT target.
      lutBar(h, model),
      // The mobile tab bar (docs/adr/0024-mobile-ui): toggles the two bottom sheets,
      // plus a LUT toggle while a LUT target exists. Hidden on desktop.
      mobileTabBar(h, model),
      exportDialogView(h, model),
    ],
  )
}

/**
 * The mobile tab bar (docs/adr/0024-mobile-ui): "Adjustments" and "Layers" toggle the
 * two bottom sheets (tapping the active tab closes it); a "LUT" tab appears
 * while a LUT target exists and toggles the LUT bar, giving the filmstrip
 * a first-class affordance on phones (the drawer chevron stays as backup).
 * The bar only renders below `lg` — desktop edits through the side panels.
 */
const mobileTabBar = (h: HtmlBuilder<EditorMessage>, model: Model) => {
  const panelTab = (label: string, Icon: IconNode, active: boolean, onClick: () => EditorMessage) =>
    h.button(
      [
        h.OnClick(onClick()),
        h.AriaPressed(String(active)),
        h.AriaLabel(label),
        h.Class(
          `flex flex-1 items-center justify-center gap-2 py-2.5 text-xs ${
            active ? 'bg-panel-alt text-ink' : 'text-muted hover:text-ink'
          }`,
        ),
      ],
      [icon(h, Icon, label, 16), h.span([], [label])],
    )
  return h.nav(
    // pb-[env(...)]: the home-indicator safe area on notched phones — the
    // buttons sit above it (viewport-fit=cover, index.html).
    [
      h.Class('flex border-t border-border bg-panel pb-[env(safe-area-inset-bottom)] lg:hidden'),
      h.AriaLabel('Editor panels'),
    ],
    [
      panelTab('Adjustments', SlidersHorizontal, model.mobileSheet === 'tools', () =>
        ToggledMobileSheet({ sheet: 'tools' }),
      ),
      panelTab('Layers', LayersIcon, model.mobileSheet === 'layers', () =>
        ToggledMobileSheet({ sheet: 'layers' }),
      ),
      // The LUT tab only exists while a LUT target exists (a drafting LUT
      // layer or a selected chain LUT layer) — same gate as the LUT bar.
      ...(Option.isSome(lutTarget(model))
        ? [panelTab('LUT', Boxes, model.lutBarOpen, () => ToggledLutPicker())]
        : []),
    ],
  )
}
