// Rasterizes public/icons/icon.svg into the manifest icon set (192, 512,
// maskable 512, apple-touch 180) and the iOS launch screens (the
// apple-touch-startup-image set: the app tile centered on the near-black
// background, at every current iPhone/iPad portrait size) with
// @resvg/resvg-js. The PNGs are committed so the build pipeline needs no
// rasterizer; re-run this script when the SVG changes.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const here = path.dirname(fileURLToPath(import.meta.url))
const icons = path.resolve(here, '../packages/frontend/public/icons')

// One entry per iOS device family: the physical splash pixels and the media
// query that selects it (CSS pixel size × pixel ratio). The links in
// index.html must stay in sync with this list.
export const SPLASH_SIZES = [
  // iPhones, oldest to newest.
  ['splash-640x1136.png', 640, 1136, 'screen and (device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2)'],
  ['splash-750x1334.png', 750, 1334, 'screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)'],
  ['splash-1125x2436.png', 1125, 2436, 'screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)'],
  ['splash-1170x2532.png', 1170, 2532, 'screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)'],
  ['splash-1179x2556.png', 1179, 2556, 'screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)'],
  ['splash-1242x2688.png', 1242, 2688, 'screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)'],
  ['splash-1284x2778.png', 1284, 2778, 'screen and (device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)'],
  ['splash-1290x2796.png', 1290, 2796, 'screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)'],
  // iPads.
  ['splash-1536x2048.png', 1536, 2048, 'screen and (device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2)'],
  ['splash-1668x2388.png', 1668, 2388, 'screen and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)'],
  ['splash-2048x2732.png', 2048, 2732, 'screen and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)'],
] as const

/** The icon's rendered size on a splash: 30% of the shorter edge, per the\n *  launch-screen convention of a small centered tile on a solid background. */
const iconSize = (w: number, h: number): number => Math.round(Math.min(w, h) * 0.3)

/** A splash SVG for one device size: the near-black background with the app\n *  tile centered. The icon.svg body is embedded so resvg needs no external\n *  image loading. */
export const splashSvg = (svg: string, w: number, h: number): string => {
  const inner = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'))
  const size = iconSize(w, h)
  const scale = size / 512
  const x = (w - size) / 2
  const y = (h - size) / 2
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="#111111"/>`,
    `<g transform="translate(${x} ${y}) scale(${scale})">${inner}</g>`,
    '</svg>',
  ].join('')
}

const run = async (): Promise<void> => {
  const svg = await readFile(path.join(icons, 'icon.svg'), 'utf8')
  const sizes = [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-maskable-512.png', 512],
    ['apple-touch-icon.png', 180],
  ] as const
  for (const [name, size] of sizes) {
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
    await writeFile(path.join(icons, name), resvg.render().asPng())
    console.log(`${name} (${size}px) written`)
  }
  for (const [name, w, h] of SPLASH_SIZES) {
    const resvg = new Resvg(splashSvg(svg, w, h), { fitTo: { mode: 'width', value: w } })
    await writeFile(path.join(icons, name), resvg.render().asPng())
    console.log(`${name} (${w}x${h}) written`)
  }
}

if (import.meta.main) {
  void run()
}
