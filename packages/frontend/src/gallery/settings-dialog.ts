import type { HtmlBuilder } from 'foldkit/html'
import { Dialog, Switch } from '@foldkit/ui'
import type { Model } from './model'
import type { GalleryMessage } from './message'
import { GotSettingsDialogMessage, ToggledInfiniteCanvas } from './message'

/**
 * The gallery's settings dialog. One section for now — "Experimental" —
 * holding the infinite-canvas toggle (a Figma-style pan/zoom workspace
 * instead of the fixed photo canvas). The toggle is UI-only: it flips a
 * model flag nothing reads yet; wiring it into the editor comes later.
 *
 * Mirrors the export dialogs' structure (`editor/export-dialog.ts`): a
 * foldkit Dialog submodel rendered headless, with the backdrop and panel
 * positioned against the native `<dialog>` element.
 */
export const settingsDialogView = (h: HtmlBuilder<GalleryMessage>, model: Model) =>
  h.submodel({
    model: model.settingsDialog,
    slotId: model.settingsDialog.id,
    toParentMessage: (message) => GotSettingsDialogMessage({ message }),
    view: Dialog.view,
    viewInputs: {
      toView: ({ dialog, backdrop, panel, title, closeButton, isVisible }) =>
        h.dialog(
          [...dialog, h.Class('relative')],
          isVisible
            ? [
                // Same positioning scheme as the export dialog: the dialog is
                // `position: relative`; the backdrop and panel are positioned
                // against it.
                h.div([...backdrop, h.Class('fixed inset-0 z-[59] bg-black/60')], []),
                h.div(
                  [
                    ...panel,
                    // Full-width on phones, capped height with an internal
                    // scroll (docs/adr/0024-mobile-ui) — same as the export dialog.
                    h.Class(
                      'fixed left-1/2 top-1/2 z-[60] w-[min(420px,calc(100vw-2rem))] max-h-[85dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-border bg-panel shadow-lg',
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
                          ['SETTINGS'],
                        ),
                      ],
                    ),
                    h.div([h.Class('flex flex-col gap-5 px-4 py-4')], [
                      experimentalSection(h, model),
                    ]),
                    h.div(
                      [h.Class('flex justify-end gap-2 border-t border-border px-4 py-3')],
                      [
                        h.button(
                          [
                            ...closeButton,
                            h.Class('px-3 py-1.5 text-xs text-muted hover:text-ink'),
                          ],
                          ['Close'],
                        ),
                      ],
                    ),
                  ],
                ),
              ]
            : [],
        ),
    },
  })

const experimentalSection = (h: HtmlBuilder<GalleryMessage>, model: Model) =>
  h.section([h.Class('flex flex-col gap-3')], [
    h.h3([h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')], ['Experimental']),
    infiniteCanvasRow(h, model),
  ])

/** The infinite-canvas switch row: label + description on the left, the
 *  switch track on the right. Clicking the label toggles too (the Switch's
 *  label attributes), so the whole text block is a hit target. */
const infiniteCanvasRow = (h: HtmlBuilder<GalleryMessage>, model: Model) => {
  const enabled = model.experimental.infiniteCanvas
  return Switch.view(
    {
      id: 'setting-infinite-canvas',
      isChecked: enabled,
      onToggle: (isEnabled) => ToggledInfiniteCanvas({ isEnabled }),
      toView: ({ button, label, description }) =>
        h.div(
          [h.Class('flex items-center justify-between gap-6')],
          [
            h.div([h.Class('flex flex-col gap-1')], [
              h.span([...label, h.Class('text-xs text-ink')], ['Infinite canvas']),
              h.span(
                [...description, h.Class('max-w-[240px] text-[11px] leading-snug text-muted')],
                ['Pan and zoom a Figma-style infinite canvas instead of the fixed photo view. Useful if you want to edit multiple photos at once, move them freely as moodboard, etc.'],
              ),
            ]),
            // Hard-edged track and square thumb — the app uses no rounded
            // corners anywhere (styles.css); ON fills with the accent red,
            // matching the active fills elsewhere.
            h.div(
              [
                ...button,
                h.Class(
                  `relative inline-block h-5 w-9 shrink-0 cursor-pointer border transition-colors ${
                    enabled ? 'border-accent bg-accent' : 'border-border-strong bg-panel-alt'
                  }`,
                ),
              ],
              [
                h.span(
                  [
                    h.Class(
                      `absolute top-1/2 block h-3 w-3 -translate-y-1/2 transition-all ${
                        enabled ? 'left-5 bg-ink' : 'left-0.5 bg-muted'
                      }`,
                    ),
                  ],
                  [],
                ),
              ],
            ),
          ],
        ),
    },
    h,
  )
}
