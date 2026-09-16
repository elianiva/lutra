import { Option } from 'effect'
import { Submodel, AsyncData } from 'foldkit'
import {
  type Html,
  type Attribute,
  type HtmlBuilder,
  createLazy,
  createKeyedLazy,
} from 'foldkit/html'
import * as DragAndDrop from '@/components/ui/drag-and-drop'
import { dragGhostClass } from '@/components/ui/drag-and-drop'
import { cn } from '@/lib/utils'
import { Check, Download, GripVertical, Move, Plus, Replace } from 'lucide'
import { button } from '@/components/ui/button'
import { CollageMessage } from './message'
import type { CollageMode, Model } from './model'
import { LAYOUT_BOUNDS } from './model'
import type { Collage, EditId, TileFraming } from '@lutra/store'
import { EditId as toEditId } from '@lutra/store'
import { photoUrl } from '../photo-url'
import { icon } from '../components/icon'
import { cellSize, effectiveRowCount, gridRects } from './compose'
import { MAX_ZOOM, placement } from './framing'
import * as ExportDialog from '../export-dialog'

const FRAME_PRESETS: readonly { label: string; value: number }[] = [
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '9:16', value: 9 / 16 },
  { label: '16:9', value: 16 / 9 },
]

const MODE_OPTIONS: readonly { label: string; value: CollageMode }[] = [
  { label: 'Arrange', value: 'Arrange' },
  { label: 'Frame', value: 'Frame' },
]

const matchesPreset = (ratio: number, value: number) => Math.abs(ratio - value) < 1e-9

const lazyControls = createLazy()
const lazyGrid = createLazy()
const lazyCell = createKeyedLazy()
const lazyUndo = createLazy()
const lazyGhost = createLazy()
const lazyHeader = createLazy()
const lazyNoticeBar = createLazy()
const lazyExportBar = createLazy()

const headerView = (h: HtmlBuilder<CollageMessage>): Html => header(h)
const noticeView = (notice: string | null, h: HtmlBuilder<CollageMessage>): Html =>
  notice === null
    ? null
    : h.div([h.Class('border-b border-border bg-panel px-4 py-1 text-xs text-accent')], [notice])

export const view = Submodel.defineView<Model, CollageMessage>((model, h) => {
  return h.div(
    [h.Class('relative flex h-full flex-col bg-bg text-ink')],
    [
      lazyHeader(headerView, [h])!,
      lazyNoticeBar(noticeView, [model.notice, h]),
      h.main([h.Class('flex min-h-0 flex-1 flex-col overflow-auto')], [body(h, model)]),
      lazyUndo(undoToastView, [model.undo, model.undoLabel, h]),
      lazyGhost(ghostView, [model.photos, model.drag, h]),
      ExportDialog.exportDialogView(h, model.exportDialog, (message) =>
        CollageMessage.GotCollageExportDialogMessage({ message }),
      ),
    ],
  )
})

const header = (h: HtmlBuilder<CollageMessage>) =>
  h.header(
    [h.Class('flex items-center justify-between border-b border-border bg-panel px-4 py-2')],
    [
      h.div(
        [h.Class('flex items-center gap-3')],
        [
          button(
            {
              onClick: CollageMessage.BackRequested(),
              variant: 'ghost',
              size: 'xs',
              attributes: [h.AriaLabel('Back to the main menu')],
            },
            '← Menu',
            h,
          ),
          h.h1([h.Class('text-sm font-semibold tracking-[0.3em] text-accent')], ['COLLAGE']),
        ],
      ),
      button(
        {
          onClick: CollageMessage.ExportRequested(),
          variant: 'ghost',
          size: 'icon-sm',
          attributes: [h.AriaLabel('Export this collage')],
        },
        [icon(h, Download, 'Export this collage')],
        h,
      ),
    ],
  )

