import type { Html, HtmlBuilder } from 'foldkit/html'

/**
 * The LUTRA wordmark (docs/brand): Michroma capitals outlined to paths, the L
 * carrying four film perforations and the A drawn as an open Λ whose missing
 * crossbar is a single sprocket hole. The letters take the current text colour;
 * the sprocket is the signal red, the wordmark's one accent. Outlined so the
 * header needs no webfont.
 */
const INK =
  'M104.17 100L12.5 100L12.5 0L25 0L25 89.58L104.17 89.58L104.17 100M201.13 102.08L177.56 102.08Q162.91 102.08 153.47 100.1Q144.03 98.11 138.73 92.77Q133.42 87.43 131.3 77.41Q129.19 67.38 129.19 51.3L129.19 51.3L129.19 0L141.69 0L141.69 51.3Q141.69 62.37 142.47 69.66Q143.25 76.95 145.4 81.32Q147.55 85.68 151.55 87.83Q155.55 89.97 161.93 90.63Q168.32 91.28 177.56 91.28L177.56 91.28L201.13 91.28Q210.44 91.28 216.79 90.63Q223.13 89.97 227.14 87.83Q231.14 85.68 233.29 81.32Q235.44 76.95 236.22 69.66Q237 62.37 237 51.3L237 51.3L237 0L249.5 0L249.5 51.3Q249.5 67.38 247.38 77.41Q245.27 87.43 239.96 92.77Q234.66 98.11 225.22 100.1Q215.78 102.08 201.13 102.08L201.13 102.08M338.97 100L326.47 100L326.47 10.42L276.47 10.42L276.47 0L388.97 0L388.97 10.42L338.97 10.42L338.97 100M419.85 100L419.85 0L486.78 0Q501.43 0 510.38 1.3Q519.33 2.6 523.96 5.79Q528.58 8.98 530.21 14.52Q531.83 20.05 531.83 28.52L531.83 28.52L531.83 31.12Q531.83 38.93 529.98 44.56Q528.12 50.2 522.85 53.68Q517.58 57.16 507.22 58.59L507.22 58.59L528.97 100L516.47 100L495.18 59.51Q493.88 59.57 492.48 59.57Q491.08 59.57 489.58 59.57L489.58 59.57L432.35 59.57L432.35 100L419.85 100M432.35 10.81L432.35 48.76L487.63 48.76Q498.76 48.76 505.17 48.01Q511.59 47.27 514.61 45.38Q517.64 43.49 518.49 40.04Q519.33 36.59 519.33 31.12L519.33 31.12L519.33 28.52Q519.33 22.33 518.16 18.75Q516.99 15.17 513.47 13.48Q509.96 11.78 502.99 11.3Q496.03 10.81 484.37 10.81L484.37 10.81L432.35 10.81M558.97 100L617.97 0H633.97L692.97 100H677.97L625.97 10.5L573.97 100ZM35.5 66H42.5Q45 66 45 68.5V77.5Q45 80 42.5 80H35.5Q33 80 33 77.5V68.5Q33 66 35.5 66ZM53.5 66H60.5Q63 66 63 68.5V77.5Q63 80 60.5 80H53.5Q51 80 51 77.5V68.5Q51 66 53.5 66ZM71.5 66H78.5Q81 66 81 68.5V77.5Q81 80 78.5 80H71.5Q69 80 69 77.5V68.5Q69 66 71.5 66ZM89.5 66H96.5Q99 66 99 68.5V77.5Q99 80 96.5 80H89.5Q87 80 87 77.5V68.5Q87 66 89.5 66Z'
const SPROCKET =
  'M621.47 50H630.47Q632.97 50 632.97 52.5V63.5Q632.97 66 630.47 66H621.47Q618.97 66 618.97 63.5V52.5Q618.97 50 621.47 50Z'

export const wordmark = <Message>(h: HtmlBuilder<Message>, className: string): Html =>
  h.svg(
    [
      h.Attribute('viewBox', '0 0 696.63 102'),
      h.Attribute('role', 'img'),
      h.AriaLabel('Lutra'),
      h.Class(className),
    ],
    [
      h.path([h.Attribute('d', INK), h.Attribute('fill', 'currentColor')], []),
      h.path([h.Attribute('d', SPROCKET), h.Attribute('fill', 'var(--color-signal)')], []),
    ],
  )

/** The L on its own, in the app icon's heavier cut (stem 20, three larger
 *  perforations) so it stays legible at 16 px; the last perforation is red. */
const MARK_INK =
  'M13 0H33V82H104V100H13ZM44.5 56H55.5Q58 56 58 58.5V71.5Q58 74 55.5 74H44.5Q42 74 42 71.5V58.5Q42 56 44.5 56ZM66.5 56H77.5Q80 56 80 58.5V71.5Q80 74 77.5 74H66.5Q64 74 64 71.5V58.5Q64 56 66.5 56Z'
const MARK_SPROCKET =
  'M88.5 56H99.5Q102 56 102 58.5V71.5Q102 74 99.5 74H88.5Q86 74 86 71.5V58.5Q86 56 88.5 56Z'

export const mark = <Message>(h: HtmlBuilder<Message>, className: string): Html =>
  h.svg(
    [
      h.Attribute('viewBox', '13 0 91 100'),
      h.Attribute('role', 'img'),
      h.AriaLabel('Lutra'),
      h.Class(className),
    ],
    [
      h.path([h.Attribute('d', MARK_INK), h.Attribute('fill', 'currentColor')], []),
      h.path([h.Attribute('d', MARK_SPROCKET), h.Attribute('fill', 'var(--color-signal)')], []),
    ],
  )
