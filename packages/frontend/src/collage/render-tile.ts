import { Effect } from 'effect'
import type { TileFraming } from '@lutra/store'
import { createRenderRequest } from '@lutra/engine'
import { ENGINE_REGISTRY } from '../editor/layer-meta'
import type { Layer, RenderRequest } from '@lutra/engine'
import { GpuBackend } from '../gpu/backend'
import type { LutStore } from '../luts/store'
import { resolveLuts } from '../luts/resolve'
import type { CellSize } from './compose'
import { placement } from './framing'

/** One rendered tile: the pixels, or a marker that this photo failed. */
export interface TileRender {
  readonly image: ImageData
  /** False when any step (decode, crop, shader, GPU, LUT fetch) failed. */
  readonly ok: boolean
}

/**
 * Render one Edit's full chain into a framed tile of `cell` px (docs/adr/0009-collage,
 * 0033): the source bytes are decoded, drawn through the tile's framing
 * (zoom + focus) onto a detached cell-sized canvas, then run through the
 * engine's normal render path — `GpuBackend.execute` runs the chain at the
 * request bitmap's resolution and never touches the DOM, so the editor's
 * session (a different route) is simply rebuilt when the user returns.
 *
 * The framing draw is the same placement math the preview uses (framing.ts),
 * so what the user framed is exactly what composes.
 *
 * A single broken photo must not sink the whole export, so every failure
 * collapses into `ok: false` — the composer fills the cell with background
 * and the export flow surfaces the count.
 */
export const renderEditTile = ({
  source,
  chain,
  framing,
  cell,
}: {
  readonly source: Uint8Array
  readonly chain: readonly Layer[]
  readonly framing: TileFraming
  readonly cell: CellSize
}): Effect.Effect<TileRender, never, GpuBackend | LutStore> =>
  // v4 note: matchEager's handlers are pure; logging needs matchEffect.
  Effect.matchEffect(renderTileInner(source, chain, framing, cell), {
    // Surface why a photo dropped rather than failing silently — a blank
    // cell with no trace is undebuggable.
    onFailure: (error) =>
      Effect.map(
        Effect.logError('[collage] tile render failed — exporting a blank cell', error),
        () => failedTile(cell),
      ),
    onSuccess: (tile) => Effect.succeed(tile),
  })

const renderTileInner = (
  source: Uint8Array,
  chain: readonly Layer[],
  framing: TileFraming,
  cell: CellSize,
): Effect.Effect<TileRender, unknown, GpuBackend | LutStore> =>
  Effect.scoped(
    Effect.gen(function* renderTileInner() {
      // SAFETY: the store hands back image bytes over a transferred ArrayBuffer; TS cannot express that, so the BlobPart cast is the documented boundary.
      // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
      const blob = new Blob([source as BlobPart])
      // Scope-owned: closed on success AND on every failure path, instead of
      // leaking when a later step throws.
      const decoded = yield* Effect.acquireRelease(
        Effect.tryPromise(() => createImageBitmap(blob)),
        (bitmap) => Effect.sync(() => bitmap.close()),
      )

      // Draw the framed crop at cell resolution: the same placement the
      // preview shows, sampled from the full-resolution decode.
      const canvas = document.createElement('canvas')
      canvas.width = cell.width
      canvas.height = cell.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return yield* Effect.fail(new Error('2D context unavailable'))
      }
      const p = placement(framing, decoded.width / decoded.height, cell.width / cell.height)
      ctx.drawImage(
        decoded,
        p.left * cell.width,
        p.top * cell.height,
        p.width * cell.width,
        p.height * cell.height,
      )
      const framed = yield* Effect.acquireRelease(
        Effect.promise(() => createImageBitmap(canvas)),
        (bitmap) => Effect.sync(() => bitmap.close()),
      )

      const luts = yield* resolveLuts(chain)
      const request: RenderRequest = yield* createRenderRequest(
        [...chain],
        ENGINE_REGISTRY,
        framed,
        // Grain animates per frame; an export is a still — frame 0.
        0,
        luts,
      )

      const backend = yield* GpuBackend
      const handle = yield* backend.execute(request, canvas, OFF_PRESENT)
      const image = yield* backend.snapshot(handle)
      return { image, ok: true } satisfies TileRender
    }),
  )

/** The compare presentation for offscreen renders: plain graded output. */
const OFF_PRESENT = { mode: 'off', splitAt: 0, showBefore: false } as const

/** A blank cell-size frame — what a failed photo leaves behind. */
const failedTile = (cell: CellSize): TileRender => ({
  image: new ImageData(
    new Uint8ClampedArray(cell.width * cell.height * 4),
    cell.width,
    cell.height,
  ),
  ok: false,
})
