import { Match } from 'effect'
import type { ExportSettings } from './settings'

/**
 * The pure jSquash encode: downscale (Lanczos) when the scale is below
 * 100%, then encode through the format's codec. Each codec is imported
 * lazily so its wasm downloads only when the format is first used. Runs in
 * any JS context — the worker, the main thread, or node tests.
 */
export const encodeImage = async (
  image: ImageData,
  settings: ExportSettings,
): Promise<Uint8Array> => {
  let source = image
  if (settings.scale !== 1) {
    // oxlint-disable-next-line ts-no-dynamic-import
    const { default: resize } = await import('@jsquash/resize')
    source = await resize(image, {
      height: Math.max(1, Math.round(image.height * settings.scale)),
      method: 'lanczos3',
      width: Math.max(1, Math.round(image.width * settings.scale)),
    })
  }
  const quality = settings.quality ?? 75

  return await Match.value(settings.format).pipe(
    Match.when('png', async () => {
      // oxlint-disable-next-line ts-no-dynamic-import -- lazy codec load
      const { encode } = await import('@jsquash/png')
      return new Uint8Array(await encode(source))
    }),
    Match.when('jpeg', async () => {
      // oxlint-disable-next-line ts-no-dynamic-import -- lazy codec load
      const { encode } = await import('@jsquash/jpeg')
      return new Uint8Array(await encode(source, { quality }))
    }),
    Match.when('webp', async () => {
      // oxlint-disable-next-line ts-no-dynamic-import -- lazy codec load
      const { encode } = await import('@jsquash/webp')
      return new Uint8Array(await encode(source, { quality }))
    }),
    Match.when('avif', async () => {
      // oxlint-disable-next-line ts-no-dynamic-import -- lazy codec load
      const { encode } = await import('@jsquash/avif')
      return new Uint8Array(await encode(source, { quality }))
    }),
    Match.exhaustive,
  )
}
