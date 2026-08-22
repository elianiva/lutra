import { Option, pipe } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Dialog } from '@foldkit/ui'
import type { Model } from './model'
import type { EditorMessage } from './message'
import {
  ChangedExportFormat,
  ChangedExportQuality,
  ChangedExportScale,
  ExportDownloadRequested,
  GotExportDialogMessage,
} from './message'
import {
  fmtBytes,
  formatSection,
  qualitySection,
  resolutionSection,
} from '../export-dialog-sections'
import { peekEditorExportFrame } from './export-frame'

/**
 * The export dialog: format, quality (lossy formats only), resolution scale,
 * and the download button. Encoding runs only when Export is pressed (a
 * live size preview was too slow) — the button shows the loading state and
 * the file size appears after the download. The dialog stays open after a
 * download — tweak and re-export until it looks right. Settings persist
 * across sessions.
 *
 * The presentational settings sections are shared with the collage's export
 * dialog (docs/adr/0031); the editor supplies its own message constructors.
 */
export const exportDialogView = (h: HtmlBuilder<EditorMessage>, model: Model) =>
  h.submodel({
    model: model.exportDialog,
    slotId: model.exportDialog.id,
    toParentMessage: (message) => GotExportDialogMessage({ message }),
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
                    // Full-width on phones (docs/adr/0024-mobile-ui): the fixed 420px
                    // panel would overflow a ~360px viewport. Capped in
                    // height with an internal scroll so a landscape phone
                    // can still reach the Export button.
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
                          ['EXPORT'],
                        ),
                        h.span(
                          [h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')],
                          [`lutra-edit.${model.exportSettings.format}`],
                        ),
                      ],
                    ),
                    h.div(
                      [h.Class('flex flex-col gap-4 px-4 py-4')],
                      [
                        formatSection(h, model.exportSettings, (format) =>
                          ChangedExportFormat({ format }),
                        ),
                        qualitySection(h, model.exportSettings, (quality) =>
                          ChangedExportQuality({ quality }),
                        ),
                        resolutionSection(h, model.exportSettings, peekEditorExportFrame(), (scale) =>
                          ChangedExportScale({ scale }),
                        ),
                        statusSection(h, model),
                      ],
                    ),
                    h.div(
                      [h.Class('flex justify-end gap-2 border-t border-border px-4 py-3')],
                      [
                        h.button(
                          [
                            ...closeButton,
                            h.Class('px-3 py-1.5 text-xs text-muted hover:text-ink'),
                          ],
                          ['Cancel'],
                        ),
                        h.button(
                          [
                            h.OnClick(ExportDownloadRequested()),
                            h.Disabled(!model.exportReady || model.exportEncoding),
                            h.Class(
                              'bg-accent px-4 py-1.5 text-xs text-ink hover:opacity-90 disabled:opacity-30',
                            ),
                          ],
                          [model.exportEncoding ? 'Encoding…' : 'Export'],
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

const statusSection = (h: HtmlBuilder<EditorMessage>, model: Model) =>
  h.div(
    [h.Class('flex items-baseline justify-between border-t border-border pt-3')],
    [
      h.span([h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')], ['Size']),
      h.span([h.Class('tnum text-xs text-ink')], [exportStatusText(model)]),
    ],
  )

/** The size line: the encode error's reason, "Encoding…" while an encode
 *  runs, the downloaded size after a download, else a placeholder — no size
 *  exists before the first export (encoding happens on Export press). */
const exportStatusText = (model: Model) =>
  pipe(
    Option.fromNullishOr(model.exportError),
    Option.map((error) => error.message),
    Option.orElse(() => (model.exportEncoding ? Option.some('Encoding…') : Option.none())),
    Option.orElse(() =>
      model.exportDownloaded && model.exportSize !== null
        ? Option.some(`${fmtBytes(model.exportSize)} · Downloaded`)
        : Option.none(),
    ),
    Option.getOrElse(() => '—'),
  )
