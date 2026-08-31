import { Option } from 'effect'
import { Submodel } from 'foldkit'
import { type Html, type HtmlBuilder, createLazy } from 'foldkit/html'
import { Boxes, Layers as LayersIcon, SlidersHorizontal } from 'lucide'
import type { IconNode } from 'lucide'
import { hasImage } from './phase'
import type { Model } from './model'
import { topBar } from './top-bar'
import { toolPanel } from './tool-panel'
import { layerDrawer } from './layer-drawer'
import { canvasStage } from './canvas-stage'
import type { CanvasStageModel } from './canvas-stage'
import { lutBar } from './lut-bar'
import { lutTarget } from './lut-bar/target'
import * as ExportDialog from '../export-dialog'
import { EditorMessage } from './message'
import { icon } from '../components/icon'

// lazy islands (ADR 0006)
// Editor has ~28 Model fields but only a handful change per message.
// Each island is memoized by its slice's reference (editor uses `evo`,
// so unchanged keys keep ===). This keeps a slider drag at ~16ms instead
// of rebuilding the LUT bar's ~300-thumb catalog grouping on every tick.
const lazyTopBar = createLazy()
const lazyToolPanel = createLazy()
const lazyCanvasStage = createLazy()
const lazyLayerDrawer = createLazy()
const lazyLutBar = createLazy()
const lazyMobileTabBar = createLazy()
const lazyExportDialog = createLazy()

// Module-scope view helpers — stable fn refs for lazy (ADR 0006).
// Each helper takes only the slice refs the island actually reads, so a
// `ScaledCanvas` burst (scale/offset) doesn't invalidate `toolPanel` which
// only cares about chain/catalog/phase.
const topBarView = (
  saveStatus: Model['saveStatus'],
  attachedEdit: Model['attachedEdit'],
  hasImage: boolean,
  h: HtmlBuilder<EditorMessage>,
): Html => topBar(h, saveStatus, attachedEdit, hasImage)

const toolPanelView = (
  chain: Model['chain'],
  catalog: Model['catalog'],
  catalogError: Model['catalogError'],
  phase: Model['phase'],
  hoveredTool: Model['hoveredTool'],
  toolsOpen: boolean,
  h: HtmlBuilder<EditorMessage>,
): Html => toolPanel(h, chain, catalog, catalogError, phase, hoveredTool, toolsOpen)

const canvasStageView = (
  source: Model['source'],
  scale: number,
  offsetX: number,
  offsetY: number,
  compareMode: Model['compareMode'],
  compareSplitAt: number,
  compareToggleBefore: boolean,
  bins: Model['bins'],
  phase: Model['phase'],
  h: HtmlBuilder<EditorMessage>,
): Html => {
  const slice: CanvasStageModel = {
    source,
    scale,
    offsetX,
    offsetY,
    compareMode,
    compareSplitAt,
    compareToggleBefore,
    bins,
    phase,
  }
  return canvasStage(h, slice)
}

const layerDrawerView = (
  chain: Model['chain'],
  phase: Model['phase'],
  activeFieldIndex: Model['activeFieldIndex'],
  activeMixerColor: Model['activeMixerColor'],
  lutBarOpen: boolean,
  catalog: Model['catalog'],
  layersOpen: boolean,
  h: HtmlBuilder<EditorMessage>,
): Html =>
  layerDrawer(
    h,
    { chain, phase, activeFieldIndex, activeMixerColor, lutBarOpen, catalog },
    layersOpen,
  )

const lutBarView = (
  catalog: Model['catalog'],
  lutBarOpen: boolean,
  previewLut: Model['previewLut'],
  lutTab: Model['lutTab'],
  lutRecents: Model['lutRecents'],
  lutThumbs: Model['lutThumbs'],
  lutDownloads: Model['lutDownloads'],
  online: boolean,
  offlineLutNotice: Model['offlineLutNotice'],
  phase: Model['phase'],
  chain: Model['chain'],
  h: HtmlBuilder<EditorMessage>,
): Html | null =>
  lutBar(h, {
    catalog,
    lutBarOpen,
    previewLut,
    lutTab,
    lutRecents,
    lutThumbs,
    lutDownloads,
    online,
    offlineLutNotice,
    phase,
    chain,
  })

