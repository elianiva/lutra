import { Option, pipe } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Dialog from '@/components/ui/dialog'
import {
  lutraDialogFooterClass,
  lutraDialogSectionClass,
  lutraDialogTitleClass,
  lutraDialogViewInputs,
} from '@/components/lutra-dialog-shell'
import { button } from '@/components/ui/button'
import { ExportDialogMessage as Message } from './message'
import { filenameFor } from './update'
import type { Model } from './model'
import { fmtBytes, formatSection, qualitySection, resolutionSection } from './sections'
import { peekFrame } from './frame'

/**
 * The shared export dialog view (docs/adr/0004-export): the format / quality /
 * resolution sections with the status line and `<stem>.<format>` filename.
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
    viewInputs: lutraDialogViewInputs(
      {
        panelClass:
          'fixed left-1/2 top-1/2 z-[60] w-[min(420px,calc(100vw-2rem))] max-h-[85dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-border bg-panel shadow-lg rounded-none',
        content: ({ title, closeButton }, dialogH) => [
          Dialog.header(
            {
              className: 'flex items-baseline justify-between border-b border-border px-4 py-3',
            },
            [
              Dialog.title(
                { attributes: title, className: lutraDialogTitleClass },
                ['EXPORT'],
                dialogH,
              ),
              dialogH.span(
                [dialogH.Class('text-[10px] uppercase tracking-[0.14em] text-muted')],
                [filenameFor(model)],
              ),
            ],
            dialogH,
          ),
          dialogH.div(
            [dialogH.Class(lutraDialogSectionClass)],
            [
              formatSection(dialogH, model.settings, (format) =>
                toParent(Message.ChangedFormat({ format })),
              ),
              qualitySection(dialogH, model.settings, (quality) =>
                toParent(Message.ChangedQuality({ quality })),
              ),
              resolutionSection(dialogH, model.settings, peekFrame(), (scale) =>
                toParent(Message.ChangedScale({ scale })),
              ),
              statusSection(dialogH, model),
            ],
          ),
          Dialog.footer(
            { className: lutraDialogFooterClass },
            [
              button(
                {
                  attributes: [...closeButton],
                  variant: 'ghost',
                  size: 'xs',
                  className: 'text-muted hover:text-ink',
                },
                'Cancel',
                dialogH,
              ),
              button(
                {
                  onClick: toParent(Message.EncodeRequested()),
                  isDisabled: !model.ready || model.encoding,
                  size: 'xs',
                  className: 'px-4 disabled:opacity-30',
                },
                model.encoding ? 'Encoding…' : 'Export',
                dialogH,
              ),
            ],
            dialogH,
          ),
        ],
      },
      h,
    ),
  })

export const exportBarView = <P>(
  h: HtmlBuilder<P>,
  model: Model,
  toParent: (message: Message) => P,
) =>
  h.div(
    [
      h.Class('flex flex-col gap-3 border border-border bg-panel px-3 py-3'),
      h.DataAttribute('export-bar', 'true'),
    ],
    [
      h.div(
        [h.Class('flex items-baseline justify-between')],
        [
          h.span([h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')], ['Inline']),
          h.span([h.Class('text-[10px] tnum text-muted')], [filenameFor(model)]),
        ],
      ),
      formatSection(h, model.settings, (format) => toParent(Message.ChangedFormat({ format }))),
      qualitySection(h, model.settings, (quality) => toParent(Message.ChangedQuality({ quality }))),
      resolutionSection(h, model.settings, peekFrame(), (scale) =>
        toParent(Message.ChangedScale({ scale })),
      ),
      h.div(
        [h.Class('flex items-baseline justify-between border-t border-border pt-2')],
        [
          h.span([h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')], ['Size']),
          h.span(
            [h.Class('tnum text-xs text-ink'), h.DataAttribute('export-size', 'true')],
            [statusText(model)],
          ),
        ],
      ),
      h.div(
        [h.Class('flex justify-end')],
        [
          button(
            {
              onClick: toParent(Message.EncodeRequested()),
              isDisabled: !model.ready || model.encoding,
              size: 'xs',
              className: 'px-4 disabled:opacity-30',
              attributes: [h.DataAttribute('export-encode', 'true')],
            },
            model.encoding ? 'Encoding…' : model.downloaded ? 'Download again' : 'Download',
            h,
          ),
        ],
      ),
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
