import { type Html, type HtmlBuilder, createLazy } from 'foldkit/html'
import { Layers as LayersIcon, Plus, SlidersHorizontal } from 'lucide'
import type { IconNode } from 'lucide'
import { Submodel } from 'foldkit'
import { hasImage } from './phase'
import type { Model } from './model'
import { topBar } from './top-bar'
import { toolPanel } from './tool-panel'
import { layerDrawer } from './layer-drawer'
import { canvasStage } from './canvas-stage'
import { chainDock } from './chain-dock'
import { palette } from './palette'
import { statusBand } from './status-band'
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
const lazyDock = createLazy()
const lazyStatus = createLazy()
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
  })

const dockView = (
  chain: Model['chain'],
  phase: Model['phase'],
  catalog: Model['catalog'],
  h: HtmlBuilder<EditorMessage>,
): Html => chainDock(h, { chain, phase, catalog })

const statusView = (
  bins: Model['bins'],
  scale: number,
  compareMode: Model['compareMode'],
  phase: Model['phase'],
  h: HtmlBuilder<EditorMessage>,
): Html => statusBand(h, { bins, scale, compareMode, phase })

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
 * floating regions — the tool rail, the print column (stage, chain dock,
 * status band), and the inspector — plus two overlays: the palette and the
 * export dialog. No region is drawn with a border; tone, rim light and shadow
 * separate them.
 */
export const view = Submodel.defineView<Model, EditorMessage>((model, h) => layout(h, model))

const layout = (h: HtmlBuilder<EditorMessage>, model: Model) => {
  const imageLoaded = hasImage(model.phase)
  return h.div(
    [h.Class('relative flex h-full flex-col bg-bg px-6 pb-6 text-ink max-lg:px-3 max-lg:pb-3')],
    [
      lazyTopBar(topBarView, [model.saveStatus, model.attachedEdit, model.mode, imageLoaded, h]),
      h.div(
        [h.Class('flex min-h-0 flex-1 gap-6 max-lg:flex-col max-lg:gap-3')],
        [
          lazyRail(railView, [
            model.chain,
            model.catalog,
            model.catalogError,
            model.phase,
            model.hoveredTool,
            model.mobileSheet === 'tools',
            h,
          ]),
          h.main(
            [h.Class('flex min-h-0 min-w-0 flex-1 flex-col gap-6 pt-3 max-lg:gap-3 max-lg:pt-0')],
            [
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
                h,
              ]),
              lazyDock(dockView, [model.chain, model.phase, model.catalog, h]),
              lazyStatus(statusView, [model.bins, model.scale, model.compareMode, model.phase, h]),
            ],
          ),
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
        ],
      ),
      lazyPalette(paletteView, [
        model.paletteOpen,
        model.paletteQuery,
        model.chain,
        model.catalog,
        model.catalogError,
        model.phase,
        h,
      ]),
      lazyMobileTabBar(mobileTabBarView, [model.mobileSheet, model.paletteOpen, h]),
      lazyExportDialog(exportDialogView, [model.exportDialog, h]),
    ],
  )
}

const mobileTabBarView = (
  mobileSheet: Model['mobileSheet'],
  paletteOpen: boolean,
  h: HtmlBuilder<EditorMessage>,
): Html => mobileTabBarImpl(mobileSheet, paletteOpen, h)

const mobileTabBarImpl = (
  mobileSheet: Model['mobileSheet'],
  paletteOpen: boolean,
  h: HtmlBuilder<EditorMessage>,
) => {
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
        'flex flex-none items-center gap-1 rounded-full bg-s1 p-1 pb-[max(4px,env(safe-area-inset-bottom))] shadow-[0_-12px_28px_-18px_var(--mat-shadow-a)] lg:hidden',
      ),
      h.AriaLabel('Editor panels'),
    ],
    [
      panelTab('Adjustments', SlidersHorizontal, mobileSheet === 'tools', () =>
        EditorMessage.ToggledMobileSheet({ sheet: 'tools' }),
      ),
      panelTab('Inspector', LayersIcon, mobileSheet === 'layers', () =>
        EditorMessage.ToggledMobileSheet({ sheet: 'layers' }),
      ),
      panelTab('Add', Plus, paletteOpen, () => EditorMessage.ToggledPalette()),
    ],
  )
}
