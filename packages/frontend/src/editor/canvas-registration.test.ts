import { describe, it } from 'vitest'
import { Command, Mount, click, given, scene, text } from 'foldkit/scene'
import { MockImageBitmap } from '../vitest-setup'
import { RenderHandle } from '../gpu/backend'
import { CanvasUnavailableError } from '../errors'
import { DecodeImage, PickImageFile, ReadHistogram, RenderChain } from './command'
import { PanZoom, RegisterCanvas } from './canvas-stage'
import { EditorMessage } from './message'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'

const config = { update, view } as const

// SAFETY: the handle's texture and buffer are fabricated stubs — the scene
// never executes GPU work, so only their types flow through the model.
const stubHandle = (width: number, height: number) =>
  new RenderHandle(
    // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
    {} as GPUTexture,
    width,
    height,
    // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
    { buffer: {} as GPUBuffer, generation: 0, state: { _tag: 'Idle' } },
  )

/**
 * The canvas element is registered from a forked mount fiber (snabbdom's
 * insert hook), so the render an image decode dispatches is in flight before
 * the registration lands — the command reads an empty `canvasRef` and fails.
 * `CanvasRegistered` is the message that closes that gap; when it is ignored
 * the first frame is never retried and the canvas stays blank until some
 * unrelated mutation renders again.
 */
describe('Canvas registration', () => {
  it('retries the render lost to the canvas-not-ready failure', () => {
    const bitmap = new MockImageBitmap(200, 150)
    const file = new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' })

    scene(
      config,
      given(initialModel()),

      click(text('browse')),
      Command.resolve(PickImageFile, EditorMessage.SelectedImageFile({ file })),
      Command.resolve(
        DecodeImage,
        EditorMessage.ImageDecoded({
          bitmap,
          height: 150,
          source: new Uint8Array([1]),
          width: 200,
        }),
      ),

      // The decode's render, dispatched before the canvas mount registered.
      Command.expectHas(RenderChain),
      Command.resolve(
        RenderChain,
        EditorMessage.RenderFailed({
          error: new CanvasUnavailableError({ message: 'Canvas not ready' }),
        }),
      ),

      // The stage mounts once the phase is loaded; the canvas registers a
      // moment after the failed render above.
      Mount.resolve(PanZoom, EditorMessage.ScaledCanvas({ offsetX: 0, offsetY: 0, scale: 1 })),
      Mount.resolve(RegisterCanvas, EditorMessage.CanvasRegistered()),

      // The lost frame is rendered again instead of the canvas staying blank
      // until the next mutation.
      Command.expectHas(RenderChain),
      Command.resolve(
        RenderChain,
        EditorMessage.RenderFailed({
          error: new CanvasUnavailableError({ message: 'Canvas not ready' }),
        }),
      ),
    )
  })

  it('does not re-render when a frame for the current revision already landed', () => {
    const bitmap = new MockImageBitmap(200, 150)
    const file = new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' })

    scene(
      config,
      given(initialModel()),

      click(text('browse')),
      Command.resolve(PickImageFile, EditorMessage.SelectedImageFile({ file })),
      Command.resolve(
        DecodeImage,
        EditorMessage.ImageDecoded({
          bitmap,
          height: 150,
          source: new Uint8Array([1]),
          width: 200,
        }),
      ),

      // The render succeeded (the canvas was mounted in time), so the current
      // revision already has a frame on screen.
      Command.expectHas(RenderChain),
      Command.resolve(
        RenderChain,
        EditorMessage.RenderedFrame({ handle: stubHandle(200, 150), stamp: 1 }),
      ),
      Command.resolve(
        ReadHistogram,
        EditorMessage.HistogramComputed({ bins: new Uint32Array(256), stamp: 1 }),
      ),

      Mount.resolve(PanZoom, EditorMessage.ScaledCanvas({ offsetX: 0, offsetY: 0, scale: 1 })),
      Mount.resolve(RegisterCanvas, EditorMessage.CanvasRegistered()),
      Command.expectNone(),
    )
  })
})
