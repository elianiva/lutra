import type { Html, HtmlBuilder } from 'foldkit/html'
import { Expand, Lock, Unlock } from '../components/icons'
import { EXPORT_FORMATS, RESIZE_METHODS } from '@lutra/engine'
import { icon } from '@/components/icon'
import { colorInput, field, group, label, numberInput, segmented } from '@/tools/controls'
import { rangeRow } from '@/tools/range-row'
import { cn } from '@/lib/utils'
import { FRAMES, borderWidth, fixedOutputSize } from './geometry'
import { Message } from './message'
import type { Model } from './model'
import { BORDER_RANGE, HEIGHT_RANGE, QUALITY_RANGE, WIDTH_RANGE, clampNumber } from './settings'
import type { Settings } from './settings'

const RESAMPLE_LABELS = {
  catrom: 'Catrom',
  lanczos3: 'Lanczos',
  mitchell: 'Mitchell',
  triangle: 'Tri',
} satisfies Record<Settings['method'], string>

const change = (settings: Settings, patch: Partial<Settings>) =>
  Message.ChangedSettings({ settings: { ...settings, ...patch } })

/** The output the current settings produce, for the aspect-ratio readout. */
const frameReadout = (settings: Settings): string => {
  const size = fixedOutputSize(settings)
  return size === null ? `${settings.width} px wide` : `${size.width} × ${size.height}`
}

/**
 * The output settings, shared by both modes. On a wide screen it is a floating
 * panel at the left edge; below `lg` it collapses behind its own header so the
 * results get the screen.
 */
export const settingsPanel = (h: HtmlBuilder<Message>, model: Model): Html => {
  const { settings } = model
  const single = model.tab === 'single'
  const border = borderWidth(settings.width, settings.borderPercent)
  return h.aside(
    [
      h.Class(
        'surface flex flex-none flex-col lg:w-[280px] lg:self-start lg:max-h-[calc(100dvh-96px)] lg:overflow-y-auto',
      ),
      h.AriaLabel('Settings'),
    ],
    [
      h.button(
        [
          h.Type('button'),
          h.Class('flex h-12 items-center justify-between px-4 lg:hidden'),
          h.AriaExpanded(model.settingsOpen),
          h.OnClick(Message.ToggledSettings()),
        ],
        [
          h.span([h.Class('micro font-semibold')], ['Settings']),
          h.span(
            [h.Class(cn('text-dim transition-transform', model.settingsOpen ? 'rotate-180' : ''))],
            [icon(h, Expand, 'Toggle settings', 16)],
          ),
        ],
      ),
      h.div(
        [
          h.Class(
            cn('enter-fade flex flex-col gap-6 p-4 max-lg:pt-0', model.settingsOpen ? '' : 'max-lg:hidden'),
          ),
        ],
        [
          group(h, 'Resize', [
            sizeFields(h, settings, single),
            single
              ? field(h, [
                  label(h, 'Resample'),
                  segmented(h, {
                    ariaLabel: 'Resample method',
                    options: RESIZE_METHODS.map((method) => ({
                      label: RESAMPLE_LABELS[method],
                      value: method,
                    })),
                    selected: settings.method,
                    onSelect: (method) => change(settings, { method }),
                  }),
                ])
              : null,
          ]),
          h.div([h.Class('seam')], []),
          group(h, 'Output', [
            field(h, [
              label(h, 'Format'),
              segmented(h, {
                ariaLabel: 'Format',
                options: EXPORT_FORMATS.map((format) => ({ label: format, value: format })),
                selected: settings.format,
                onSelect: (format) => change(settings, { format }),
              }),
            ]),
            settings.format === 'png'
              ? null
              : rangeRow(h, {
                  id: 'quality',
                  label: 'Quality',
                  display: String(settings.quality),
                  ...QUALITY_RANGE,
                  step: 1,
                  value: settings.quality,
                  onInput: (quality) => change(settings, { quality }),
                }),
          ]),
          h.div([h.Class('seam')], []),
          group(h, 'Frame', [
            single
              ? field(h, [
                  label(h, 'Aspect ratio', frameReadout(settings)),
                  segmented(h, {
                    ariaLabel: 'Aspect ratio',
                    columns: 4,
                    options: FRAMES.map((frame) => ({
                      label: frame === 'original' ? 'Orig' : frame,
                      value: frame,
                    })),
                    selected: settings.frame,
                    onSelect: (frame) => change(settings, { frame, height: null }),
                  }),
                ])
              : null,
            field(h, [
              label(h, 'Background'),
              colorInput(h, {
                id: 'background',
                label: 'Background colour',
                value: settings.background,
                onInput: (background) => change(settings, { background }),
              }),
            ]),
          ]),
          h.div([h.Class('seam')], []),
          group(h, 'Border', [
            rangeRow(h, {
              id: 'border',
              label: 'Width',
              display: border === 0 ? '0%' : `${settings.borderPercent}% · ${border} px`,
              ...BORDER_RANGE,
              value: settings.borderPercent,
              onInput: (borderPercent) => change(settings, { borderPercent }),
            }),
            field(h, [
              label(h, 'Colour'),
              colorInput(h, {
                id: 'border-color',
                label: 'Border colour',
                value: settings.borderColor,
                onInput: (borderColor) => change(settings, { borderColor }),
              }),
            ]),
          ]),
        ],
      ),
    ],
  )
}

