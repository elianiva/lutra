import { DateTime } from 'effect'
import { Submodel, AsyncData } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import {
  ClickedEdit,
  CreateCollageRequested,
  DeleteRequested,
  OpenPhotoRequested,
  RefreshRequested,
  SettingsRequested,
  ToggledSelection,
} from './message'
import type { GalleryMessage } from './message'
import type { Model } from './model'
import type { EditSummary, EditId, StoreError } from '@lutra/store'
import { settingsDialogView } from './settings-dialog'

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
  const { grid } = model
  return h.div(
    [h.Class('flex h-full flex-col bg-bg text-ink')],
    [
      header(h, model.selection.length),
      notice(model.notice, h),
      h.main([h.Class('flex min-h-0 flex-1')], [gridBody(h, grid, model.selection)]),
      settingsDialogView(h, model),
    ],
  )
})

const notice = (message: string | null, h: HtmlBuilder<GalleryMessage>) =>
  message === null
    ? null
    : h.div([h.Class('border-b border-border bg-panel px-4 py-1 text-xs text-accent')], [message])

const header = (h: HtmlBuilder<GalleryMessage>, selectedCount: number) =>
  h.header(
    [h.Class('flex items-center justify-between border-b border-border bg-panel px-4 py-2')],
    [
      h.h1([h.Class('text-sm font-semibold tracking-[0.3em] text-accent')], ['LUTRA']),
      h.div(
        [h.Class('flex items-center gap-2')],
        [
          // "Create collage" appears once two or more edits are selected
          // (docs/adr/0030): below that there is nothing to arrange.
          ...(selectedCount >= 2
            ? [
                h.button(
                  [
                    h.OnClick(CreateCollageRequested()),
                    h.AriaLabel(`Create a collage from ${selectedCount} selected edits`),
                    h.DataAttribute('create-collage', 'true'),
                    h.Class(
                      'rounded bg-accent px-3 py-1 text-xs text-ink hover:opacity-80',
                    ),
                  ],
                  [`Create collage (${selectedCount})`],
                ),
              ]
            : []),
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
          // Same utility-action styling as "Refresh" — settings is chrome,
          // not a primary CTA like "Open photo".
          h.button(
            [
              h.OnClick(SettingsRequested()),
              h.AriaLabel('Open settings'),
              h.DataAttribute('open-settings', 'true'),
              h.Class('px-2 text-xs text-muted hover:text-ink'),
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
  selection: readonly EditId[],
) =>
  AsyncData.match(grid, {
    onFailure: (error) => errorState(h, error.message),
    onIdle: () => spinner(h),
    onLoading: () => spinner(h),
    onRefreshing: () => spinner(h),
    onStale: () => spinner(h),
    onSuccess: (summaries) =>
      summaries.length === 0 ? emptyState(h) : gridTiles(h, summaries, selection),
  })

const spinner = (h: HtmlBuilder<GalleryMessage>) =>
  h.div([h.Class('flex flex-1 items-center justify-center text-sm text-muted')], ['Loading…'])

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
      h.p([h.Class('text-xs text-muted')], ['Your edits will appear here.']),
    ],
  )

const errorState = (h: HtmlBuilder<GalleryMessage>, error: string) =>
  h.div(
    [h.Class('flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted')],
    [
      h.p([], [`Could not load your gallery: ${error}`]),
      h.button(
        [
          h.OnClick(RefreshRequested()),
          h.Class('cursor-pointer text-ink underline underline-offset-2'),
        ],
        ['Try again'],
      ),
    ],
  )

const gridTiles = (
  h: HtmlBuilder<GalleryMessage>,
  summaries: readonly EditSummary[],
  selection: readonly EditId[],
) =>
  h.div(
    [h.Class('grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 p-4')],
    summaries.map((summary) => tile(h, summary, selection.includes(summary.id))),
  )

const tile = (h: HtmlBuilder<GalleryMessage>, summary: EditSummary, selected: boolean) =>
  h.div(
    [
      h.DataAttribute('edit-id', summary.id),
      h.Class(
        `group relative aspect-square overflow-hidden rounded border bg-panel hover:border-muted ${
          selected ? 'border-accent' : 'border-border'
        }`,
      ),
    ],
    [
      // Click target for opening the edit — must not include the select or
      // delete buttons so those clicks don't bubble up into ClickedEdit.
      h.button(
        [
          h.OnClick(ClickedEdit({ id: summary.id })),
          h.AriaLabel(`Open saved edit`),
          h.Class('absolute inset-0'),
        ],
        [tileThumb(h, summary)],
      ),
      // The collage-select control (docs/adr/0030): a persistent overlay
      // like the delete control — no separate "select mode" to enter or
      // leave; the header CTA appears at two or more.
      h.button(
        [
          h.OnClick(ToggledSelection({ id: summary.id })),
          h.AriaLabel(
            selected ? 'Remove from collage selection' : 'Add to collage selection',
          ),
          h.DataAttribute('select-edit-id', summary.id),
          h.Class(
            `absolute left-1 top-1 z-10 grid size-7 place-items-center rounded-full border text-[10px] ${
              selected
                ? 'border-accent bg-accent text-ink'
                : 'border-white/60 bg-black/40 text-white/80 hover:text-white'
            }`,
          ),
        ],
        [selected ? '✓' : ''],
      ),
      h.div(
        [
          h.Class(
            'absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 py-1',
          ),
        ],
        [
          h.span(
            [h.Class('text-[10px] text-white/80')],
            [summary.savedAt > 0 ? DateTime.formatLocal({ dateStyle: 'short' })(DateTime.makeUnsafe(summary.savedAt)) : ''],
          ),
          h.div(
            [h.Class('flex items-center gap-1')],
            [
              h.button(
                [
                  h.OnClick(DeleteRequested({ id: summary.id })),
                  h.AriaLabel('Delete saved edit'),
                  // size-7: a finger-sized hit target on touch screens
                  // (docs/adr/0024-mobile-ui) — the glyph stays small.
                  h.Class(
                    'relative z-10 grid size-7 place-items-center text-[10px] text-white/80 hover:text-white',
                  ),
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

/** Memoize bytes→object URL per summary id via the shared cache. */
import { thumbnailUrl } from '../thumbnail-url'
const tileThumb = (h: HtmlBuilder<GalleryMessage>, summary: EditSummary) => {
  const url = thumbnailUrl(summary.id, summary.thumbnail)
  return url
    ? h.img([h.Src(url), h.Alt(''), h.Class('h-full w-full object-cover')])
    : h.div([h.Class('flex h-full w-full items-center justify-center text-muted')], ['No thumb'])
}
