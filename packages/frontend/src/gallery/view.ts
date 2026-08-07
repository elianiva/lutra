import { Submodel } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import { AsyncData } from 'foldkit'
import { ClickedEdit, DeleteRequested, OpenPhotoRequested, RefreshRequested } from './message'
import type { GalleryMessage } from './message'
import type { Model } from './model'
import type { EditSummary, EditId, StoreError } from '@lutra/store'

/**
 * The Gallery Submodel's view (docs/adr/0009). Branded via `defineView` so it
 * embeds under the root through `h.submodel`, with `h` typed to the Gallery's
 * own Message union. Renders the grid of Edit summaries ordered by `savedAt`.
 *
 * Thumbnails: `EditSummary.thumbnail` is encoded bytes. A per-summary object
 * URL is created from the bytes and memoized by id. The lifecycle (revoking
 * on unmount / delete) is refined in the editor save-flow slice per the
 * thumbnail contract (docs/adr/0007).
 */
export const view = Submodel.defineView<Model, GalleryMessage>((model, h) => {
  const grid = model.grid
  return h.div(
    [h.Class('flex h-full flex-col bg-bg text-ink')],
    [
      header(h),
      notice(model.notice, h),
      h.main([h.Class('flex min-h-0 flex-1')], [gridBody(h, grid)]),
    ],
  )
})

const notice = (message: string | null, h: HtmlBuilder<GalleryMessage>) =>
  message === null
    ? null
    : h.div([h.Class('border-b border-border bg-panel px-4 py-1 text-xs text-accent')], [message])

const header = (h: HtmlBuilder<GalleryMessage>) =>
  h.header(
    [h.Class('flex items-center justify-between border-b border-border bg-panel px-4 py-2')],
    [
      h.h1([h.Class('text-sm font-semibold tracking-[0.3em] text-accent')], ['LUTRA']),
      h.div([h.Class('flex items-center gap-2')], [
        h.button(
          [
            h.OnClick(OpenPhotoRequested()),
            h.AriaLabel('Open a photo to start a new edit'),
            h.Class(
              'rounded border border-accent px-3 py-1 text-xs text-accent hover:border-ink hover:text-ink',
            ),
          ],
          ['Open photo'],
        ),
        h.button(
          [
            h.OnClick(RefreshRequested()),
            h.AriaLabel('Refresh'),
            h.Class('px-2 text-xs text-muted hover:text-ink'),
          ],
          ['Refresh'],
        ),
      ]),
    ],
  )

const gridBody = (
  h: HtmlBuilder<GalleryMessage>,
  grid: AsyncData.AsyncData<ReadonlyArray<EditSummary>, StoreError>,
) =>
  AsyncData.match(grid, {
    onIdle: () => spinner(h),
    onLoading: () => spinner(h),
    onRefreshing: () => spinner(h),
    onSuccess: (summaries) =>
      summaries.length === 0 ? emptyState(h) : gridTiles(h, summaries),
    onFailure: (error) => errorState(h, error.message),
    onStale: () => spinner(h),
  })

const spinner = (h: HtmlBuilder<GalleryMessage>) =>
  h.div(
    [h.Class('flex flex-1 items-center justify-center text-sm text-muted')],
    ['Loading…'],
  )

const emptyState = (h: HtmlBuilder<GalleryMessage>) =>
  h.div(
    [h.Class('flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted')],
    [
      h.p([], ['No saved edits yet.']),
      h.button(
        [
          h.OnClick(OpenPhotoRequested()),
          h.AriaLabel('Open a photo to start a new edit'),
          h.Class('rounded bg-accent px-4 py-2 text-xs text-ink hover:opacity-80'),
        ],
        ['Open a photo to start editing'],
      ),
      h.p([h.Class('text-xs text-muted')], [
        'Your edits will appear here.',
      ]),
    ],
  )

const errorState = (h: HtmlBuilder<GalleryMessage>, error: string) =>
  h.div(
    [h.Class('flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted')],
    [
      h.p([], [`Could not load your gallery: ${error}`]),
      h.button(
        [h.OnClick(RefreshRequested()), h.Class('cursor-pointer text-ink underline underline-offset-2')],
        ['Try again'],
      ),
    ],
  )

const gridTiles = (
  h: HtmlBuilder<GalleryMessage>,
  summaries: ReadonlyArray<EditSummary>,
) =>
  h.div(
    [h.Class('grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 p-4')],
    summaries.map((summary) => tile(h, summary)),
  )

const tile = (h: HtmlBuilder<GalleryMessage>, summary: EditSummary) =>
  h.button(
    [
      h.OnClick(ClickedEdit({ id: summary.id })),
      h.AriaLabel(`Open saved edit`),
      h.DataAttribute('edit-id', summary.id),
      h.Class(
        'group relative aspect-square overflow-hidden rounded border border-border bg-panel hover:border-muted',
      ),
    ],
    [
      tileThumb(h, summary),
      h.div(
        [
          h.Class(
            'absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 py-1',
          ),
        ],
        [
          h.span([h.Class('text-[10px] text-white/80')], [
            `${Number(summary.savedAt) > 0 ? new Date(summary.savedAt).toLocaleDateString() : ''}`,
          ]),
          h.div(
            [h.Class('flex items-center gap-1')],
            [
              h.button(
                [
                  h.OnClick(DeleteRequested({ id: summary.id })),
                  h.AriaLabel('Delete saved edit'),
                  h.Class('text-[10px] text-white/80 hover:text-white'),
                  h.DataAttribute('delete-edit-id', summary.id),
                ],
                ['✕'],
              ),
            ],
          ),
        ],
      ),
    ],
  )

/** Memoize bytes→object URL per summary id. Dormant while the store is empty. */
const thumbnailUrlCache = new Map<EditId, string>()
const tileThumb = (h: HtmlBuilder<GalleryMessage>, summary: EditSummary) => {
  let url = thumbnailUrlCache.get(summary.id)
  const bytes = summary.thumbnail
  if (!url && bytes) {
    // The bytes' buffer came from the store as a transferred ArrayBuffer; TS
    // can't know that, hence the BlobPart assertion (as in PrepareExport).
    // oxlint-disable-next-line consistent-type-assertions
    const blob = new Blob([bytes as BlobPart], { type: 'image/png' })
    url = URL.createObjectURL(blob)
    thumbnailUrlCache.set(summary.id, url)
  }
  return url
    ? h.img([h.Src(url), h.Alt(''), h.Class('h-full w-full object-cover')])
    : h.div([h.Class('flex h-full w-full items-center justify-center text-muted')], ['No thumb'])
}
