import type { HtmlBuilder } from 'foldkit/html'
import * as Dialog from '@/components/ui/dialog'
import { switchControl } from '@/components/ui/switch'
import {
  lutraDialogFooterClass,
  lutraDialogSectionClass,
  lutraDialogTitleClass,
  lutraDialogViewInputs,
} from '@/components/lutra-dialog-shell'
import { button } from '@/components/ui/button'
import type { Model } from './model'
import { GalleryMessage } from './message'

export const settingsDialogView = (h: HtmlBuilder<GalleryMessage>, model: Model) =>
  h.submodel({
    model: model.settingsDialog,
    slotId: model.settingsDialog.id,
    toParentMessage: (message) => GalleryMessage.GotSettingsDialogMessage({ message }),
    view: Dialog.view,
    viewInputs: lutraDialogViewInputs(
      {
        content: ({ closeButton }, dialogH) => [
          Dialog.header(
            { className: 'border-b border-border px-4 py-3' },
            [
              Dialog.title(
                { attributes: [], className: lutraDialogTitleClass },
                ['SETTINGS'],
                dialogH,
              ),
            ],
            dialogH,
          ),
          dialogH.div(
            [dialogH.Class(lutraDialogSectionClass)],
            [experimentalSection(dialogH, model)],
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
                'Close',
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

const experimentalSection = (h: HtmlBuilder<GalleryMessage>, model: Model) =>
  h.section(
    [h.Class('flex flex-col gap-3')],
    [
      h.h3([h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')], ['Experimental']),
      switchControl(
        {
          id: 'setting-infinite-canvas',
          isChecked: model.experimental.infiniteCanvas,
          onToggle: (isEnabled) => GalleryMessage.ToggledInfiniteCanvas({ isEnabled }),
          label: 'Infinite canvas',
          description:
            'Pan and zoom a Figma-style infinite canvas instead of the fixed photo view. Useful if you want to edit multiple photos at once, move them freely as moodboard, etc.',
          wrapperClass: 'flex-row-reverse items-center justify-between gap-6',
          labelClass: 'text-xs text-ink',
          descriptionClass: 'max-w-[240px] text-[11px] leading-snug text-muted',
        },
        h,
      ),
    ],
  )