const undoToastView = (
  undo: Model['undo'],
  undoLabel: Model['undoLabel'],
  h: HtmlBuilder<CollageMessage>,
): Html => {
  if (undo === null || undoLabel === null) return null
  return h.div(
    [
      h.DataAttribute('undo-toast', 'true'),
      h.Class(
        'absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded border border-border bg-panel px-3 py-1.5 text-xs shadow-lg',
      ),
    ],
    [
      h.span([h.Class('text-muted')], [undoLabel]),
      button(
        {
          onClick: CollageMessage.UndoPressed(),
          size: 'xs',
          className: 'px-2 py-0.5',
          attributes: [
            h.AriaLabel(`Undo: ${undoLabel.toLowerCase()}`),
            h.DataAttribute('undo-button', 'true'),
          ],
        },
        'Undo',
        h,
      ),
    ],
  )
}

const ghostView = (
  photos: Model['photos'],
  drag: Model['drag'],
  h: HtmlBuilder<CollageMessage>,
): Html => {
  const photoById = new Map(photos.map((p) => [p.id, p]))
  return Option.match(DragAndDrop.ghostStyle(drag), {
    onNone: () => null,
    onSome: (style) => {
      const dragged = Option.match(DragAndDrop.maybeDraggedItemId(drag), {
        onNone: () => null,
        onSome: (id) => photoById.get(toEditId(id)) ?? null,
      })
      const draggedUrl = dragged && photoUrl(dragged.id, dragged.source)
      if (!dragged || !draggedUrl) return null
      return h.div(
        [
          h.Style(style),
          h.Class(
            cn(
              '-translate-x-1/2 -translate-y-1/2 overflow-hidden border border-accent',
              dragGhostClass,
            ),
          ),
        ],
        [
          h.div(
            [h.Class('h-20 w-20')],
            [h.img([h.Src(draggedUrl), h.Alt(''), h.Class('h-full w-full object-cover')])],
          ),
        ],
      )
    },
  })
}

const controlsWrapper = (collage: Collage, model: Model, h: HtmlBuilder<CollageMessage>): Html =>
  controls(h, collage, model)

const exportBarWrapper = (
  collage: Collage,
  dialog: Model['exportDialog'],
  h: HtmlBuilder<CollageMessage>,
): Html =>
  ExportDialog.exportBarView(
    h,
    dialog,
    gridRects(collage.layout, collage.tiles.length),
    (message: ExportDialog.Message) => CollageMessage.GotCollageExportDialogMessage({ message }),
  )

const body = (h: HtmlBuilder<CollageMessage>, model: Model) =>
  AsyncData.match(model.collage, {
    onFailure: (error) => failureState(h, error.message),
    onIdle: () => spinner(h),
    onLoading: () => spinner(h),
    onRefreshing: () => spinner(h),
    onStale: () => spinner(h),
    onSuccess: (collage) =>
      h.div(
        [h.Class('flex min-h-0 flex-1 flex-col gap-4 p-4 lg:flex-row')],
        [
          h.div(
            [h.Class('flex min-w-0 flex-1 flex-col gap-4')],
            [
              lazyControls(controlsWrapper, [collage, model, h])!,
              collage.tiles.length === 0 ? emptyNotice(h) : null,
              grid(h, model, collage),
            ],
          ),
          h.div(
            [h.Class('w-full shrink-0 lg:w-[320px]')],
            [lazyExportBar(exportBarWrapper, [collage, model.exportDialog, h])!],
          ),
        ],
      ),
  })

const spinner = (h: HtmlBuilder<CollageMessage>) =>
  h.div([h.Class('flex flex-1 items-center justify-center text-sm text-muted')], ['Loading…'])

const failureState = (h: HtmlBuilder<CollageMessage>, message: string) =>
  h.div(
    [h.Class('flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted')],
    [h.p([], [`Could not open this collage: ${message}`])],
  )

const emptyNotice = (h: HtmlBuilder<CollageMessage>) =>
  h.p(
    [h.Class('text-center text-sm text-muted')],
    ['Every photo in this collage is gone — their edits were deleted. Add new ones below.'],
  )

