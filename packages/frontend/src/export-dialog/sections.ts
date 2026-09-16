import type { Html, HtmlBuilder } from 'foldkit/html'
import {
  EXPORT_FORMATS,
  EXPORT_SCALE_PRESETS,
  MIN_EXPORT_SCALE,
  RESIZE_METHODS,
  isLossy,
} from '@lutra/engine'
import type {
  AvifOptions,
  ExportSettings,
  JpegOptions,
  ResizeMethod,
  WebpOptions,
} from '@lutra/engine'
import { lutraRangeRow } from '@/components/lutra-range-row'
import { button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The export dialog's presentational settings sections — format, quality
 * (lossy only), output size (presets, exact pixels, resampler), and the
 * per-format codec options (docs/adr/0004-export). One convention for the same
 * choice across every owning screen: the shared machine's view renders them,
 * wiring the buttons to the screen-supplied message constructors.
 *
 * The size controls all write the one persisted `scale`: an exact width or
 * height divides by the frame's matching dimension, and uniform scaling is
 * the only mode, so the output always keeps the frame's aspect.
 */

const clampScale = (scale: number) => Math.min(1, Math.max(MIN_EXPORT_SCALE, scale))

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

const sectionLabel = <M>(h: HtmlBuilder<M>, text: string) =>
  h.span([h.Class('text-[10px] uppercase tracking-[0.14em] text-muted')], [text])

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

/** An Off/On segmented row for a boolean option. */
const toggleRow = <M>(
  h: HtmlBuilder<M>,
  label: string,
  value: boolean,
  onChange: (value: boolean) => M,
) =>
  h.div(
    [h.Class('grid grid-cols-[1fr_auto] items-center gap-2')],
    [
      sectionLabel(h, label),
      h.div(
        [h.Class('grid grid-cols-2 border border-border')],
        [false, true].map((option) =>
          button(
            {
              onClick: onChange(option),
              size: 'xs',
              variant: option === value ? 'default' : 'ghost',
              className: cn(
                'px-2 py-1 text-[10px] uppercase tracking-[0.1em]',
                option ? 'border-l border-border' : '',
                option === value ? 'bg-accent text-ink' : 'text-muted hover:text-ink',
              ),
              attributes: [
                h.AriaLabel(`${label}: ${option ? 'on' : 'off'}`),
                h.AriaPressed(String(option === value)),
              ],
            },
            option ? 'On' : 'Off',
            h,
          ),
        ),
      ),
    ],
  )

export const formatSection = <M>(
  h: HtmlBuilder<M>,
  settings: ExportSettings,
  onChangedFormat: (format: ExportSettings['format']) => M,
) =>
  h.div(
    [h.Class('flex flex-col gap-1.5')],
    [
      sectionLabel(h, 'Format'),
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
) =>
  isLossy(settings)
    ? h.div(
        [h.Class('flex flex-col gap-1.5')],
        [
          lutraRangeRow(h, {
            label: 'Quality',
            display: String(settings.quality ?? 75),
            min: 0,
            max: 100,
            step: 1,
            value: settings.quality ?? 75,
            onInput: onChangedQuality,
          }),
        ],
      )
    : null

const sizeInput = <M>(
  h: HtmlBuilder<M>,
  config: Readonly<{
    ariaLabel: string
    testId: string
    value: number
    onChange: (value: number) => M
  }>,
) =>
  h.input([
    h.Type('number'),
    h.Min('1'),
    h.Step('1'),
    h.AriaLabel(config.ariaLabel),
    h.DataAttribute(config.testId, 'true'),
    h.Class(
      'w-16 rounded border border-border bg-transparent px-1 py-0.5 text-center text-xs tnum text-ink',
    ),
    h.Value(String(config.value)),
    h.OnChange((raw) => {
      const parsed = Number(raw)
      return config.onChange(Number.isFinite(parsed) && parsed > 0 ? parsed : config.value)
    }),
  ])

/**
 * Output size. The percentage presets are shortcuts; the width/height fields
 * set the exact output pixels against the frame, both driving the one
 * persisted scale. `frame` is null before a snapshot lands, which disables
 * the fields (there is nothing to be a percentage of yet).
 */
export const sizeSection = <M>(
  h: HtmlBuilder<M>,
  settings: ExportSettings,
  frame: { readonly width: number; readonly height: number } | null,
  onChangedScale: (scale: number) => M,
  onChangedResizeMethod: (method: ResizeMethod) => M,
) => {
  const scale = clampScale(settings.scale)
  const outWidth = frame ? Math.max(1, Math.round(frame.width * scale)) : null
  const outHeight = frame ? Math.max(1, Math.round(frame.height * scale)) : null
  return h.div(
    [h.Class('flex flex-col gap-1.5'), h.DataAttribute('control', 'size')],
    [
      sectionLabel(h, 'Output'),
      segmentedRow(
        h,
        EXPORT_SCALE_PRESETS.map((s) => ({ label: `${Math.round(s * 100)}%`, value: s })),
        roundPreset(scale),
        (value) => onChangedScale(value),
      ),
      frame === null || outWidth === null || outHeight === null
        ? h.span([h.Class('text-xs text-muted')], ['—'])
        : h.div(
            [h.Class('flex items-center gap-1.5 text-xs text-muted')],
            [
              sizeInput(h, {
                ariaLabel: 'Output width in pixels',
                onChange: (width) => onChangedScale(clampScale(width / frame.width)),
                testId: 'export-width',
                value: outWidth,
              }),
              h.span([], ['×']),
              sizeInput(h, {
                ariaLabel: 'Output height in pixels',
                onChange: (height) => onChangedScale(clampScale(height / frame.height)),
                testId: 'export-height',
                value: outHeight,
              }),
              h.span([h.Class('text-[10px] uppercase tracking-[0.14em]')], ['px']),
              h.span([h.Class('tnum text-[10px]')], [`of ${frame.width} × ${frame.height}`]),
            ],
          ),
      h.div(
        [h.Class('flex flex-col gap-1.5')],
        [
          sectionLabel(h, 'Resample'),
          segmentedRow(
            h,
            RESIZE_METHODS.map((method) => ({ label: RESAMPLE_LABELS[method], value: method })),
            settings.resizeMethod,
            (value) => onChangedResizeMethod(value),
          ),
        ],
      ),
    ],
  )
}

const RESAMPLE_LABELS = {
  catrom: 'CATROM',
  lanczos3: 'LANCZOS',
  mitchell: 'MITCHELL',
  triangle: 'TRI',
} satisfies Record<ResizeMethod, string>

/** Which preset a scale sits on, for the segmented highlight; arbitrary scales highlight none. */
const roundPreset = (scale: number): number =>
  EXPORT_SCALE_PRESETS.find((preset) => Math.abs(preset - scale) < 1e-6) ?? -1

export interface EncoderHandlers<M> {
  readonly onChangedJpeg: (options: JpegOptions) => M
  readonly onChangedWebp: (options: WebpOptions) => M
  readonly onChangedAvif: (options: AvifOptions) => M
}

/** The squoosh codec options for the active format (docs/adr/0004-export). */
export const encoderOptionsSection = <M>(
  h: HtmlBuilder<M>,
  settings: ExportSettings,
  handlers: EncoderHandlers<M>,
): Html => {
  const { format, options } = settings
  switch (format) {
    case 'png':
      return h.p([h.Class('text-xs text-muted')], ['PNG is lossless — the codec has no options.'])
    case 'jpeg':
      return h.div(
        [h.Class('flex flex-col gap-2')],
        [
          toggleRow(h, 'Progressive', options.jpeg.progressive, (progressive) =>
            handlers.onChangedJpeg({ ...options.jpeg, progressive }),
          ),
          toggleRow(h, 'Optimize coding', options.jpeg.optimizeCoding, (optimizeCoding) =>
            handlers.onChangedJpeg({ ...options.jpeg, optimizeCoding }),
          ),
          lutraRangeRow(h, {
            label: 'Smoothing',
            display: String(options.jpeg.smoothing),
            max: 100,
            min: 0,
            onInput: (smoothing) => handlers.onChangedJpeg({ ...options.jpeg, smoothing }),
            step: 1,
            value: options.jpeg.smoothing,
          }),
        ],
      )
    case 'webp':
      return h.div(
        [h.Class('flex flex-col gap-2')],
        [
          toggleRow(h, 'Lossless', options.webp.lossless, (lossless) =>
            handlers.onChangedWebp({ ...options.webp, lossless }),
          ),
          lutraRangeRow(h, {
            label: 'Effort',
            display: String(options.webp.effort),
            max: 6,
            min: 0,
            onInput: (effort) => handlers.onChangedWebp({ ...options.webp, effort }),
            step: 1,
            value: options.webp.effort,
          }),
        ],
      )
    case 'avif':
      return h.div(
        [h.Class('flex flex-col gap-2')],
        [
          toggleRow(h, 'Lossless', options.avif.lossless, (lossless) =>
            handlers.onChangedAvif({ ...options.avif, lossless }),
          ),
          lutraRangeRow(h, {
            label: 'Speed',
            display: String(options.avif.speed),
            max: 10,
            min: 0,
            onInput: (speed) => handlers.onChangedAvif({ ...options.avif, speed }),
            step: 1,
            value: options.avif.speed,
          }),
        ],
      )
  }
}
