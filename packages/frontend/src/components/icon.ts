import type { IconNode } from 'lucide'
import type { HtmlBuilder } from 'foldkit/html'
import { Match } from 'effect'

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
      return Match.value(tag).pipe(
        Match.when('circle', () => h.circle(attributes, [])),
        Match.when('line', () => h.line(attributes, [])),
        Match.when('path', () => h.path(attributes, [])),
        Match.when('polyline', () => h.polyline(attributes, [])),
        Match.when('rect', () => h.rect(attributes, [])),
        Match.orElse(() => null),
      )
    }),
  )