const stepperButton = (
  h: HtmlBuilder<CollageMessage>,
  label: string,
  ariaLabel: string,
  onClick: CollageMessage,
) =>
  button(
    {
      onClick,
      variant: 'outline',
      size: 'icon-sm',
      className:
        'grid place-items-center border-border text-xs text-muted hover:border-muted hover:text-ink',
      attributes: [h.AriaLabel(ariaLabel), h.DataAttribute('layout-step', label)],
    },
    label,
    h,
  )

const controlLabel = (h: HtmlBuilder<CollageMessage>, text: string) =>
  h.span([h.Class('text-[10px] uppercase tracking-[0.14em]')], [text])

const numberField = (
  h: HtmlBuilder<CollageMessage>,
  config: Readonly<{
    ariaLabel: string
    testId: string
    value: number
    min: number
    max: number
    toMessage: (value: number) => CollageMessage
  }>,
) =>
  h.input([
    h.Type('number'),
    h.Step('1'),
    h.Min(String(config.min)),
    h.Max(String(config.max)),
    h.AriaLabel(config.ariaLabel),
    h.DataAttribute(config.testId, 'true'),
    h.Class(
      'w-14 rounded border border-border bg-transparent px-1 py-0.5 text-center text-xs tnum text-ink',
    ),
    h.Value(String(config.value)),
    h.OnChange((raw) => {
      const parsed = Number(raw)
      return config.toMessage(Number.isFinite(parsed) ? parsed : config.value)
    }),
  ])

/**
 * One layout number with typed entry and steppers (docs/adr/0009-collage). The typed
 * field commits on change (blur/Enter) so intermediate keystrokes are not
 * clamped mid-word; the update edge clamps to the control range.
 */
const numberControl = (
  h: HtmlBuilder<CollageMessage>,
  config: Readonly<{
    control: string
    label: string
    value: number
    min: number
    max: number
    step: number
    unit?: string
    toMessage: (value: number) => CollageMessage
  }>,
) => {
  const value = Math.round(config.value)
  return h.div(
    [h.Class('flex items-center gap-2'), h.DataAttribute('control', config.control)],
    [
      controlLabel(h, config.label),
      stepperButton(h, '−', `Decrease ${config.label}`, config.toMessage(value - config.step)),
      numberField(h, {
        ariaLabel: `${config.label} value`,
        max: config.max,
        min: config.min,
        testId: `${config.control}-input`,
        toMessage: config.toMessage,
        value,
      }),
      config.unit === undefined ? null : h.span([h.Class('text-[10px] text-muted')], [config.unit]),
      stepperButton(h, '+', `Increase ${config.label}`, config.toMessage(value + config.step)),
    ],
  )
}

const ratioPair = (ratio: number): [number, number] =>
  ratio >= 1 ? [Math.round(ratio * 100) / 100, 1] : [1, Math.round((1 / ratio) * 100) / 100]

const ratioInput = (
  h: HtmlBuilder<CollageMessage>,
  value: number,
  testId: string,
  toRatio: (value: number) => number,
) =>
  h.input([
    h.Type('number'),
    h.AriaLabel(`Custom frame ratio ${testId.endsWith('w') ? 'width' : 'height'}`),
    h.DataAttribute(testId, 'true'),
    h.Step('0.1'),
    h.Min('0.1'),
    h.Class(
      'w-12 rounded border border-border bg-transparent px-1 py-0.5 text-center text-xs tnum text-ink',
    ),
    h.Value(String(value)),
    h.OnChange((raw) => {
      const parsed = Number(raw)
      return CollageMessage.ChangedFrameRatio({
        frameRatio: Number.isFinite(parsed) && parsed > 0 ? toRatio(parsed) : value,
      })
    }),
  ])

