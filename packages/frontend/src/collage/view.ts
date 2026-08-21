import { DateTime } from 'effect'
import { Submodel, AsyncData } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import { BackRequested } from './message'
import type { CollageMessage } from './message'
import type { Model } from './model'
import type { Collage } from '@lutra/store'

/**
 * The Collage Submodel's view (docs/adr/0009). Branded via `defineView` so it
 * embeds under the root through `h.submodel`, with `h` typed to the collage's
 * own Message union. This chunk renders the loaded record's facts; the grid
 * preview and layout controls land with the screen work.
 */
export const view = Submodel.defineView<Model, CollageMessage>((model, h) => {
  return h.div(
    [h.Class('flex h-full flex-col bg-bg text-ink')],
    [header(h), h.main([h.Class('flex min-h-0 flex-1')], [body(h, model)])],
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
    ],
  )

const body = (h: HtmlBuilder<CollageMessage>, model: Model) =>
  AsyncData.match(model.collage, {
    onFailure: (error) => failureState(h, error.message),
    onIdle: () => spinner(h),
    onLoading: () => spinner(h),
    onRefreshing: () => spinner(h),
    onStale: () => spinner(h),
    onSuccess: (collage) => loadedState(h, collage),
  })

const spinner = (h: HtmlBuilder<CollageMessage>) =>
  h.div([h.Class('flex flex-1 items-center justify-center text-sm text-muted')], ['Loading…'])

const failureState = (h: HtmlBuilder<CollageMessage>, message: string) =>
  h.div(
    [h.Class('flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted')],
    [h.p([], [`Could not open this collage: ${message}`])],
  )

const loadedState = (h: HtmlBuilder<CollageMessage>, collage: Collage) => {
  const date =
    collage.savedAt > 0
      ? DateTime.formatLocal({ dateStyle: 'short' })(DateTime.makeUnsafe(collage.savedAt))
      : ''
  return h.div(
    [h.Class('flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted')],
    [
      h.p([], [`${collage.tiles.length} photos · ${collage.layout.columns} columns`]),
      h.p([h.Class('text-xs')], [date]),
    ],
  )
}
