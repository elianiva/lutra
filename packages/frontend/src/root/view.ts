import { type Document, type Html, type HtmlBuilder, createLazy } from 'foldkit/html'
import { Match, Schema as S } from 'effect'
import type { Model } from './model'
import { AppMessage, RootMessage } from './message'
import { OfflineMessage } from '../offline/messages'
import { GalleryRoute, EditorRoute, CollageRoute, CollageHomeRoute } from '../route'
import * as Gallery from '../gallery'
import * as Editor from '../editor'
import * as Collage from '../collage'

/**
 * The root's view (docs/adr/0009). Emits a whole-document shell and embeds
 * exactly one Submodel under the active route arm, each in its own slot, so
 * navigating gallery↔editor tears down one and builds the other fresh (route
 * view identity). The `toParentMessage` for each wraps every child Message in
 * the root's `Got*Message` so the child boundary stays intact.
 *
 * The offline UI (docs/adr/0015) is root-owned for the same reason it is
 * root-owned in the model: the progress card floats bottom-right on the main
 * menu, the toast is global, and both read the offline slice directly.
 */
// ---- lazy slots (ADR 0034) ----
// Each slot preserves a cached VNode when its slice's reference is unchanged
// (root uses `evo`, so unchanged keys keep ===). Builder `h` is singleton.
const lazyUnsupported = createLazy()
const lazyReadyToast = createLazy()
const lazyOfflineCard = createLazy()
const lazyActiveRoute = createLazy()

const toGalleryParent = (
  message: Parameters<typeof RootMessage.GotGalleryMessage>[0]['message'],
): RootMessage => RootMessage.GotGalleryMessage({ message })
const toEditorParent = (
  message: Parameters<typeof RootMessage.GotEditorMessage>[0]['message'],
): RootMessage => RootMessage.GotEditorMessage({ message })
const toCollageParent = (
  message: Parameters<typeof RootMessage.GotCollageMessage>[0]['message'],
): RootMessage => RootMessage.GotCollageMessage({ message })

// Module-scope helpers for lazy — stable fn references (lazy compares fn === prevFn)
const unsupportedScreenView = (webgpu: Model['webgpu'], h: HtmlBuilder<AppMessage>): Html =>
  h.div(
    [h.Class('flex h-full flex-col items-center justify-center bg-bg px-6 py-12 text-ink')],
    [
      h.div(
        [h.Class('max-w-md text-center')],
        [
          h.h1([h.Class('text-xl font-semibold')], ['WebGPU required']),
          h.p(
            [h.Class('mt-3 text-sm text-muted')],
            [
              'Lutra grades photos on your GPU through WebGPU, and this browser doesn’t expose it — so the editor can’t run here.',
            ],
          ),
          h.ul(
            [h.Class('mt-6 space-y-2 text-left text-sm text-muted')],
            [
              h.li([], ['Use a recent Chrome, Edge, or Safari 17+ (desktop).']),
              h.li(
                [],
                ['On Firefox, enable WebGPU (about:config → dom.webgpu.enabled) or update.'],
              ),
              h.li([], ['Make sure hardware acceleration is enabled in your browser settings.']),
              h.li(
                [],
                ['On a managed or locked-down device, ask your administrator to allow WebGPU.'],
              ),
            ],
          ),
          webgpu.reason === ''
            ? null
            : h.p([h.Class('mt-6 text-xs text-muted')], [`Details: ${webgpu.reason}`]),
          h.p(
            [h.Class('mt-6 text-xs text-muted')],
            ['Once you’re on a supported browser, just reload.'],
          ),
        ],
      ),
    ],
  )

const unsupportedScreen = (model: Model, h: HtmlBuilder<AppMessage>): Document => ({
  body: h.div(
    [h.Class('flex h-full flex-col items-center justify-center bg-bg px-6 py-12 text-ink')],
    [
      h.div(
        [h.Class('max-w-md text-center')],
        [
          h.h1([h.Class('text-xl font-semibold')], ['WebGPU required']),
          h.p(
            [h.Class('mt-3 text-sm text-muted')],
            [
              'Lutra grades photos on your GPU through WebGPU, and this browser doesn’t expose it — so the editor can’t run here.',
            ],
          ),
          h.ul(
            [h.Class('mt-6 space-y-2 text-left text-sm text-muted')],
            [
              h.li([], ['Use a recent Chrome, Edge, or Safari 17+ (desktop).']),
              h.li(
                [],
                ['On Firefox, enable WebGPU (about:config → dom.webgpu.enabled) or update.'],
              ),
              h.li([], ['Make sure hardware acceleration is enabled in your browser settings.']),
              h.li(
                [],
                ['On a managed or locked-down device, ask your administrator to allow WebGPU.'],
              ),
            ],
          ),
          model.webgpu.reason === ''
            ? null
            : h.p([h.Class('mt-6 text-xs text-muted')], [`Details: ${model.webgpu.reason}`]),
          h.p(
            [h.Class('mt-6 text-xs text-muted')],
            ['Once you’re on a supported browser, just reload.'],
          ),
        ],
      ),
    ],
  ),
  title: 'Lutra',
})

const readyToastView = (ready: boolean, h: HtmlBuilder<AppMessage>): Html =>
  ready
    ? h.div(
        [
          h.OnClick(OfflineMessage.OfflineReadyDismissed()),
          h.Class(
            'fixed inset-x-4 bottom-4 z-50 cursor-pointer border border-border bg-panel px-4 py-3 text-sm text-ink shadow-lg md:inset-x-auto md:right-4 md:w-64',
          ),
        ],
        ['Offline ready — Lutra works without a connection'],
      )
    : null

const offlineCardView = (offline: Model['offline'], h: HtmlBuilder<AppMessage>): Html =>
  offlineCardImpl(offline, h)

