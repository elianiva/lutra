import { describe, it } from 'vitest'
import { Command, Mount, click, expect, given, scene, selector, text } from 'foldkit/scene'
import { MockImageBitmap } from '../vitest-setup'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { ErrorState } from './phase'
import { PanZoom, RegisterCanvas } from './canvas-stage'
import { RenderHandle } from '../gpu/backend'
import { ImageDecodeError } from '../errors'
import { PickImageFile, DecodeImage, RenderChain, ReadHistogram } from './command'
import {
  FilePickCancelled,
  SelectedImageFile,
  ImageDecoded,
  ImageFailedToDecode,
  RenderedFrame,
  HistogramComputed,
  ScaledCanvas,
  CanvasRegistered,
} from './message'

/** A 1×1 transparent PNG as a File. Used to test the decode path. */
const mockPngFile = new File(
  [
    new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG signature
      0x00,
      0x00,
      0x00,
      0x0d,
      0x49,
      0x48,
      0x44,
      0x52, // IHDR chunk
      0x00,
      0x00,
      0x00,
      0x01,
      0x00,
      0x00,
      0x00,
      0x01,
      0x08,
      0x02,
      0x00,
      0x00,
      0x00,
      0x90,
      0x77,
      0x53,
      0xde,
      0x00,
      0x00,
      0x00,
      0x0c,
      0x49,
      0x44,
      0x41,
      0x54,
      0x08,
      0xd7,
      0x63,
      0x60,
      0x60,
      0x60,
      0x00,
      0x00,
      0x00,
      0x04,
      0x00,
      0x01,
      0x27,
      0x34,
      0x27,
      0x24,
      0x00,
      0x00,
      0x00,
      0x00,
      0x49,
      0x45,
      0x4e,
      0x44,
      0xae,
      0x42,
      0x60,
      0x82, // IEND chunk
    ]),
  ],
  'test-image.png',
  { type: 'image/png' },
)

// ---- Scene test config ----

const config = {
  update,
  view,
} as const

// ---- Tests ----

describe('Upload zone (empty state)', () => {
  it('shows the upload prompt with a browse button when no image is loaded', () => {
    scene(
      config,
      given(initialModel()),
      // The text in the parent div is "Drop an image here, or browse".
      // Use exact: false for substring matching.
      expect(text('Drop an image here', { exact: false })).toExist(),
      expect(text('browse')).toExist(),
      expect(text('Supports JPEG, PNG, WebP')).toExist(),
      Command.expectNone(),
    )
  })

  it('dispatches PickImageFile command when browse is clicked', () => {
    scene(
      config,
      given(initialModel()),
      click(text('browse')),
      Command.expectHas(PickImageFile),
      // Resolve the command so the scene ends cleanly.
      Command.resolve(PickImageFile, FilePickCancelled()),
      Command.expectNone(),
    )
  })
})

describe('Error state', () => {
  it('shows error text and a "Try another" button when decoding fails', () => {
    const model = {
      ...initialModel(),
      phase: ErrorState(),
      source: {
        bitmap: null,
        width: 0,
        height: 0,
        error: new ImageDecodeError({ message: 'Failed to decode image' }),
      },
    }
    scene(
      config,
      given(model),
      expect(text('Failed to load image: Failed to decode image')).toExist(),
      expect(text('Try another')).toExist(),
      Command.expectNone(),
    )
  })

  it('dispatches PickImageFile when "Try another" is clicked on error stage', () => {
    const model = {
      ...initialModel(),
      phase: ErrorState(),
      source: {
        bitmap: null,
        width: 0,
        height: 0,
        error: new ImageDecodeError({ message: 'Something went wrong' }),
      },
    }
    scene(
      config,
      given(model),
      click(text('Try another')),
      Command.expectHas(PickImageFile),
      Command.resolve(PickImageFile, FilePickCancelled()),
      Command.expectNone(),
    )
  })
})

describe('File picker command resolution', () => {
  it('resolves PickImageFile -> SelectedImageFile -> DecodeImage', () => {
    scene(
      config,
      given(initialModel()),
      // Click browse
      click(text('browse')),
      Command.expectHas(PickImageFile),
      // Resolve the file picker — user selected a file
      Command.resolve(PickImageFile, SelectedImageFile({ file: mockPngFile })),
      // After file selected, the model goes to 'loading' and DecodeImage fires
      Command.expectHas(DecodeImage),
      // Resolve DecodeImage to end cleanly
      Command.resolve(DecodeImage, ImageFailedToDecode({ error: new ImageDecodeError({ message: 'Cancelled in test' }) })),
      Command.expectNone(),
    )
  })
})

describe('Image decode flow', () => {
  it('decodes a selected file and transitions to loaded state', () => {
    const bitmap = new MockImageBitmap(200, 150)

    scene(
      config,
      given(initialModel()),

      // Click browse, resolve file pick
      click(text('browse')),
      Command.resolve(PickImageFile, SelectedImageFile({ file: mockPngFile })),

      // Resolve decode — image decoded successfully
      Command.resolve(DecodeImage, ImageDecoded({ bitmap, width: 200, height: 150, source: new Uint8Array([1]) })),

      // Empty chain → the passthrough render presents the source on the
      // canvas. The update dispatches RenderChain (stamp = revision 1); the
      // command's own effect would wait for the canvas to commit, but in the
      // scene we resolve it manually. The handle is a stub — the scene never
      // executes GPU work, so only its type flows through the model.
      Command.expectHas(RenderChain),
      Command.resolve(
        RenderChain,
        RenderedFrame({
          stamp: 1,
          // oxlint-disable-next-line consistent-type-assertions
          handle: new RenderHandle({} as GPUTexture, 200, 150, { buffer: {} as GPUBuffer, map: null }),
        }),
      ),
      Mount.resolve(PanZoom, ScaledCanvas({ scale: 1, offsetX: 0, offsetY: 0 })),
      Mount.resolve(RegisterCanvas, CanvasRegistered()),
      // The RenderedFrame handler dispatches ReadHistogram for the frame;
      // the scene resolves it so the session ends cleanly.
      Command.expectHas(ReadHistogram),
      Command.resolve(ReadHistogram, HistogramComputed({ bins: new Uint32Array(256), stamp: 1 })),
      expect(selector('#lutra-canvas')).toExist(),
      Command.expectNone(),
    )
  })

  it('handles decode failure and shows error state', () => {
    scene(
      config,
      given(initialModel()),

      click(text('browse')),
      Command.resolve(PickImageFile, SelectedImageFile({ file: mockPngFile })),

      // Resolve decode with failure
      Command.resolve(DecodeImage, ImageFailedToDecode({ error: new ImageDecodeError({ message: 'Corrupt image file' }) })),

      // Error text should be visible
      expect(text('Failed to load image: Corrupt image file')).toExist(),
      expect(text('Try another')).toExist(),
      Command.expectNone(),
    )
  })
})
