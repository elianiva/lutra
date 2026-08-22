import { Submodel, AsyncData } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import {
  BackRequested,
  ChangedColumns,
  ChangedGutter,
  ExportRequested,
  GotCollageExportDialogMessage,
  MovedTile,
  RemovedTile,
  ToggledBackground,
} from './message'
import * as ExportDialog from '../export-dialog'
import type { CollageMessage } from './message'
import type { Model } from './model'
import { LAYOUT_BOUNDS } from './model'
import type { Collage, EditSummary } from '@lutra/store'
import { thumbnailUrl } from '../thumbnail-url'
import { icon } from '../components/icon'
import { Download } from 'lucide'

/**
 * The Collage Submodel's view (docs/adr/0009, 0030): the fixed-grid preview
 * — each tile drawn from its referenced Edit's stored thumbnail, fitted to
 * the viewport — with layout controls (columns, gutter, background), per-tile
 * remove and move controls, and back navigation. Stepper controls emit raw
 * ±1/±8 intents; clamping to `LAYOUT_BOUNDS` happens once, in update.
 */
export const view = Submodel.defineView<Model, CollageMessage>((model, h) => {
  return h.div(
    [h.Class('relative flex h-full flex-col bg-bg text-ink')],
    [
      header(h),
      notice(model.notice, h),
      h.main([h.Class('flex min-h-0 flex-1 flex-col overflow-auto')], [body(h, model)]),
      ExportDialog.exportDialogView(h, model.exportDialog, (message) =>
        GotCollageExportDialogMessage({ message }),
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
          h.button(
            [
              h.OnClick(BackRequested()),
              h.AriaLabel('Back to the main menu'),
              h.Class('px-2 text-xs text-muted hover:text-ink'),
            ],
            ['← Menu'],
          ),
          h.h1([h.Class('text-sm font-semibold tracking-[0.3em] text-accent')], ['COLLAGE']),
        ],
      ),
      h.button(
        [
          h.OnClick(ExportRequested()),
          h.AriaLabel('Export this collage'),
          // Icon-only, like the editor's top bar — the dialog's Export
          // button stays the only visible 'Export' text on the screen.
          h.Class('grid size-8 place-items-center text-muted hover:text-ink'),
        ],
        [icon(h, Download, 'Export this collage')],
      ),
    ],
  )

const notice = (message: string | null, h: HtmlBuilder<CollageMessage>) =>
  message === null
    ? null
    : h.div([h.Class('border-b border-border bg-panel px-4 py-1 text-xs text-accent')], [message])

const body = (h: HtmlBuilder<CollageMessage>, model: Model) =>
  AsyncData.match(model.collage, {
    onFailure: (error) => failureState(h, error.message),
    onIdle: () => spinner(h),
    onLoading: () => spinner(h),
    onRefreshing: () => spinner(h),
    onStale: () => spinner(h),
    onSuccess: (collage) =>
      collage.tiles.length === 0
        ? emptyState(h)
        : h.div(
            [h.Class('flex min-h-0 flex-1 flex-col gap-4 p-4')],
            [controls(h, collage), grid(h, model, collage)],
          ),
  })

const spinner = (h: HtmlBuilder<CollageMessage>) =>
  h.div([h.Class('flex flex-1 items-center justify-center text-sm text-muted')], ['Loading…'])

const failureState = (h: HtmlBuilder<CollageMessage>, message: string) =>
  h.div(
    [h.Class('flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted')],
    [h.p([], [`Could not open this collage: ${message}`])],
  )

const emptyState = (h: HtmlBuilder<CollageMessage>) =>
  h.div(
    [h.Class('flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted')],
    [h.p([], ['Every photo in this collage is gone.'])],
  )

// ---- layout controls ----

const stepperButton = (
  h: HtmlBuilder<CollageMessage>,
  label: string,
  ariaLabel: string,
  onClick: CollageMessage,
) =>
  h.button(
    [
      h.OnClick(onClick),
      h.AriaLabel(ariaLabel),
      h.DataAttribute('layout-control', label),
      h.Class(
        'grid size-6 place-items-center rounded border border-border text-xs text-muted hover:border-muted hover:text-ink',
      ),
    ],
    [label],
  )

const controls = (h: HtmlBuilder<CollageMessage>, collage: Collage) => {
  return h.div(
    [h.Class('flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted')],
    [
      h.div(
        [h.Class('flex items-center gap-2'), h.DataAttribute('control', 'columns')],
        [
          h.span([], ['Columns']),
          stepperButton(
            h,
            '−',
            'One fewer column',
            ChangedColumns({ columns: Math.round(collage.layout.columns) - 1 }),
          ),
          h.span([h.Class('tnum text-ink')], [String(Math.round(collage.layout.columns))]),
          stepperButton(
            h,
            '+',
            'One more column',
            ChangedColumns({ columns: Math.round(collage.layout.columns) + 1 }),
          ),
        ],
      ),
      h.div(
        [h.Class('flex items-center gap-2'), h.DataAttribute('control', 'gutter')],
        [
          h.span([], ['Gutter']),
          stepperButton(
            h,
            '−',
            'Smaller gutter',
            ChangedGutter({ gutter: Math.round(collage.layout.gutter) - 8 }),
          ),
          h.span([h.Class('tnum text-ink')], [`${Math.round(collage.layout.gutter)}px`]),
          stepperButton(
            h,
            '+',
            'Larger gutter',
            ChangedGutter({ gutter: Math.round(collage.layout.gutter) + 8 }),
          ),
        ],
      ),
      h.button(
        [
          h.OnClick(ToggledBackground()),
          h.AriaLabel('Switch the background between dark and light'),
          h.DataAttribute('control', 'background'),
          h.Class(
            'rounded border border-border px-2 py-0.5 text-xs text-muted hover:border-muted hover:text-ink',
          ),
        ],
        [`Background: ${collage.layout.background}`],
      ),
    ],
  )
}

// ---- the preview grid ----

const grid = (h: HtmlBuilder<CollageMessage>, model: Model, collage: Collage) => {
  const columns = Math.round(collage.layout.columns)
  const thumbById = new Map<string, EditSummary>(model.thumbs.map((t) => [t.id, t]))
  const background = collage.layout.background === 'dark' ? 'bg-black' : 'bg-white'
  return h.div(
    [
      h.DataAttribute('collage-grid', `${columns}`),
      h.Style({
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: `${Math.round(collage.layout.gutter)}px`,
        padding: `${Math.round(collage.layout.gutter)}px`,
      }),
      h.Class(`mx-auto w-fit max-w-full ${background}`),
    ],
    collage.tiles.map((tile, index) =>
      tileCell(h, tile.editId, index, collage.tiles.length, thumbById),
    ),
  )
}

const tileCell = (
  h: HtmlBuilder<CollageMessage>,
  editId: string,
  index: number,
  total: number,
  thumbById: Map<string, EditSummary>,
) => {
  const summary = thumbById.get(editId)
  const url = summary === undefined ? null : thumbnailUrl(summary.id, summary.thumbnail)
  return h.div(
    [
      h.DataAttribute('collage-tile', `${index}`),
      h.DataAttribute('tile-edit-id', editId),
      h.Class('relative aspect-square overflow-hidden'),
    ],
    [
      url
        ? h.img([h.Src(url), h.Alt(''), h.Class('h-full w-full object-cover')])
        : h.div(
            [h.Class('flex h-full w-full items-center justify-center text-xs text-muted')],
            ['No thumb'],
          ),
      // Per-tile remove + move overlays, same overlay pattern as the
      // gallery's select/delete controls. Move spans the whole reading order
      // — crossing rows is expected — bounded by the array ends.
      h.div(
        [
          h.Class(
            'absolute inset-x-0 bottom-0 z-10 flex justify-between bg-gradient-to-t from-black/70 to-transparent px-1 py-0.5',
          ),
        ],
        [
          h.div(
            [h.Class('flex gap-0.5')],
            [
              ...(index > 0
                ? [overlayButton(h, '◀', `Move photo ${index} earlier`, MovedTile({ from: index, to: index - 1 }))]
                : []),
              ...(index < total - 1
                ? [overlayButton(h, '▶', `Move photo ${index} later`, MovedTile({ from: index, to: index + 1 }))]
                : []),
            ],
          ),
          overlayButton(h, '✕', `Remove photo ${index}`, RemovedTile({ index })),
        ],
      ),
    ],
  )
}

const overlayButton = (
  h: HtmlBuilder<CollageMessage>,
  glyph: string,
  ariaLabel: string,
  onClick: CollageMessage,
) =>
  h.button(
    [
      h.OnClick(onClick),
      h.AriaLabel(ariaLabel),
      h.Class('relative z-10 grid size-7 place-items-center text-[10px] text-white/80 hover:text-white'),
    ],
    [glyph],
  )
