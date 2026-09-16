import { Match } from 'effect'
import type { ExportSettings } from './settings'

/**
 * The pure jSquash encode: downscale when the scale is below 100%, then
 * encode through the format's codec with the settings' per-format options.
 * Each codec is imported lazily so its wasm downloads only when the format
 * is first used. Runs in any JS context — the worker, the main thread, or
 * node tests.
 */
export const encodeImage = async (
  image: ImageData,
  settings: ExportSettings,
): Promise<Uint8Array> => {
  let source = image
  if (settings.scale !== 1) {
    // oxlint-disable-next-line ts-no-dynamic-import -- lazy wasm load
    const { default: resize } = await import('@jsquash/resize')
    source = await resize(image, {
      height: Math.max(1, Math.round(image.height * settings.scale)),
      method: settings.resizeMethod,
      width: Math.max(1, Math.round(image.width * settings.scale)),
    })
  }
  const quality = settings.quality ?? 75
  const { jpeg, webp, avif } = settings.options

  return await Match.value(settings.format).pipe(
    Match.when('png', async () => {
      // oxlint-disable-next-line ts-no-dynamic-import -- lazy codec load
      const { encode } = await import('@jsquash/png')
      return new Uint8Array(await encode(source))
    }),
    Match.when('jpeg', async () => {
      // oxlint-disable-next-line ts-no-dynamic-import -- lazy codec load
      const { encode } = await import('@jsquash/jpeg')
      return new Uint8Array(
        await encode(source, {
          optimize_coding: jpeg.optimizeCoding,
          progressive: jpeg.progressive,
          quality,
          smoothing: jpeg.smoothing,
        }),
      )
    }),
    Match.when('webp', async () => {
      // oxlint-disable-next-line ts-no-dynamic-import -- lazy codec load
      const { encode } = await import('@jsquash/webp')
      // A lossless encode takes its effort from `method`; sending `quality`
      // too would feed libwebp a knob the mode ignores.
      const options = webp.lossless
        ? { lossless: 1, method: webp.effort }
        : { lossless: 0, method: webp.effort, quality }
      return new Uint8Array(await encode(source, options))
    }),
    Match.when('avif', async () => {
      // oxlint-disable-next-line ts-no-dynamic-import -- lazy codec load
      const { encode } = await import('@jsquash/avif')
      // AVIF lossless forces quality 100 inside the codec and warns when a
      // quality is passed alongside `lossless` — omit it.
      const options = avif.lossless
        ? { lossless: true, speed: avif.speed }
        : { lossless: false, quality, speed: avif.speed }
      return new Uint8Array(await encode(source, options))
    }),
    Match.exhaustive,
  )
}
