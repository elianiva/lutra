import type { HtmlBuilder } from 'foldkit/html'
import { EXPORT_FORMATS, EXPORT_SCALES, isLossy } from '@lutra/engine'
import type { ExportSettings } from '@lutra/engine'
import { lutraRangeRow } from '@/components/lutra-range-row'
import { button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
      button(
        {
          onClick: onSelect(value),
          size: 'xs',
          variant: value === selected ? 'default' : 'ghost',
          className: cn(
            'border-r border-border px-1 py-1.5 last:border-r-0',
            value === selected
              ? 'bg-accent text-ink'
              : 'bg-panel text-muted hover:bg-panel-alt hover:text-ink',
          ),
          attributes: [h.AriaPressed(String(value === selected))],
        },
        label,
        h,
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
          lutraRangeRow(h, {
            label: 'Quality',
            display: String(quality ?? 75),
            min: 0,
            max: 100,
            step: 1,
            value: quality ?? 75,
            onInput: onChangedQuality,
          }),
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
