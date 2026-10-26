import { DateTime } from 'effect'
import { Submodel, AsyncData } from 'foldkit'
import { type Html, type HtmlBuilder, createLazy, createKeyedLazy } from 'foldkit/html'
import { Upload, X } from 'lucide'
import { button } from '@/components/ui/button'
import { GalleryMessage } from './message'
import type { Model } from './model'
import type { EditSummary, StoreError } from '@lutra/store'
import { settingsDialogView } from './settings-dialog'
import { deleteDialogView } from './delete-dialog'
import { thumbnailUrl } from '../thumbnail-url'
import { icon } from '../components/icon'

/**
 * The Gallery Submodel's view (docs/adr/0006-frontend-architecture). Branded via `defineView` so it
 * embeds under the root through `h.submodel`, with `h` typed to the Gallery's
 * own Message union. Renders the grid of Edit summaries ordered by `savedAt`.
 *
 * Thumbnails: `EditSummary.thumbnail` is encoded bytes. A per-summary object
 * URL is created from the bytes and memoized by id. The lifecycle (revoking
 * on unmount / delete) is refined in the editor save-flow slice per the
 * thumbnail contract (docs/adr/0005-storage).
 */
// memoization (ADR 0006)
const lazyHeader = createLazy()
const lazyNotice = createLazy()
const lazyTile = createKeyedLazy()

const headerView = (h: HtmlBuilder<GalleryMessage>): Html => header(h)
const noticeView = (message: string | null, h: HtmlBuilder<GalleryMessage>): Html =>
  notice(message, h)

export const view = Submodel.defineView<Model, GalleryMessage>((model, h) => {
  const { grid } = model
  return h.div(
    [
      h.Class('relative flex h-full flex-col bg-bg text-ink'),
      h.DataAttribute('gallery-drop-zone', 'true'),
      h.OnDragEnter(GalleryMessage.DragEntered()),
      h.OnDragLeave(GalleryMessage.DragLeft()),
      h.OnDragOver(GalleryMessage.DragEntered()),
      h.AllowDrop(),
      h.OnDropFiles((files) => GalleryMessage.FilesDropped({ files: [...files] })),
    ],
    [
      lazyHeader(headerView, [h])!,
      lazyNotice(noticeView, [model.notice, h]) ?? notice(model.notice, h),
      h.main([h.Class('flex min-h-0 flex-1 flex-col overflow-auto')], [gridBody(h, grid)]),
      settingsDialogView(h, model),
      deleteDialogView(h, model),
      dropOverlay(h, model.dragOver),
    ],
  )
})

const notice = (message: string | null, h: HtmlBuilder<GalleryMessage>) =>
  message === null
    ? null
    : h.div([h.Class('border-b border-border bg-panel px-4 py-1 text-xs text-accent')], [message])

const header = (h: HtmlBuilder<GalleryMessage>) =>
  h.header(
    [h.Class('flex h-16 flex-none items-center gap-6')],
    [
      h.h1([h.Class('text-xs font-semibold tracking-[0.34em] text-signal')], ['LUTRA']),
      h.div(
        [h.Class('ml-auto flex items-center gap-2')],
        [
          h.button(
            [
              h.Class(
                'key flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-[10px] uppercase tracking-[0.1em] text-accent-ink',
              ),
              h.OnClick(GalleryMessage.OpenPhotoRequested()),
              h.AriaLabel('Open a photo to start a new edit'),
            ],
            ['Open photo'],
          ),
          h.button(
            [
              h.Class(
                'flex h-10 items-center rounded-full px-3 text-[10px] uppercase tracking-[0.1em] text-muted hover:bg-s1 hover:text-ink',
              ),
              h.OnClick(GalleryMessage.RefreshRequested()),
              h.AriaLabel('Refresh'),
            ],
            ['Refresh'],
          ),
          h.button(
            [
              h.Class(
                'flex h-10 items-center rounded-full px-3 text-[10px] uppercase tracking-[0.1em] text-muted hover:bg-s1 hover:text-ink',
              ),
              h.OnClick(GalleryMessage.SettingsRequested()),
              h.AriaLabel('Open settings'),
              h.DataAttribute('open-settings', 'true'),
            ],
            ['Settings'],
          ),
        ],
      ),
    ],
  )

const gridBody = (
  h: HtmlBuilder<GalleryMessage>,
  grid: AsyncData.AsyncData<readonly EditSummary[], StoreError>,
) =>
  AsyncData.match(grid, {
    onFailure: (error) => errorState(h, error.message),
    onIdle: () => spinner(h),
    onLoading: () => spinner(h),
    onRefreshing: () => spinner(h),
    onStale: () => spinner(h),
    onSuccess: (summaries) => (summaries.length === 0 ? emptyState(h) : gridTiles(h, summaries)),
  })

const spinner = (h: HtmlBuilder<GalleryMessage>) =>
  h.div([h.Class('flex flex-1 items-center justify-center text-sm text-muted')], ['Loading…'])

