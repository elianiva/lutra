import type { IconNode } from 'lucide'
import type { HtmlBuilder } from 'foldkit/html'

/**
 * Render a lucide `IconNode` (the framework-agnostic array of `[tag, attrs]`
 * tuples) into the foldkit `Html` builder. Mirrors the Dearly helper so the
 * tool panel, layer rows, and top bar share one icon implementation.
 *
 * @param size - Icon width/height in px. Defaults to 16 for a compact look.
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
      h.Attribute('stroke-linecap', 'round'),
      h.Attribute('stroke-linejoin', 'round'),
      h.AriaLabel(label),
      h.Class('shrink-0'),
    ],
    node.map(([tag, properties]) => {
      const attributes = Object.entries(properties).map(([name, value]) =>
        h.Attribute(name, String(value)),
      )
      switch (tag) {
        case 'circle':
          return h.circle(attributes, [])
        case 'line':
          return h.line(attributes, [])
        case 'path':
          return h.path(attributes, [])
        case 'polyline':
          return h.polyline(attributes, [])
        case 'rect':
          return h.rect(attributes, [])
        default:
          return null
      }
    }),
  )
