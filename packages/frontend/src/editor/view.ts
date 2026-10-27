import { type Html, type HtmlBuilder, createLazy } from 'foldkit/html'
import { PanelAdjust, PanelLayers } from '../components/icons'
import type { IconNode } from '../components/icon'
import { Submodel } from 'foldkit'
import { hasImage } from './phase'
import type { Model } from './model'
import { topBar } from './top-bar'
import { toolPanel } from './tool-panel'
import { layerDrawer } from './layer-drawer'
import { canvasStage } from './canvas-stage'
import { palette } from './palette'
import * as ExportDialog from '../export-dialog'
import { EditorMessage } from './message'
import { icon } from '../components/icon'

// lazy islands (ADR 0006)
// Each island is memoized by the slice references it reads (editor uses
// `modifyFields`, so unchanged keys keep ===). A slider drag re-renders the
// inspector and the stage, not the rail's thirteen buttons or the dock.
const lazyTopBar = createLazy()
const lazyRail = createLazy()
const lazyStage = createLazy()
const lazyInspector = createLazy()
const lazyPalette = createLazy()
const lazyMobileTabBar = createLazy()
const lazyExportDialog = createLazy()

const topBarView = (
  saveStatus: Model['saveStatus'],
  attachedEdit: Model['attachedEdit'],
  mode: Model['mode'],
  imageLoaded: boolean,
  h: HtmlBuilder<EditorMessage>,
): Html => topBar(h, saveStatus, attachedEdit, mode, imageLoaded)

const railView = (
  chain: Model['chain'],
  catalog: Model['catalog'],
  catalogError: Model['catalogError'],
  phase: Model['phase'],
  hoveredTool: Model['hoveredTool'],
  toolsOpen: boolean,
  h: HtmlBuilder<EditorMessage>,
): Html => toolPanel(h, chain, catalog, catalogError, phase, hoveredTool, toolsOpen)

const stageView = (
  source: Model['source'],
  scale: number,
  offsetX: number,
  offsetY: number,
  compareMode: Model['compareMode'],
  compareSplitAt: number,
  phase: Model['phase'],
  chain: Model['chain'],
  catalog: Model['catalog'],
  bins: Model['bins'],
  h: HtmlBuilder<EditorMessage>,
): Html =>
  canvasStage(h, {
    source,
    scale,
    offsetX,
    offsetY,
    compareMode,
    compareSplitAt,
    phase,
    chain,
    catalog,
    bins,
  })

const inspectorView = (
  chain: Model['chain'],
  phase: Model['phase'],
  catalog: Model['catalog'],
  activeFieldIndex: Model['activeFieldIndex'],
  activeMixerColor: Model['activeMixerColor'],
  previewLut: Model['previewLut'],
  lutTab: Model['lutTab'],
  lutRecents: Model['lutRecents'],
  lutThumbs: Model['lutThumbs'],
  lutDownloads: Model['lutDownloads'],
  online: boolean,
  offlineLutNotice: Model['offlineLutNotice'],
  layersOpen: boolean,
  h: HtmlBuilder<EditorMessage>,
): Html =>
  layerDrawer(
    h,
    {
      chain,
      phase,
      catalog,
      activeFieldIndex,
      activeMixerColor,
      previewLut,
      lutTab,
      lutRecents,
      lutThumbs,
      lutDownloads,
      online,
      offlineLutNotice,
    },
    layersOpen,
  )

const paletteView = (
  paletteOpen: boolean,
  paletteQuery: string,
  chain: Model['chain'],
  catalog: Model['catalog'],
  catalogError: Model['catalogError'],
  phase: Model['phase'],
  h: HtmlBuilder<EditorMessage>,
): Html => palette(h, { paletteOpen, paletteQuery, chain, catalog, catalogError, phase }) ?? h.empty

const exportDialogView = (dialog: Model['exportDialog'], h: HtmlBuilder<EditorMessage>): Html =>
  ExportDialog.exportDialogView(h, dialog, (message) =>
    EditorMessage.GotExportDialogMessage({ message }),
  )