const mobileTabBarView = (
  mobileSheet: Model['mobileSheet'],
  lutBarOpen: boolean,
  hasLutTarget: boolean,
  h: HtmlBuilder<EditorMessage>,
): Html => mobileTabBarImpl(mobileSheet, lutBarOpen, hasLutTarget, h)
const exportDialogView = (dialog: Model['exportDialog'], h: HtmlBuilder<EditorMessage>): Html =>
  ExportDialog.exportDialogView(h, dialog, (message) =>
    EditorMessage.GotExportDialogMessage({ message }),
  )

/**
 * The Editor submodel's view (docs/adr/0006-frontend-architecture). Branded via `defineView` so it
 * embeds under the root through `h.submodel`, and its `h` is typed to the
 * Editor's own Message union — every handler this view builds dispatches
 * through the Editor boundary (wrapped up as `GotEditorMessage` by the root).
 */
export const view = Submodel.defineView<Model, EditorMessage>((model, h) => layout(h, model))

const layout = (h: HtmlBuilder<EditorMessage>, model: Model) => {
  const imageLoaded = hasImage(model.phase)
  const hasLutTarget = Option.isSome(lutTarget(model.phase, model.chain))
  return h.div(
    [h.Class('flex h-full flex-col bg-bg text-ink')],
    [
      lazyTopBar(topBarView, [model.saveStatus, model.attachedEdit, imageLoaded, h]),
      h.div(
        [h.Class('flex min-h-0 flex-1 flex-col lg:flex-row')],
        [
          lazyToolPanel(toolPanelView, [
            model.chain,
            model.catalog,
            model.catalogError,
            model.phase,
            model.hoveredTool,
            model.mobileSheet === 'tools',
            h,
          ]),
          lazyCanvasStage(canvasStageView, [
            model.source,
            model.scale,
            model.offsetX,
            model.offsetY,
            model.compareMode,
            model.compareSplitAt,
            model.compareToggleBefore,
            model.bins,
            model.phase,
            h,
          ]),
          lazyLayerDrawer(layerDrawerView, [
            model.chain,
            model.phase,
            model.activeFieldIndex,
            model.activeMixerColor,
            model.lutBarOpen,
            model.catalog,
            model.mobileSheet === 'layers',
            h,
          ]),
        ],
      ),
      lazyLutBar(lutBarView, [
        model.catalog,
        model.lutBarOpen,
        model.previewLut,
        model.lutTab,
        model.lutRecents,
        model.lutThumbs,
        model.lutDownloads,
        model.online,
        model.offlineLutNotice,
        model.phase,
        model.chain,
        h,
      ]),
      lazyMobileTabBar(mobileTabBarView, [
        model.mobileSheet,
        model.lutBarOpen,
        hasLutTarget,
        h,
      ]),
      lazyExportDialog(exportDialogView, [model.exportDialog, h]),
    ],
  )
}

const mobileTabBarImpl = (
  mobileSheet: Model['mobileSheet'],
  lutBarOpen: boolean,
  hasLutTarget: boolean,
  h: HtmlBuilder<EditorMessage>,
) => {
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
      panelTab('Adjustments', SlidersHorizontal, mobileSheet === 'tools', () =>
        EditorMessage.ToggledMobileSheet({ sheet: 'tools' }),
      ),
      panelTab('Layers', LayersIcon, mobileSheet === 'layers', () =>
        EditorMessage.ToggledMobileSheet({ sheet: 'layers' }),
      ),
      // The LUT tab only exists while a LUT target exists (a drafting LUT
      // layer or a selected chain LUT layer) — same gate as the LUT bar.
      ...(hasLutTarget
        ? [panelTab('LUT', Boxes, lutBarOpen, () => EditorMessage.ToggledLutPicker())]
        : []),
    ],
  )
}
