import type { HtmlBuilder } from 'foldkit/html'

/** One stroked path; `transform` is only for the rotated spanner. */
export type IconNode = ReadonlyArray<Readonly<{ d: string; transform?: string }>>

/**
 * Draws a Lutra icon (see `icons.ts`): outline only, one stroke width, flat
 * ends and sharp joins, in the current text colour.
 */
export const icon = <Message>(
  h: HtmlBuilder<Message>,
  node: IconNode,
  label: string,
  size: number = 16,
) =>
  h.svg(
    [
      h.Attribute('aria-hidden', 'true'),
      h.Attribute('viewBox', '0 0 24 24'),
      h.Attribute('width', String(size)),
      h.Attribute('height', String(size)),
      h.Attribute('fill', 'none'),
      h.Attribute('stroke', 'currentColor'),
      h.Attribute('stroke-width', '2'),
      h.Attribute('stroke-linecap', 'butt'),
      h.Attribute('stroke-linejoin', 'miter'),
      h.Attribute('stroke-miterlimit', '2'),
      h.AriaLabel(label),
      h.Class('shrink-0'),
    ],
    node.map(({ d, transform }) =>
      h.path(
        [
          h.Attribute('d', d),
          ...(transform === undefined ? [] : [h.Attribute('transform', transform)]),
        ],
        [],
      ),
    ),
  )
