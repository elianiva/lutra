import { Effect } from 'effect'
import { createRenderRequest } from '@lutra/engine'
import { ENGINE_REGISTRY } from '../editor/layer-meta'
import type { Layer, RenderRequest } from '@lutra/engine'
import { GpuBackend } from '../gpu/backend'
import type { LutStore } from '../luts/store'
import { resolveLuts } from '../luts/resolve'

/** One rendered tile: the pixels, or a marker that this photo failed. */
export interface TileRender {
  readonly image: ImageData
  /** False when any step (decode, crop, shader, GPU, LUT fetch) failed. */
  readonly ok: boolean
}

/**
 * Render one Edit's full chain to a square tile of `cellSize` px
 * (docs/adr/0031): the source bytes are decoded, center-cropped to a square,
 * downscaled to the cell size, then run through the engine's normal render
 * path on a detached canvas — `GpuBackend.execute` runs the chain at the
 * request bitmap's resolution and never touches the DOM, so the editor's
 * session (a different route) is simply rebuilt when the user returns.
 *
 * A single broken photo must not sink the whole export, so every failure
 * collapses into `ok: false` — the composer fills the cell with background
 * and the export flow surfaces the count.
 */
export const renderEditTile = ({
  source,
  chain,
  cellSize,
}: {
  readonly source: Uint8Array
  readonly chain: readonly Layer[]
  readonly cellSize: number
}): Effect.Effect<TileRender, never, GpuBackend | LutStore> =>
  Effect.matchEager(renderTileInner(source, chain, cellSize), {
    onFailure: () => failedTile(cellSize),
    onSuccess: (tile) => tile,
  })

const renderTileInner = (
  source: Uint8Array,
  chain: readonly Layer[],
  cellSize: number,
): Effect.Effect<TileRender, unknown, GpuBackend | LutStore> =>
  Effect.gen(function* renderTileInner() {
    // SAFETY: the store hands back image bytes over a transferred ArrayBuffer; TS cannot express that, so the BlobPart cast is the documented boundary.
    // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
    const blob = new Blob([source as BlobPart])
    const decoded = yield* Effect.tryPromise(() => createImageBitmap(blob))

    // Center-crop to a square, then downscale to the cell size in one step.
    const side = Math.min(decoded.width, decoded.height)
    const sx = (decoded.width - side) / 2
    const sy = (decoded.height - side) / 2
    const square = yield* Effect.tryPromise(
      () => createImageBitmap(decoded, sx, sy, side, side, { resizeWidth: cellSize, resizeHeight: cellSize }),
    )
    yield* Effect.sync(() => decoded.close())

    const luts = yield* resolveLuts(chain)
    const request: RenderRequest = yield* createRenderRequest(
      [...chain],
      ENGINE_REGISTRY,
      square,
      // Grain animates per frame; an export is a still — frame 0.
      0,
      luts,
    )

    const backend = yield* GpuBackend
    const canvas = document.createElement('canvas')
    canvas.width = cellSize
    canvas.height = cellSize
    const handle = yield* backend.execute(request, canvas, OFF_PRESENT)
    const image = yield* backend.snapshot(handle)
    yield* Effect.sync(() => square.close())
    return { image, ok: true } satisfies TileRender
  })

/** The compare presentation for offscreen renders: plain graded output. */
const OFF_PRESENT = { mode: 'off', splitAt: 0, showBefore: false } as const

/** A blank cell-size frame — what a failed photo leaves behind. */
const failedTile = (cellSize: number): TileRender => ({
  image: new ImageData(new Uint8ClampedArray(cellSize * cellSize * 4), cellSize, cellSize),
  ok: false,
})
