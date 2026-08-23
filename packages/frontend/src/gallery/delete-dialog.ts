import type { HtmlBuilder } from 'foldkit/html'
import { Dialog } from '@foldkit/ui'
import type { Model } from './model'
import { GalleryMessage } from './message'

/**
 * The image-deletion confirmation dialog (ADR-0022, superseded to a modal
 * dialog). Opened by a tile's ✕; confirming fires `DeleteRequested` — the
 * same message the unguarded flow used, so the store semantics are
 * unchanged. Dismissal paths (Cancel, Esc, backdrop) ride the Dialog
 * submodel's own close wiring; update clears `pendingDelete` on each.
 *
 * Mirrors the settings dialog's structure: a foldkit Dialog submodel
 * rendered headless, with the backdrop and panel positioned against the
 * native `<dialog>` element.
 */
export const deleteDialogView = (h: HtmlBuilder<GalleryMessage>, model: Model) =>
  h.submodel({
    model: model.deleteDialog,
    slotId: model.deleteDialog.id,
    toParentMessage: (message) => GalleryMessage.GotDeleteDialogMessage({ message }),
    view: Dialog.view,
    viewInputs: {
      toView: ({ dialog, backdrop, panel, title, description, closeButton, isVisible }) =>
        h.dialog(
          [...dialog, h.Class('relative')],
          isVisible
            ? [
                // Same positioning scheme as the settings and export
                // dialogs: the dialog is `position: relative`; the backdrop
                // and panel are positioned against it.
                h.div([...backdrop, h.Class('fixed inset-0 z-[59] bg-black/60')], []),
                h.div(
                  [
                    ...panel,
                    // Narrower than the settings/export panels — a confirm
                    // prompt needs only its question and two buttons.
                    h.Class(
                      'fixed left-1/2 top-1/2 z-[60] w-[min(320px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 border border-border bg-panel shadow-lg',
                    ),
                  ],
                  [
                    h.div(
                      [
                        h.Class(
                          'flex items-baseline justify-between border-b border-border px-4 py-3',
                        ),
                      ],
                      [
                        h.h2(
                          [...title, h.Class('text-sm font-semibold tracking-[0.14em]')],
                          ['DELETE PHOTO'],
                        ),
                      ],
                    ),
                    h.div(
                      [h.Class('px-4 py-4')],
                      [
                        h.p(
                          [...description, h.Class('text-xs leading-snug text-muted')],
                          ['This photo will be permanently deleted. This cannot be undone.'],
                        ),
                      ],
                    ),
                    h.div(
                      [h.Class('flex justify-end gap-2 border-t border-border px-4 py-3')],
                      [
                        h.button(
                          [
                            ...closeButton,
                            h.DataAttribute('cancel-delete', 'true'),
                            h.Class('px-3 py-1.5 text-xs text-muted hover:text-ink'),
                          ],
                          ['Cancel'],
                        ),
                        ...(model.pendingDelete === null
                          ? []
                          : [
                              h.button(
                                [
                                  h.OnClick(
                                    GalleryMessage.DeleteRequested({ id: model.pendingDelete }),
                                  ),
                                  h.AriaLabel('Confirm deleting this photo'),
                                  h.DataAttribute('confirm-delete', 'true'),
                                  h.Class(
                                    'bg-accent px-4 py-1.5 text-xs text-ink hover:opacity-90',
                                  ),
                                ],
                                ['Delete'],
                              ),
                            ]),
                      ],
                    ),
                  ],
                ),
              ]
            : [],
        ),
    },
  })