const dropOverlay = (h: HtmlBuilder<GalleryMessage>, active: boolean): Html =>
  active
    ? h.div(
        [
          h.Class(
            'pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 border-2 border-dashed border-accent bg-bg/80 backdrop-blur-sm',
          ),
          h.DataAttribute('drop-overlay', 'true'),
        ],
        [
          h.div(
            [
              h.Class(
                'flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent bg-panel text-accent',
              ),
            ],
            [icon(h, Upload, 'Drop photos', 28)],
          ),
          h.p([h.Class('text-sm font-semibold tracking-wide text-accent')], ['Drop photos to add']),
          h.p([h.Class('text-xs text-muted')], ['Release to add them to your gallery']),
        ],
      )
    : null

const emptyState = (h: HtmlBuilder<GalleryMessage>) =>
  h.div(
    [
      h.Class('flex flex-1 flex-col items-center justify-center gap-4 text-xs text-muted'),
      h.DataAttribute('empty-state', 'true'),
    ],
    [
      h.div(
        [h.Class('well flex w-[min(420px,100%)] flex-col items-center gap-3 p-6 text-center')],
        [
          h.p([h.Class('text-sm text-ink')], ['No saved edits yet.']),
          h.button(
            [
              h.Class(
                'key flex h-9 items-center rounded-full bg-accent px-4 text-[10px] uppercase tracking-[0.1em] text-accent-ink',
              ),
              h.OnClick(GalleryMessage.OpenPhotoRequested()),
              h.AriaLabel('Open a photo to start a new edit'),
            ],
            ['Open a photo to start editing'],
          ),
          h.p([h.Class('text-[10px] text-dim')], ['Or drop images here. Paste also works.']),
        ],
      ),
    ],
  )

const errorState = (h: HtmlBuilder<GalleryMessage>, error: string) =>
  h.div(
    [h.Class('flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted')],
    [
      h.p([], [`Could not load your gallery: ${error}`]),
      button(
        {
          onClick: GalleryMessage.RefreshRequested(),
          variant: 'link',
          className: 'h-auto p-0',
        },
        'Try again',
        h,
      ),
    ],
  )

/** Overlay controls (select, delete, caption) stay invisible until the
 *  pointer rests on the card or focus moves into it — instantly, no
 *  transition. Focus uses `:focus-visible` (not plain focus) so a mouse
 *  click that lands on a control doesn't latch the overlays open after the
 *  pointer leaves; tabbing in still reveals them for keyboard users. */
const hoverReveal = 'opacity-0 group-hover:opacity-100 group-has-focus-visible:opacity-100'

const gridTiles = (h: HtmlBuilder<GalleryMessage>, summaries: readonly EditSummary[]) =>
  h.div(
    [
      h.Class(
        'grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-5 pb-2 pt-2 max-sm:grid-cols-2',
      ),
    ],
    summaries.map((summary) => lazyTile(summary.id, tileView, [summary, h])!),
  )

const tileView = (summary: EditSummary, h: HtmlBuilder<GalleryMessage>): Html => tile(h, summary)

const tile = (h: HtmlBuilder<GalleryMessage>, summary: EditSummary) =>
  h.div(
    [
      h.Key(summary.id),
      h.DataAttribute('edit-id', summary.id),
      h.Class(
        'surface group relative aspect-square overflow-hidden transition-shadow hover:shadow-[inset_0_1px_0_var(--mat-rim),0_18px_40px_-18px_var(--mat-shadow-a)]',
      ),
    ],
    [
      // Click target for opening the edit — must not include the delete button
      // so those clicks don't bubble up into ClickedEdit.
      button(
        {
          onClick: GalleryMessage.ClickedEdit({ id: summary.id }),
          variant: 'ghost',
          className: 'absolute inset-0 h-auto p-0',
          attributes: [h.AriaLabel('Open saved edit')],
        },
        [tileThumb(h, summary)],
        h,
      ),
      // Caption + delete ✕: hidden until hover/focus (the ✕ opens the
      // delete-confirmation dialog, ADR-0010 superseded).
      h.div(
        [
          h.Class(
            `absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-3 py-2 ${hoverReveal}`,
          ),
        ],
        [
          h.span(
            [h.Class('text-[10px] tracking-[0.08em] text-white/85')],
            [
              summary.savedAt > 0
                ? DateTime.formatLocal({ dateStyle: 'short' })(DateTime.makeUnsafe(summary.savedAt))
                : '',
            ],
          ),
          h.div(
            [h.Class('flex items-center gap-1')],
            [
              button(
                {
                  onClick: GalleryMessage.DeleteConfirmRequested({ id: summary.id }),
                  variant: 'ghost',
                  size: 'icon-sm',
                  className:
                    'relative z-10 grid place-items-center p-0 text-white/80 hover:text-white',
                  attributes: [
                    h.AriaLabel('Delete saved edit'),
                    h.DataAttribute('delete-edit-id', summary.id),
                  ],
                },
                [icon(h, X, 'Delete saved edit')],
                h,
              ),
            ],
          ),
        ],
      ),
    ],
  )

const tileThumb = (h: HtmlBuilder<GalleryMessage>, summary: EditSummary) => {
  const url = thumbnailUrl(summary.id, summary.thumbnail)
  return url
    ? h.img([h.Src(url), h.Alt(''), h.Class('h-full w-full object-cover')])
    : h.div([h.Class('flex h-full w-full items-center justify-center text-muted')], ['No thumb'])
}