const frameRatioControl = (h: HtmlBuilder<CollageMessage>, collage: Collage) => {
  const ratio = collage.layout.frameRatio
  const [w, hh] = ratioPair(ratio)
  return h.div(
    [h.Class('flex items-center gap-2'), h.DataAttribute('control', 'frame-ratio')],
    [
      controlLabel(h, 'Frame'),
      h.div(
        [h.Class('flex border border-border')],
        FRAME_PRESETS.map(({ label, value }, i) =>
          button(
            {
              onClick: CollageMessage.ChangedFrameRatio({ frameRatio: value }),
              size: 'xs',
              variant: matchesPreset(ratio, value) ? 'default' : 'ghost',
              className: cn(
                'px-2 py-0.5 text-xs',
                i < FRAME_PRESETS.length - 1 ? 'border-r border-border' : '',
                matchesPreset(ratio, value) ? 'bg-accent text-ink' : 'text-muted hover:text-ink',
              ),
              attributes: [
                h.AriaLabel(`Frame ratio ${label}`),
                h.DataAttribute('frame-preset', label),
                h.AriaPressed(String(matchesPreset(ratio, value))),
              ],
            },
            label,
            h,
          ),
        ),
      ),
      h.div(
        [h.Class('flex items-center gap-1'), h.DataAttribute('custom-frame-ratio', 'true')],
        [
          ratioInput(h, w, 'frame-ratio-w', (value) => value / Math.max(0.01, hh)),
          h.span([], [':']),
          ratioInput(h, hh, 'frame-ratio-h', (value) => Math.max(0.01, w) / Math.max(0.01, value)),
        ],
      ),
    ],
  )
}

/** The Arrange/Frame switch — one mode at a time (docs/adr/0009-collage). */
const modeToggle = (h: HtmlBuilder<CollageMessage>, mode: CollageMode) =>
  h.div(
    [h.Class('flex border border-border'), h.DataAttribute('control', 'mode')],
    MODE_OPTIONS.map(({ label, value }, i) =>
      button(
        {
          onClick: CollageMessage.ChangedMode({ mode: value }),
          size: 'xs',
          variant: mode === value ? 'default' : 'ghost',
          className: cn(
            'px-3 py-1 text-xs',
            i < MODE_OPTIONS.length - 1 ? 'border-r border-border' : '',
            mode === value ? 'bg-accent text-ink' : 'text-muted hover:text-ink',
          ),
          attributes: [
            h.AriaLabel(`${label} mode`),
            h.AriaPressed(String(mode === value)),
            h.DataAttribute('mode-option', value),
          ],
        },
        label,
        h,
      ),
    ),
  )

/**
 * Frame mode's per-tile panel: a zoom slider that works with a mouse, a
 * trackpad, or a thumb (the wheel alone left touch devices unable to zoom),
 * the tile's reset, and a Done button that drops the selection.
 */
const framingPanel = (h: HtmlBuilder<CollageMessage>, collage: Collage, model: Model): Html => {
  const index = model.selectedTile
  if (index === null) {
    return h.span(
      [h.Class('flex items-center gap-1.5 text-xs text-muted')],
      [icon(h, Move, 'Drag to reposition', 14), 'Tap a photo to frame it'],
    )
  }
  const tile = collage.tiles[index]
  if (!tile) {
    return null
  }
  const framing = model.framingDraft?.index === index ? model.framingDraft.framing : tile.framing
  const zoom = Math.min(MAX_ZOOM, Math.max(1, framing.zoom))
  return h.div(
    [
      h.Class('flex items-center gap-3 border border-border px-3 py-1'),
      h.DataAttribute('framing-panel', 'true'),
    ],
    [
      controlLabel(h, 'Zoom'),
      h.input([
        h.Type('range'),
        h.Min('1'),
        h.Max(String(MAX_ZOOM)),
        h.Step('0.01'),
        h.Value(String(zoom)),
        h.AriaLabel(`Zoom photo ${index + 1}`),
        h.DataAttribute('zoom-slider', 'true'),
        h.Class('lutra-range w-28'),
        h.OnInput((raw) => CollageMessage.ZoomSet({ index, zoom: Number(raw) })),
      ]),
      h.span(
        [h.Class('tnum text-xs text-ink'), h.DataAttribute('zoom-value', 'true')],
        [`${String(Math.round(zoom * 100))}%`],
      ),
      button(
        {
          onClick: CollageMessage.ResetFraming({ index }),
          variant: 'ghost',
          size: 'xs',
          className: 'px-2 py-0.5 text-muted hover:text-ink',
          attributes: [
            h.AriaLabel(`Reset framing of photo ${index + 1}`),
            h.DataAttribute('reset-framing', `${index}`),
          ],
        },
        'Reset',
        h,
      ),
      button(
        {
          onClick: CollageMessage.TileSelected({ index: null }),
          variant: 'outline',
          size: 'xs',
          className: 'px-2 py-0.5',
          attributes: [h.AriaLabel('Finish framing'), h.DataAttribute('finish-framing', 'true')],
        },
        [icon(h, Check, 'Finish framing', 12), 'Done'],
        h,
      ),
    ],
  )
}