const activeRouteView = (
  route: Model['route'],
  gallery: Model['gallery'],
  editor: Model['editor'],
  collage: Model['collage'],
  h: HtmlBuilder<AppMessage>,
): Html =>
  Match.value(route).pipe(
    Match.withReturnType<Html>(),
    Match.when(S.is(GalleryRoute), () =>
      h.submodel({
        model: gallery,
        slotId: 'gallery',
        toParentMessage: toGalleryParent,
        view: Gallery.view,
      }),
    ),
    Match.when(S.is(EditorRoute), () =>
      h.submodel({
        model: editor,
        slotId: 'editor',
        toParentMessage: toEditorParent,
        view: Editor.view,
      }),
    ),
    Match.when(S.is(CollageHomeRoute), () => h.div([], [])),
    Match.when(S.is(CollageRoute), () =>
      h.submodel({
        model: collage,
        slotId: 'collage',
        toParentMessage: toCollageParent,
        view: Collage.view,
      }),
    ),
    Match.orElse(() => notFound(h)),
  )

export const view = (model: Model, h: HtmlBuilder<AppMessage>): Document => {
  if (!model.webgpu.supported) {
    return {
      body: lazyUnsupported(unsupportedScreenView, [model.webgpu, h])!,
      title: 'Lutra',
    }
  }
  return {
    body: h.div(
      [h.Class('flex h-full flex-col bg-bg text-ink')],
      [
        lazyReadyToast(readyToastView, [model.offline.readyToast, h]),
        ...Match.value(model.route).pipe(
          Match.withReturnType<readonly Html[]>(),
          Match.when(S.is(GalleryRoute), () => {
            const card = lazyOfflineCard(offlineCardView, [model.offline, h])
            return card ? [card] : []
          }),
          Match.orElse(() => []),
        ),
        lazyActiveRoute(activeRouteView, [
          model.route,
          model.gallery,
          model.editor,
          model.collage,
          h,
        ])!,
      ],
    ),
    title: 'Lutra',
  }
}

// (readyToastView / offlineCardView defined above for lazy)

// The offline progress card (docs/adr/0015): the fill's live state floats
// bottom-right, out of the layout — the gallery no longer shifts when the
// strip appears or disappears. Nothing renders once the library is ready
// (the toast announced it) — and nothing renders in the editor; the fill is
// housekeeping, the editor is for grading.
const offlineCardImpl = (offline: Model['offline'], h: HtmlBuilder<AppMessage>) => {
  // offline passed as slice for lazy === check
  const pct = offline.total > 0 ? Math.round((offline.downloaded / offline.total) * 100) : 0
  const frame = (content: readonly Html[]) =>
    h.div(
      [
        // inset-x-4 on phones (docs/adr/0024-mobile-ui): the card spans the viewport
        // width instead of floating in the corner; `md:` restores the
        // fixed-width corner float.
        h.Class(
          'fixed inset-x-4 bottom-4 z-50 border border-border bg-panel px-4 py-3 shadow-lg md:inset-x-auto md:right-4 md:w-64',
        ),
      ],
      content,
    )
  const progress = h.div(
    [h.Class('h-1 w-full bg-border-strong')],
    [h.div([h.Class('h-full bg-accent'), h.Style({ width: `${pct}%` })], [])],
  )
  const counters = h.div(
    [h.Class('text-xs text-muted tnum')],
    [`${offline.downloaded} / ${offline.total} files`],
  )
  const actionButton = (label: string, ariaLabel: string) =>
    h.button(
      [
        h.OnClick(OfflineMessage.OfflineFillRequested()),
        h.AriaLabel(ariaLabel),
        h.Class(
          'rounded border border-accent px-2 py-0.5 text-accent hover:border-ink hover:text-ink',
        ),
      ],
      [label],
    )
  const titleRow = (title: string, trailing: string | null) =>
    h.div(
      [h.Class('flex items-baseline justify-between gap-3')],
      [
        h.span([h.Class('text-sm text-ink')], [title]),
        ...(trailing === null ? [] : [h.span([h.Class('text-sm text-ink tnum')], [trailing])]),
      ],
    )

  switch (offline.phase._tag) {
    case 'Filling': {
      return frame([
        titleRow('Preparing offline library', `${pct}%`),
        h.div([h.Class('mt-2')], [progress]),
        h.div([h.Class('mt-1.5')], [counters]),
      ])
    }
    case 'Paused': {
      return frame([
        titleRow('Offline library paused', `${pct}%`),
        h.div([h.Class('mt-2')], [progress]),
        h.div([h.Class('mt-1.5 text-xs text-muted')], ['Waiting for a connection']),
      ])
    }
    case 'QuotaError': {
      return frame([
        titleRow('Storage full', `${pct}%`),
        h.div([h.Class('mt-2')], [progress]),
        h.div(
          [h.Class('mt-2 flex items-center justify-between gap-3')],
          [
            h.span([h.Class('text-xs text-muted')], ['Offline library paused']),
            actionButton('Retry', 'Retry preparing the offline library'),
          ],
        ),
      ])
    }
    case 'Idle': {
      return offline.saveData
        ? frame([
            h.div([h.Class('text-sm text-ink')], ['Offline library not downloaded']),
            h.div(
              [h.Class('mt-2 flex justify-end')],
              [actionButton('Start offline download', 'Start preparing the offline library')],
            ),
          ])
        : null
    }
    case 'Ready': {
      return null
    }
  }
}

// (activeRoute superseded by activeRouteView above)

const notFound = (h: HtmlBuilder<AppMessage>) =>
  h.div([h.Class('flex flex-1 items-center justify-center text-sm text-muted')], ['Not found'])
