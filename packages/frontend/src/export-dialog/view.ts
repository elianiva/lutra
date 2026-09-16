import { Option, pipe } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
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
import {
  encoderOptionsSection,
  fmtBytes,
  formatSection,
  qualitySection,
  sizeSection,
} from './sections'
import { peekFrame } from './frame'

const settingsSections = <P>(
  h: HtmlBuilder<P>,
  model: Model,
  toParent: (message: Message) => P,
): Html[] => [
  formatSection(h, model.settings, (format) => toParent(Message.ChangedFormat({ format }))),
  qualitySection(h, model.settings, (quality) => toParent(Message.ChangedQuality({ quality }))),
  sizeSection(
    h,
    model.settings,
    peekFrame(),
    (scale) => toParent(Message.ChangedScale({ scale })),
    (method) => toParent(Message.ChangedResizeMethod({ method })),
  ),
  advancedSection(h, model, toParent),
]

const advancedSection = <P>(
  h: HtmlBuilder<P>,
  model: Model,
  toParent: (message: Message) => P,
): Html =>
  h.div(
    [h.Class('flex flex-col gap-2')],
    [
      button(
        {
          onClick: toParent(Message.ToggledAdvanced()),
          variant: 'ghost',
          size: 'xs',
          className:
            'flex items-center justify-between px-0 text-[10px] uppercase tracking-[0.14em] text-muted hover:text-ink',
          attributes: [h.AriaExpanded(model.advanced), h.DataAttribute('export-advanced', 'true')],
        },
        [`Codec options ${model.advanced ? '−' : '+'}`],
        h,
      ),
      model.advanced
        ? encoderOptionsSection(h, model.settings, {
            onChangedAvif: (options) => toParent(Message.ChangedAvifOptions({ options })),
            onChangedJpeg: (options) => toParent(Message.ChangedJpegOptions({ options })),
            onChangedWebp: (options) => toParent(Message.ChangedWebpOptions({ options })),
          })
        : null,
    ],
  )

/**
 * The shared export dialog view (docs/adr/0004-export): the format / quality /
 * size / codec-options sections with the status line and `<stem>.<format>`
 * filename.
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
            [...settingsSections(dialogH, model, toParent), statusSection(dialogH, model)],
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

/**
 * The owner's always-visible export panel. `frame` is the owner's composed
 * frame size — the inline bar is usable before any snapshot lands, so it
 * cannot read the pixel slot the way the modal does.
 */
export const exportBarView = <P>(
  h: HtmlBuilder<P>,
  model: Model,
  frame: { readonly width: number; readonly height: number },
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
      sizeSection(
        h,
        model.settings,
        frame,
        (scale) => toParent(Message.ChangedScale({ scale })),
        (method) => toParent(Message.ChangedResizeMethod({ method })),
      ),
      advancedSection(h, model, toParent),
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