const controls = (h: HtmlBuilder<CollageMessage>, collage: Collage, model: Model) =>
  h.div(
    [h.Class('flex flex-col gap-3')],
    [
      h.div(
        [h.Class('flex flex-wrap items-center justify-center gap-3')],
        [
          modeToggle(h, model.mode),
          model.mode === 'Frame' ? framingPanel(h, collage, model) : null,
        ],
      ),
      h.div(
        [h.Class('flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted')],
        [
          frameRatioControl(h, collage),
          numberControl(h, {
            control: 'columns',
            label: 'Columns',
            max: LAYOUT_BOUNDS.maxColumns,
            min: LAYOUT_BOUNDS.minColumns,
            step: 1,
            toMessage: (columns) => CollageMessage.ChangedColumns({ columns }),
            value: collage.layout.columns,
          }),
          numberControl(h, {
            control: 'rows',
            label: 'Rows',
            max: LAYOUT_BOUNDS.maxRows,
            min: LAYOUT_BOUNDS.minRows,
            step: 1,
            toMessage: (rows) => CollageMessage.ChangedRows({ rows }),
            value: collage.layout.rows,
          }),
          numberControl(h, {
            control: 'gutter',
            label: 'Gutter',
            max: LAYOUT_BOUNDS.maxGutter,
            min: LAYOUT_BOUNDS.minGutter,
            step: 8,
            toMessage: (gutter) => CollageMessage.ChangedGutter({ gutter }),
            unit: 'px',
            value: collage.layout.gutter,
          }),
          button(
            {
              onClick: CollageMessage.ToggledBackground(),
              variant: 'outline',
              size: 'xs',
              className: 'px-2 py-0.5 text-muted hover:border-muted hover:text-ink',
              attributes: [
                h.AriaLabel('Switch the background between dark and light'),
                h.DataAttribute('control', 'background'),
              ],
            },
            `Background: ${collage.layout.background}`,
            h,
          ),
        ],
      ),
    ],
  )

