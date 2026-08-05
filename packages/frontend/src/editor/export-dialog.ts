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
import { EXPORT_FORMATS, EXPORT_SCALES, fileExtension, isLossy, type ExportFormat, type ExportScale } from '@lutra/engine'

const fmtBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

/** A 4-up segmented grid of hard-edged buttons; the selected one is filled. */
const segmentedRow = (
  h: HtmlBuilder<EditorMessage>,
  options: readonly { label: string; value: string }[],
  selected: string,
  onSelect: (value: string) => EditorMessage,
) =>
  h.div(
    [h.Class('grid grid-cols-4 border border-border')],
    options.map(({ label, value }) =>
      h.button(
        [
          h.OnClick(onSelect(value)),
          // Segmented rows read as toggle buttons; expose the pressed state.
          h.AriaPressed(String(value === selected)),
          // Foldkit's builder overwrites on repeated Class attributes (last
          // one wins) — keep the whole class list in a single call.
          h.Class(
            `border-r border-border px-1 py-1.5 text-xs last:border-r-0 ${
              value === selected
                ? 'bg-accent text-ink'
                : 'bg-panel text-muted hover:bg-panel-alt hover:text-ink'
            }`,
          ),
        ],
        [label],
      ),
    ),
  )

/**
 * The export dialog: format, quality (lossy formats only), resolution scale,
 * and the download button. Encoding runs only when Export is pressed (a
 * live size preview was too slow) — the button shows the loading state and
 * the file size appears after the download. The dialog stays open after a
 * download — tweak and re-export until it looks right. Settings persist
 * across sessions.
 */
export const exportDialogView = (h: HtmlBuilder<EditorMessage>, model: Model) =>
  h.submodel({
    slotId: model.exportDialog.id,
    model: model.exportDialog,
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
                    h.Class(
                      'fixed left-1/2 top-1/2 z-[60] w-[420px] -translate-x-1/2 -translate-y-1/2 border border-border bg-panel shadow-lg',
                    ),
                  ],
                  [
                    h.div(
                      [h.Class('flex items-baseline justify-between border-b border-border px-4 py-3')],
                      [
                        h.h2([...title, h.Class('text-sm font-semibold tracking-[0.14em]')], ['EXPORT']),
                        h.span([h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')], [
                          `lutra-edit.${fileExtension(model.exportSettings.format)}`,
                        ]),
                      ],
                    ),
                    h.div([h.Class('flex flex-col gap-4 px-4 py-4')], [
                      formatSection(h, model),
                      qualitySection(h, model),
                      resolutionSection(h, model),
                      statusSection(h, model),
                    ]),
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
                            h.Disabled(!model.exportImage || model.exportEncoding),
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
    toParentMessage: (message) => GotExportDialogMessage({ message }),
  })

const formatSection = (h: HtmlBuilder<EditorMessage>, model: Model) =>
  h.div(
    [h.Class('flex flex-col gap-1.5')],
    [
      h.span([h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')], ['Format']),
      segmentedRow(
        h,
        EXPORT_FORMATS.map((f) => ({ label: f.toUpperCase(), value: f })),
        model.exportSettings.format,
        // The segmented row is string-typed; the settings schema narrows.
        // oxlint-disable-next-line consistent-type-assertions
        (value) => ChangedExportFormat({ format: value as ExportFormat }),
      ),
    ],
  )

const qualitySection = (h: HtmlBuilder<EditorMessage>, model: Model) => {
  const { format, quality } = model.exportSettings
  if (!isLossy(format)) return h.div([], [])
  return h.div(
    [h.Class('flex flex-col gap-1.5')],
    [
      h.div(
        [h.Class('flex items-baseline justify-between')],
        [
          h.span([h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')], ['Quality']),
          h.span([h.Class('tnum text-xs text-ink')], [String(quality ?? 75)]),
        ],
      ),
      h.input([
        h.Type('range'),
        h.Class('lutra-range'),
        h.Min('0'),
        h.Max('100'),
        h.Step('1'),
        h.Value(String(quality ?? 75)),
        h.OnInput((raw) => ChangedExportQuality({ quality: Number(raw) })),
      ]),
    ],
  )
}

const resolutionSection = (h: HtmlBuilder<EditorMessage>, model: Model) => {
  const { exportImage, exportSettings } = model
  const dims = exportImage
    ? `${exportImage.width} × ${exportImage.height}`
    : '—'
  const scaled = exportImage
    ? `${Math.round(exportImage.width * exportSettings.scale)} × ${Math.round(exportImage.height * exportSettings.scale)}`
    : '—'
  return h.div(
    [h.Class('flex flex-col gap-1.5')],
    [
      h.span([h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')], ['Resolution']),
      segmentedRow(
        h,
        EXPORT_SCALES.map((s) => ({ label: `${Math.round(s * 100)}%`, value: String(s) })),
        String(exportSettings.scale),
        // The segmented row is string-typed; the settings schema narrows.
        // oxlint-disable-next-line consistent-type-assertions
        (value) => ChangedExportScale({ scale: Number(value) as ExportScale }),
      ),
      h.span([h.Class('tnum text-xs text-muted')], [
        exportSettings.scale === 1 ? dims : `${dims} → ${scaled}`,
      ]),
    ],
  )
}

const statusSection = (h: HtmlBuilder<EditorMessage>, model: Model) => {
  let content: string
  if (model.exportError) {
    content = model.exportError.message
  } else if (model.exportEncoding) {
    content = 'Encoding…'
  } else if (model.exportDownloaded && model.exportSize !== null) {
    content = `${fmtBytes(model.exportSize)} · Downloaded`
  } else {
    // No size before the first export — encoding happens on Export press.
    content = '—'
  }
  return h.div(
    [h.Class('flex items-baseline justify-between border-t border-border pt-3')],
    [
      h.span([h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')], ['Size']),
      h.span([h.Class('tnum text-xs text-ink')], [content]),
    ],
  )
}
