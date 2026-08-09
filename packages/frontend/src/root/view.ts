import { Document, type Html, type HtmlBuilder } from 'foldkit/html'
import { Match, Schema as S } from 'effect'
import type { Model } from './model'
import type { RootMessage } from './message'
import {
  GotGalleryMessage,
  GotEditorMessage,
  OfflineFillRequested,
  OfflineReadyDismissed,
} from './message'
import { GalleryRoute, EditorRoute } from '../route'
import * as Gallery from '../gallery'
import * as Editor from '../editor'

/**
 * The root's view (docs/adr/0009). Emits a whole-document shell and embeds
 * exactly one Submodel under the active route arm, each in its own slot, so
 * navigating gallery↔editor tears down one and builds the other fresh (route
 * view identity). The `toParentMessage` for each wraps every child Message in
 * the root's `Got*Message` so the child boundary stays intact.
 *
 * The offline UI (docs/adr/0015) is root-owned for the same reason it is
 * root-owned in the model: the progress strip renders on the main menu, the
 * toast is global, and both read the offline slice directly.
 */
export const view = (model: Model, h: HtmlBuilder<RootMessage>): Document => ({
  title: 'Lutra',
  body: h.div([h.Class('flex h-full flex-col bg-bg text-ink')], [
    readyToast(model, h),
    ...(Match.value(model.route).pipe(
      Match.withReturnType<ReadonlyArray<Html>>(),
      Match.when(S.is(GalleryRoute), () => [offlineStrip(model, h)]),
      Match.orElse(() => []),
    )),
    activeRoute(model, h),
  ]),
})

// The "Offline ready" toast: shows on the fill's Filling → Ready transition
// and goes away on click or the auto-dismiss timer (DismissOfflineToast).
const readyToast = (model: Model, h: HtmlBuilder<RootMessage>) =>
  model.offline.readyToast
    ? h.div(
        [
          h.OnClick(OfflineReadyDismissed()),
          h.Class(
            'fixed bottom-6 left-1/2 z-50 -translate-x-1/2 cursor-pointer rounded bg-panel px-4 py-2 text-sm text-ink shadow-lg ring-1 ring-border',
          ),
        ],
        ['Offline ready — Lutra works without a connection'],
      )
    : null

// The main menu's offline progress strip (docs/adr/0015): the fill's live
// state, or the saveData gate's manual start button. Nothing renders once
// the library is ready (the toast announced it) — and nothing renders in
// the editor; the fill is housekeeping, the editor is for grading.
const offlineStrip = (model: Model, h: HtmlBuilder<RootMessage>) => {
  const offline = model.offline
  const content: Html | null =
    offline.phase._tag === 'Filling'
      ? h.span([], [
          `Preparing offline library — ${
            offline.total > 0 ? Math.round((offline.downloaded / offline.total) * 100) : 0
          }% (${offline.downloaded}/${offline.total})`,
        ])
      : offline.phase._tag === 'Paused'
        ? h.span([], ['Offline library paused — waiting for a connection'])
        : offline.phase._tag === 'QuotaError'
          ? h.div([h.Class('flex items-center gap-2')], [
              h.span([], ['Storage full — offline library paused']),
              h.button(
                [
                  h.OnClick(OfflineFillRequested()),
                  h.AriaLabel('Retry preparing the offline library'),
                  h.Class(
                    'rounded border border-accent px-2 py-0.5 text-accent hover:border-ink hover:text-ink',
                  ),
                ],
                ['Retry'],
              ),
            ])
          : offline.phase._tag === 'Idle' && offline.saveData
            ? h.button(
                [
                  h.OnClick(OfflineFillRequested()),
                  h.AriaLabel('Start preparing the offline library'),
                  h.Class(
                    'rounded border border-accent px-2 py-0.5 text-accent hover:border-ink hover:text-ink',
                  ),
                ],
                ['Start offline download'],
              )
            : null
  return content === null
    ? null
    : h.div(
        [h.Class('flex items-center justify-center gap-2 border-b border-border bg-panel px-4 py-1 text-xs text-muted')],
        [content],
      )
}

const activeRoute = (model: Model, h: HtmlBuilder<RootMessage>) =>
  Match.value(model.route).pipe(
    Match.withReturnType<Html>(),
    Match.when(S.is(GalleryRoute), () =>
      h.submodel({
        slotId: 'gallery',
        model: model.gallery,
        view: Gallery.view,
        toParentMessage: (message) => GotGalleryMessage({ message }),
      }),
    ),
    Match.when(S.is(EditorRoute), () =>
      h.submodel({
        slotId: 'editor',
        model: model.editor,
        view: Editor.view,
        toParentMessage: (message) => GotEditorMessage({ message }),
      }),
    ),
    Match.orElse(() => notFound(h)),
  )

const notFound = (h: HtmlBuilder<RootMessage>) =>
  h.div(
    [h.Class('flex flex-1 items-center justify-center text-sm text-muted')],
    ['Not found'],
  )
