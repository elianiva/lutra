import type { HtmlBuilder } from 'foldkit/html'
import * as AlertDialog from '@/components/ui/alert-dialog'
import {
  lutraDialogFooterClass,
  lutraDialogTitleClass,
  lutraNarrowPanelClass,
} from '@/components/lutra-dialog-shell'
import type { Model } from './model'
import { GalleryMessage } from './message'

export const deleteDialogView = (h: HtmlBuilder<GalleryMessage>, model: Model) =>
  h.submodel({
    model: model.deleteDialog,
    slotId: model.deleteDialog.id,
    toParentMessage: (message) => GalleryMessage.GotDeleteDialogMessage({ message }),
    view: AlertDialog.view,
    viewInputs: AlertDialog.styledViewInputs(
        {
          panelClass: lutraNarrowPanelClass,
          content: ({ title, description, closeButton }, dialogH) => [
            AlertDialog.header(
              { className: 'border-b border-border px-4 py-3 text-left' },
              [
                AlertDialog.title(
                  { attributes: title, className: lutraDialogTitleClass },
                  ['DELETE PHOTO'],
                  dialogH,
                ),
              ],
              dialogH,
            ),
            dialogH.div(
              [dialogH.Class('px-4 py-4')],
              [
                AlertDialog.description(
                  {
                    attributes: description,
                    className: 'text-xs leading-snug text-muted',
                  },
                  ['This photo will be permanently deleted. This cannot be undone.'],
                  dialogH,
                ),
              ],
            ),
            AlertDialog.footer(
              { className: lutraDialogFooterClass },
              [
                AlertDialog.cancelButton(
                  {
                    attributes: [
                      ...closeButton,
                      dialogH.DataAttribute('cancel-delete', 'true'),
                    ],
                    className: 'text-xs text-muted hover:text-ink',
                  },
                  ['Cancel'],
                  dialogH,
                ),
                ...(model.pendingDelete === null
                  ? []
                  : [
                      AlertDialog.actionButton(
                        {
                          attributes: [
                            dialogH.OnClick(
                              GalleryMessage.DeleteRequested({ id: model.pendingDelete }),
                            ),
                            dialogH.AriaLabel('Confirm deleting this photo'),
                            dialogH.DataAttribute('confirm-delete', 'true'),
                          ],
                          className: 'bg-accent text-xs text-ink hover:opacity-90',
                        },
                        ['Delete'],
                        dialogH,
                      ),
                    ]),
              ],
              dialogH,
            ),
          ],
        },
        h,
    ),
  })
