import type { HtmlBuilder } from 'foldkit/html'
import { EXPORT_FORMATS, EXPORT_SCALES, isLossy } from '@lutra/engine'
import type { ExportSettings } from '@lutra/engine'

/**
 * The export dialog's presentational settings sections — format, quality
 * (lossy only), and resolution scale (docs/adr/0004-export). One convention for the
 * same choice across every owning screen: the shared machine's view renders
 * them, wiring the buttons to the screen-supplied message constructors.
 */

export const fmtBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const kb = bytes / 1024
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`
  }
  return `${(kb / 1024).toFixed(2)} MB`
}

/** A 4-up segmented grid of hard-edged buttons; the selected one is filled. */
export const segmentedRow = <M, T extends string | number>(
  h: HtmlBuilder<M>,
  options: readonly { label: string; value: T }[],
  selected: T,
  onSelect: (value: T) => M,
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

export const formatSection = <M>(
  h: HtmlBuilder<M>,
  settings: ExportSettings,
  onChangedFormat: (format: ExportSettings['format']) => M,
) =>
  h.div(
    [h.Class('flex flex-col gap-1.5')],
    [
      h.span([h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')], ['Format']),
      segmentedRow(
        h,
        EXPORT_FORMATS.map((f) => ({ label: f.toUpperCase(), value: f })),
        settings.format,
        (value) => onChangedFormat(value),
      ),
    ],
  )

export const qualitySection = <M>(
  h: HtmlBuilder<M>,
  settings: ExportSettings,
  onChangedQuality: (quality: number) => M,
) => {
  const { format, quality } = settings
  return isLossy(format)
    ? h.div(
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
            h.OnInput((raw) => onChangedQuality(Number(raw))),
          ]),
        ],
      )
    : null
}

/** Resolution presets against a composed frame of `frameWidth × frameHeight` px. */
export const resolutionSection = <M>(
  h: HtmlBuilder<M>,
  settings: ExportSettings,
  frame: { readonly width: number; readonly height: number } | null,
  onChangedScale: (scale: ExportSettings['scale']) => M,
) => {
  const dims = frame ? `${frame.width} × ${frame.height}` : '—'
  const scaled = frame
    ? `${Math.round(frame.width * settings.scale)} × ${Math.round(frame.height * settings.scale)}`
    : '—'
  return h.div(
    [h.Class('flex flex-col gap-1.5')],
    [
      h.span([h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')], ['Resolution']),
      segmentedRow(
        h,
        EXPORT_SCALES.map((s) => ({ label: `${Math.round(s * 100)}%`, value: s })),
        settings.scale,
        (value) => onChangedScale(value),
      ),
      h.span(
        [h.Class('tnum text-xs text-muted')],
        [settings.scale === 1 ? dims : `${dims} → ${scaled}`],
      ),
    ],
  )
}
