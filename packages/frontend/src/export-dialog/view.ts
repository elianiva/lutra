import { Option, pipe } from 'effect'
import type { ChildAttribute, HtmlBuilder } from 'foldkit/html'
import { Dialog } from '@foldkit/ui'
import { ExportDialogMessage as Message } from './message'
import { filenameFor } from './update'
import type { Model } from './model'
import { fmtBytes, formatSection, qualitySection, resolutionSection } from './sections'
import { peekFrame } from './frame'

/**
 * The shared export dialog view (docs/adr/0004-export): the format / quality /
 * resolution sections with the status line and `<stem>.<format>` filename.
 * Encoding runs only when Export is pressed — the frame is snapshotted once
 * when the dialog opens, then re-encoded per press. The owning screen
 * embeds it via `h.submodel`, wrapping machine messages into its own
 * boundary through `toParent`.
 */
export const exportDialogView = <P>(
  h: HtmlBuilder<P>,
  model: Model,
  toParent: (message: Message) => P,
) =>
  h.submodel({
    model: model.dialog,
    slotId: model.dialog.id,
    toParentMessage: (message) => toParent(Message.GotDialogMessage({ message })),
    view: Dialog.view,
    viewInputs: {
      toView: ({ dialog, backdrop, panel, title, closeButton, isVisible }) =>
        h.dialog(
          [...dialog, h.Class('relative')],
          isVisible
            ? [
                // The dialog is `position: relative`; the backdrop and panel
                // are positioned against it (see @foldkit/ui-showcase).
                h.div([...backdrop, h.Class('fixed inset-0 z-[59] bg-black/60')], []),
                h.div(
                  [
                    ...panel,
                    // Full-width on phones (docs/adr/0010-editor-ui.md): the fixed 420px
                    // panel would overflow a ~360px viewport. Capped in
                    // height with an internal scroll so a landscape phone
                    // can still reach the Export button.
                    h.Class(
                      'fixed left-1/2 top-1/2 z-[60] w-[min(420px,calc(100vw-2rem))] max-h-[85dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-border bg-panel shadow-lg',
                    ),
                  ],
                  [
                    header(h, model, title),
                    h.div(
                      [h.Class('flex flex-col gap-4 px-4 py-4')],
                      [
                        formatSection(h, model.settings, (format) =>
                          toParent(Message.ChangedFormat({ format })),
                        ),
                        qualitySection(h, model.settings, (quality) =>
                          toParent(Message.ChangedQuality({ quality })),
                        ),
                        resolutionSection(h, model.settings, peekFrame(), (scale) =>
                          toParent(Message.ChangedScale({ scale })),
                        ),
                        statusSection(h, model),
                      ],
                    ),
                    footer(h, model, closeButton, toParent),
                  ],
                ),
              ]
            : [],
        ),
    },
  })

const header = <P>(h: HtmlBuilder<P>, model: Model, title: ReadonlyArray<ChildAttribute>) =>
  h.div(
    [h.Class('flex items-baseline justify-between border-b border-border px-4 py-3')],
    [
      h.h2([...title, h.Class('text-sm font-semibold tracking-[0.14em]')], ['EXPORT']),
      h.span([h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')], [filenameFor(model)]),
    ],
  )

const statusSection = <P>(h: HtmlBuilder<P>, model: Model) =>
  h.div(
    [h.Class('flex items-baseline justify-between border-t border-border pt-3')],
    [
      h.span([h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')], ['Size']),
      h.span([h.Class('tnum text-xs text-ink')], [statusText(model)]),
    ],
  )

const footer = <P>(
  h: HtmlBuilder<P>,
  model: Model,
  closeButton: ReadonlyArray<ChildAttribute>,
  toParent: (message: Message) => P,
) =>
  h.div(
    [h.Class('flex justify-end gap-2 border-t border-border px-4 py-3')],
    [
      h.button(
        [...closeButton, h.Class('px-3 py-1.5 text-xs text-muted hover:text-ink')],
        ['Cancel'],
      ),
      h.button(
        [
          h.OnClick(toParent(Message.EncodeRequested())),
          h.Disabled(!model.ready || model.encoding),
          h.Class('bg-accent px-4 py-1.5 text-xs text-ink hover:opacity-90 disabled:opacity-30'),
        ],
        [model.encoding ? 'Encoding…' : 'Export'],
      ),
    ],
  )

/** The size line: the snapshot/encode error's reason, "Encoding…" while an
 *  encode runs, the downloaded size after a download, else a placeholder —
 *  no size exists before the first export (encoding happens on Export press). */
const statusText = (model: Model) =>
  pipe(
    Option.fromNullishOr(model.error),
    Option.orElse(() => (model.encoding ? Option.some<string>('Encoding…') : Option.none())),
    Option.orElse(() =>
      model.downloaded && model.size !== null
        ? Option.some(`${fmtBytes(model.size)} · Downloaded`)
        : Option.none(),
    ),
    Option.getOrElse(() => '—'),
  )