const gridView = (
  columns: number,
  rows: number,
  gutter: number,
  cellAspect: number,
  background: string,
  mode: CollageMode,
  tiles: Collage['tiles'],
  framingDraft: Model['framingDraft'],
  selectedTile: Model['selectedTile'],
  drag: Model['drag'],
  photos: Model['photos'],
  sizes: Model['sizes'],
  h: HtmlBuilder<CollageMessage>,
): Html => {
  const photoById = new Map(photos.map((p) => [p.id, p]))
  const sizeById = new Map(sizes.map((s) => [s.editId, s]))
  const capacity = columns * rows
  const empties = Array.from({ length: Math.max(0, capacity - tiles.length) }, (_, i) =>
    h.div(
      [
        h.Key(`empty-${i}`),
        h.DataAttribute('collage-empty-cell', `${i}`),
        h.Style({ aspectRatio: String(cellAspect) }),
      ],
      [],
    ),
  )
  return h.div(
    [
      h.DataAttribute('collage-grid', `${columns}x${rows}`),
      h.Style({
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: `${gutter}px`,
        padding: `${gutter}px`,
      }),
      h.Class(`overflow-hidden mx-auto max-h-[48rem] max-w-[40rem] w-full ${background}`),
    ],
    [
      ...tiles.map((tile, index) =>
        lazyCell(tile.editId, tileCellView, [
          tile.editId,
          index,
          framingDraft?.index === index ? framingDraft.framing : tile.framing,
          cellAspect,
          mode,
          selectedTile === index,
          drag,
          photoById,
          sizeById,
          h,
        ])!,
      ),
      mode === 'Frame'
        ? null
        : h.div(
            [
              h.Key('add-photos'),
              h.DataAttribute('add-photos', 'true'),
              h.Style({ aspectRatio: String(cellAspect) }),
              h.Class(
                'flex cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-border bg-transparent text-muted hover:border-accent hover:text-accent',
              ),
              h.OnClick(CollageMessage.AddPhotosRequested()),
              h.AriaLabel('Add photos to collage'),
            ],
            [icon(h, Plus, 'Add photos', 20), h.span([h.Class('text-xs')], ['Add photos'])],
          ),
      ...empties,
    ],
  )
}

const tileCellView = (
  editId: EditId,
  index: number,
  framing: TileFraming,
  cellAspect: number,
  mode: CollageMode,
  selected: boolean,
  drag: Model['drag'],
  photoById: Map<EditId, Model['photos'][number]>,
  sizeById: Map<EditId, Model['sizes'][number]>,
  h: HtmlBuilder<CollageMessage>,
): Html => {
  const photo = photoById.get(editId)
  const url = photo === undefined ? null : photoUrl(photo.id, photo.source)
  const inFrame = mode === 'Frame'
  const dropTarget = Option.match(DragAndDrop.maybeDropTarget(drag), {
    onNone: () => null,
    onSome: (t) => (t.containerId === `tile-${index}` ? t : null),
  })
  const draggedHere =
    DragAndDrop.isDragging(drag) &&
    Option.match(DragAndDrop.maybeDraggedItemId(drag), {
      onNone: () => false,
      onSome: (id) => id === editId,
    })
  const cellClass = [
    'relative overflow-hidden',
    selected ? 'ring-2 ring-accent' : '',
    ...(dropTarget !== null ? ['ring-2 ring-accent'] : []),
    ...(draggedHere ? ['opacity-40'] : []),
    inFrame ? (selected ? 'cursor-grab select-none touch-none' : 'cursor-pointer') : '',
  ].join(' ')
  const cellStyle: Record<string, string> = {}
  cellStyle.aspectRatio = String(cellAspect)
  if (inFrame && selected) {
    cellStyle.touchAction = 'none'
  }
  const cellAttrs: Attribute<CollageMessage>[] = [
    h.Key(editId),
    h.DataAttribute('collage-cell', `${index}`),
    h.DataAttribute('collage-tile', `${index}`),
    h.Style(cellStyle),
    h.Class(cellClass),
  ]
  if (!inFrame) {
    cellAttrs.push(...DragAndDrop.droppable(`tile-${index}`, `Photo slot ${index + 1}`))
  } else {
    cellAttrs.push(h.OnClick(CollageMessage.TileSelected({ index })))
  }
  if (inFrame && selected) {
    cellAttrs.push(
      h.OnPointerDown((_pointerType, btn, screenX, screenY) =>
        btn === 0
          ? Option.some(CollageMessage.PanStarted({ index, screenX, screenY }))
          : Option.none(),
      ),
    )
  }
  return h.div(cellAttrs, [
    h.div(
      [h.Class('relative h-full w-full')],
      [
        url === null || photo === undefined
          ? h.div(
              [h.Class('flex h-full w-full items-center justify-center text-xs text-muted')],
              ['No photo'],
            )
          : framedPhotoCached(h, url, editId, framing, cellAspect, sizeById),
        inFrame
          ? null
          : h.div(
              [
                ...DragAndDrop.draggable(
                  {
                    model: drag,
                    toParentMessage: (message) => CollageMessage.GotDragMessage({ message }),
                    itemId: editId,
                    containerId: `tile-${index}`,
                    index,
                  },
                  h,
                ),
                ...DragAndDrop.sortable(editId),
                h.Class(
                  'absolute left-0 top-0 z-10 grid place-items-center bg-black/50 p-1 text-white/80 hover:text-white',
                ),
                h.AriaLabel(`Drag to reorder photo ${index + 1}`),
                h.DataAttribute('drag-handle', `${index}`),
              ],
              [icon(h, GripVertical, `Drag to reorder photo ${index + 1}`, 12)],
            ),
        inFrame
          ? null
          : button(
              {
                onClick: CollageMessage.ReplaceTileRequested({ index }),
                variant: 'ghost',
                size: 'icon-sm',
                className:
                  'absolute right-0 top-0 z-10 grid place-items-center bg-black/50 p-0 text-[10px] text-white/80 hover:text-white',
                attributes: [
                  h.AriaLabel(`Replace photo ${index + 1}`),
                  h.DataAttribute('replace-tile', `${index}`),
                ],
              },
              [icon(h, Replace, `Replace photo ${index + 1}`, 12)],
              h,
            ),
        inFrame && selected
          ? h.div(
              [
                h.Class(
                  'pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-black/60 px-1 py-0.5 text-center text-[10px] text-white/80',
                ),
                h.DataAttribute('frame-hint', `${index}`),
              ],
              ['Drag to reposition · slider to zoom'],
            )
          : null,
        dropTarget !== null
          ? h.div(
              [
                h.DataAttribute('drop-indicator', `${dropTarget.index}`),
                h.Class(
                  `absolute z-10 w-1 bg-accent ${dropTarget.index === 0 ? 'left-0 top-0 h-full' : 'bottom-0 right-0 h-full'}`,
                ),
              ],
              [],
            )
          : null,
      ],
    ),
  ])
}