/** Width, and in single mode a height beside it. The height follows the frame
 *  until the lock is opened; then it is set by hand and fixes the output. */
const sizeFields = (h: HtmlBuilder<Message>, settings: Settings, single: boolean): Html => {
  const locked = settings.height === null
  const fixed = fixedOutputSize(settings)
  const derived = fixed === null ? null : fixed.height
  const setWidth = (width: number) =>
    change(settings, {
      width: Math.round(clampNumber(width, WIDTH_RANGE.min, WIDTH_RANGE.max, settings.width)),
    })
  const widthInput = field(h, [
    h.label([h.For('width'), h.Class('label')], ['Width']),
    numberInput(h, {
      id: 'width',
      value: settings.width,
      ...WIDTH_RANGE,
      step: 10,
      onChange: setWidth,
    }),
  ])
  if (!single) return widthInput
  return h.div(
    [h.Class('flex items-end gap-1.5')],
    [
      h.div([h.Class('min-w-0 flex-1')], [widthInput]),
      h.button(
        [
          h.Type('button'),
          h.Class(
            cn(
              'grid h-9 w-9 flex-none place-items-center rounded-full transition-colors',
              locked ? 'text-muted hover:bg-s2 hover:text-ink' : 'bg-s2 text-accent',
            ),
          ),
          h.AriaLabel(locked ? 'Unlock height' : 'Lock height to the frame'),
          h.AriaPressed(String(locked)),
          h.Title(
            locked ? 'Height follows the frame. Click to set it.' : 'Lock height to the frame',
          ),
          h.OnClick(change(settings, { height: locked ? (derived ?? settings.width) : null })),
        ],
        [icon(h, locked ? Lock : Unlock, locked ? 'Locked' : 'Unlocked', 14)],
      ),
      h.div(
        [h.Class('min-w-0 flex-1')],
        [
          field(h, [
            h.label([h.For('height'), h.Class('label')], ['Height']),
            locked
              ? h.div(
                  [
                    h.Id('height'),
                    h.Class(
                      'well flex h-9 w-full items-center px-3 font-mono text-xs tnum text-dim',
                    ),
                  ],
                  [derived === null ? 'Auto' : String(derived)],
                )
              : numberInput(h, {
                  id: 'height',
                  value: settings.height ?? settings.width,
                  ...HEIGHT_RANGE,
                  step: 10,
                  onChange: (height) =>
                    change(settings, {
                      height: Math.round(
                        clampNumber(height, HEIGHT_RANGE.min, HEIGHT_RANGE.max, settings.width),
                      ),
                    }),
                }),
          ]),
        ],
      ),
    ],
  )
}