/**
 * The Editor submodel's view (docs/adr/0013-materials). A shell of three
 * floating regions — the tool rail, the print column (stage, chain rack,
 * frame bar), and the inspector — plus two overlays: the palette and the
 * export dialog. No region is drawn with a border; tone, rim light and shadow
 * separate them.
 */
export const view = Submodel.defineView<Model, EditorMessage>((model, h) => layout(h, model))

const layout = (h: HtmlBuilder<EditorMessage>, model: Model) => {
  const imageLoaded = hasImage(model.phase)
  return h.div(
    [h.Class('relative h-full overflow-hidden bg-bg text-ink')],
    [
      // The canvas is the window. Everything else floats above it: the shell
      // reserves no columns, so a photo can use the full width
      // (docs/adr/0013-materials).
      lazyStage(stageView, [
        model.source,
        model.scale,
        model.offsetX,
        model.offsetY,
        model.compareMode,
        model.compareSplitAt,
        model.phase,
        model.chain,
        model.catalog,
        model.bins,
        h,
      ]),
      lazyTopBar(topBarView, [model.saveStatus, model.attachedEdit, model.mode, imageLoaded, h]),
      lazyRail(railView, [
        model.chain,
        model.catalog,
        model.catalogError,
        model.phase,
        model.hoveredTool,
        model.mobileSheet === 'tools',
        h,
      ]),
      lazyInspector(inspectorView, [
        model.chain,
        model.phase,
        model.catalog,
        model.activeFieldIndex,
        model.activeMixerColor,
        model.previewLut,
        model.lutTab,
        model.lutRecents,
        model.lutThumbs,
        model.lutDownloads,
        model.online,
        model.offlineLutNotice,
        model.mobileSheet === 'layers',
        h,
      ]),
      lazyPalette(paletteView, [
        model.paletteOpen,
        model.paletteQuery,
        model.chain,
        model.catalog,
        model.catalogError,
        model.phase,
        h,
      ]),
      lazyMobileTabBar(mobileTabBarView, [model.mobileSheet, h]),
      lazyExportDialog(exportDialogView, [model.exportDialog, h]),
    ],
  )
}

const mobileTabBarView = (mobileSheet: Model['mobileSheet'], h: HtmlBuilder<EditorMessage>): Html =>
  mobileTabBarImpl(mobileSheet, h)

const mobileTabBarImpl = (mobileSheet: Model['mobileSheet'], h: HtmlBuilder<EditorMessage>) => {
  const panelTab = (label: string, Icon: IconNode, active: boolean, onClick: () => EditorMessage) =>
    h.button(
      [
        h.Class(
          `flex flex-1 items-center justify-center gap-2 rounded-full py-2 text-[10px] uppercase tracking-[0.1em] transition-colors ${
            active ? 'bg-s2 text-ink' : 'text-dim'
          }`,
        ),
        h.OnClick(onClick()),
        h.AriaPressed(String(active)),
        h.AriaLabel(label),
        h.Key(label),
      ],
      [icon(h, Icon, label, 14), h.span([], [label])],
    )
  return h.nav(
    [
      h.Class(
        'absolute inset-x-3 bottom-3 z-30 flex items-center gap-1 rounded-full bg-s1 p-1 pb-[max(4px,env(safe-area-inset-bottom))] shadow-[0_12px_28px_-12px_var(--mat-shadow-a)] lg:hidden',
      ),
      h.AriaLabel('Editor panels'),
    ],
    [
      panelTab('Adjustments', PanelAdjust, mobileSheet === 'tools', () =>
        EditorMessage.ToggledMobileSheet({ sheet: 'tools' }),
      ),
      panelTab('Inspector', PanelLayers, mobileSheet === 'layers', () =>
        EditorMessage.ToggledMobileSheet({ sheet: 'layers' }),
      ),
    ],
  )
}