const framedPhotoCached = (
  h: HtmlBuilder<CollageMessage>,
  url: string,
  editId: EditId,
  framing: TileFraming,
  cellAspect: number,
  sizeById: Map<EditId, Model['sizes'][number]>,
): Html => {
  const size = sizeById.get(editId)
  const imageAspect = !size || size.width <= 0 || size.height <= 0 ? null : size.width / size.height
  if (imageAspect === null)
    return h.img([
      h.Src(url),
      h.Alt(''),
      h.Attribute('decoding', 'async'),
      h.Attribute('draggable', 'false'),
      h.Class('h-full w-full object-cover'),
    ])
  const p = placement(framing, imageAspect, cellAspect)
  return h.img([
    h.Src(url),
    h.Alt(''),
    h.Attribute('decoding', 'async'),
    h.Attribute('draggable', 'false'),
    h.Class('absolute max-w-none select-none pointer-events-none'),
    h.Style({
      width: `${p.width * 100}%`,
      height: `${p.height * 100}%`,
      left: `${p.left * 100}%`,
      top: `${p.top * 100}%`,
      willChange: 'left, top, width, height',
      transform: 'translateZ(0)',
      contain: 'strict',
    }),
  ])
}

const grid = (h: HtmlBuilder<CollageMessage>, model: Model, collage: Collage) => {
  const layout = collage.layout
  const columns = Math.max(1, Math.round(layout.columns))
  const rows = effectiveRowCount(layout, collage.tiles.length)
  const gutter = Math.round(layout.gutter)
  const cell = cellSize(layout, collage.tiles.length, 1000)
  const cellAspect = cell.width / cell.height
  const background = layout.background === 'dark' ? 'bg-black' : 'bg-white'
  return lazyGrid(gridView, [
    columns,
    rows,
    gutter,
    cellAspect,
    background,
    model.mode,
    collage.tiles,
    model.framingDraft,
    model.selectedTile,
    model.drag,
    model.photos,
    model.sizes,
    h,
  ])!
}
