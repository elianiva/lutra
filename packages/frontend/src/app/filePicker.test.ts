import { describe, expect, it } from 'vitest'
import { Scene } from 'foldkit'
import { initialModel } from './model'
import { update } from './update'
import { view } from '../view'
import { PanZoom } from '../editor/canvasStage'
import { PickImageFile, DecodeImage, RenderChain } from './command'
import {
  FilePickCancelled,
  SelectedImageFile,
  ImageDecoded,
  ImageFailedToDecode,
  RenderedFrame,
  ScaledCanvas,
} from './message'

/** A 1×1 transparent PNG as a File. Used to test the decode path. */
const mockPngFile = new File(
  [
    new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xd7, 0x63, 0x60, 0x60, 0x60, 0x00,
      0x00, 0x00, 0x04, 0x00, 0x01, 0x27, 0x34, 0x27,
      0x24, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
      0x44, 0xae, 0x42, 0x60, 0x82, // IEND chunk
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
    Scene.scene(
      config,
      Scene.with(initialModel()),
      // The text in the parent div is "Drop an image here, or browse".
      // Use exact: false for substring matching.
      Scene.expect(Scene.text('Drop an image here', { exact: false })).toExist(),
      Scene.expect(Scene.text('browse')).toExist(),
      Scene.expect(Scene.text('Supports JPEG, PNG, WebP')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('dispatches PickImageFile command when browse is clicked', () => {
    Scene.scene(
      config,
      Scene.with(initialModel()),
      Scene.click(Scene.text('browse')),
      Scene.Command.expectHas(PickImageFile),
      // Resolve the command so the scene ends cleanly.
      Scene.Command.resolve(PickImageFile, FilePickCancelled()),
      Scene.Command.expectNone(),
    )
  })
})

describe('Error state', () => {
  it('shows error text and a "Try another" button when decoding fails', () => {
    const model = {
      ...initialModel(),
      source: {
        status: 'error' as const,
        bitmap: null,
        width: 0,
        height: 0,
        error: 'Failed to decode image',
      },
    }
    Scene.scene(
      config,
      Scene.with(model),
      Scene.expect(Scene.text('Failed to load image: Failed to decode image')).toExist(),
      Scene.expect(Scene.text('Try another')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('dispatches PickImageFile when "Try another" is clicked on error stage', () => {
    const model = {
      ...initialModel(),
      source: {
        status: 'error' as const,
        bitmap: null,
        width: 0,
        height: 0,
        error: 'Something went wrong',
      },
    }
    Scene.scene(
      config,
      Scene.with(model),
      Scene.click(Scene.text('Try another')),
      Scene.Command.expectHas(PickImageFile),
      Scene.Command.resolve(PickImageFile, FilePickCancelled()),
      Scene.Command.expectNone(),
    )
  })
})

describe('File picker command resolution', () => {
  it('resolves PickImageFile -> SelectedImageFile -> DecodeImage', () => {
    Scene.scene(
      config,
      Scene.with(initialModel()),
      // Click browse
      Scene.click(Scene.text('browse')),
      Scene.Command.expectHas(PickImageFile),
      // Resolve the file picker — user selected a file
      Scene.Command.resolve(
        PickImageFile,
        SelectedImageFile({ file: mockPngFile }),
      ),
      // After file selected, the model goes to 'loading' and DecodeImage fires
      Scene.Command.expectHas(DecodeImage),
      // Resolve DecodeImage to end cleanly
      Scene.Command.resolve(
        DecodeImage,
        ImageFailedToDecode({ error: 'Cancelled in test' }),
      ),
      Scene.Command.expectNone(),
    )
  })

  it('resolves PickImageFile -> FilePickCancelled (user cancels picker)', () => {
    Scene.scene(
      config,
      Scene.with(initialModel()),
      Scene.click(Scene.text('browse')),
      Scene.Command.expectHas(PickImageFile),
      Scene.Command.resolve(PickImageFile, FilePickCancelled()),
      Scene.Command.expectNone(),
    )
  })
})

describe('Image decode flow', () => {
  it('decodes a selected file and transitions to loaded state', () => {
    const bitmap = new (ImageBitmap as unknown as new (w: number, h: number) => ImageBitmap)(200, 150)

    Scene.scene(
      config,
      Scene.with(initialModel()),

      // Click browse, resolve file pick
      Scene.click(Scene.text('browse')),
      Scene.Command.resolve(
        PickImageFile,
        SelectedImageFile({ file: mockPngFile }),
      ),

      // Resolve decode — image decoded successfully
      Scene.Command.resolve(
        DecodeImage,
        ImageDecoded({ bitmap, width: 200, height: 150 }),
      ),

      // Empty chain → the passthrough render presents the source on the
      // canvas. The update dispatches RenderChain (stamp = revision 1); the
      // command's own effect would wait for the canvas to commit, but in the
      // scene we resolve it manually.
      Scene.Command.expectHas(RenderChain),
      Scene.Command.resolve(RenderChain, RenderedFrame({ stamp: 1 })),
      Scene.Mount.resolve(PanZoom, ScaledCanvas({ scale: 1, offsetX: 0, offsetY: 0 })),
      Scene.expect(Scene.selector('#lutra-canvas')).toExist(),
      Scene.Command.expectNone(),
    )
  })

  it('handles decode failure and shows error state', () => {
    Scene.scene(
      config,
      Scene.with(initialModel()),

      Scene.click(Scene.text('browse')),
      Scene.Command.resolve(
        PickImageFile,
        SelectedImageFile({ file: mockPngFile }),
      ),

      // Resolve decode with failure
      Scene.Command.resolve(
        DecodeImage,
        ImageFailedToDecode({ error: 'Corrupt image file' }),
      ),

      // Error text should be visible
      Scene.expect(Scene.text('Failed to load image: Corrupt image file')).toExist(),
      Scene.expect(Scene.text('Try another')).toExist(),
      Scene.Command.expectNone(),
    )
  })
})
