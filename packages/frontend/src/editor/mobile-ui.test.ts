import { describe, it, expect } from 'vitest'
import {
  Command,
  Mount,
  click,
  given,
  role,
  scene,
  label,
  expect as sceneExpect,
} from 'foldkit/scene'
import { LutId } from '@lutra/engine'
import { MockImageBitmap } from '../vitest-setup'
import { RenderHandle } from '../gpu/backend'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { Idle } from './phase'
import { selectTool, createTestLayer } from './test-layer'
import { EditorMessage } from './message'
import { PanZoom, RegisterCanvas } from './canvas-stage'
import { CreateLayer, RenderChain, ReadHistogram } from './command'
import type { Catalog } from './message'

const lutPrint = LutId('luts/print/kodak_2393_cuspclip.cube')

const catalog: Catalog = [
  {
    category: 'Print',
    lut_file: lutPrint,
    name: 'Kodak 2393 Cuspclip',
    thumbnail: 'thumbnails/print/kodak_2393_cuspclip.jpg',
  },
]

// SAFETY: fabricated GPU handle stub — tests never execute GPU work, so only its type flows through the model; the buffer has no backing storage and is never read.
const stubHandle = () =>
  // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
  new RenderHandle({} as GPUTexture, 200, 150, {
    // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
    buffer: {} as GPUBuffer,
    state: { _tag: 'Idle' },
    generation: 0,
  })

/** A model in the Idle phase with a loaded image and the catalog. */
const loaded = () => ({
  ...initialModel(),
  catalog,
  phase: Idle(),
  source: { bitmap: new MockImageBitmap(200, 150), error: null, height: 150, width: 200 },
})

const sceneConfig = { update, view } as const

const stageMounts = [
  Mount.resolve(PanZoom, EditorMessage.ScaledCanvas({ offsetX: 0, offsetY: 0, scale: 1 })),
  Mount.resolve(RegisterCanvas, EditorMessage.CanvasRegistered()),
]

const resolveRender = () => [
  Command.resolve(RenderChain, EditorMessage.RenderedFrame({ handle: stubHandle(), stamp: 999 })),
  Command.resolve(
    ReadHistogram,
    EditorMessage.HistogramComputed({ bins: new Uint32Array(256), stamp: 999 }),
  ),
]

describe('mobile editor', () => {
  it('has no bottom tab bar', () => {
    scene(
      sceneConfig,
      given(loaded()),
      ...stageMounts,
      sceneExpect(role('button', { name: 'Adjustments' })).not.toExist(),
      sceneExpect(role('button', { name: 'Inspector' })).not.toExist(),
      Command.expectNone(),
    )
  })

  it('the bottom dock pins quick tools and opens the full palette', () => {
    scene(
      sceneConfig,
      given(loaded()),
      ...stageMounts,
      sceneExpect(role('button', { name: 'Quick add LUT' })).toExist(),
      sceneExpect(role('button', { name: 'Quick add Exposure' })).toExist(),
      click(role('button', { name: 'All adjustments' })),
      sceneExpect(label('Add an adjustment')).toExist(),
      Command.expectNone(),
    )
  })

  it('picking a tool from the palette raises the draft sheet; its grabber dismisses it', () => {
    scene(
      sceneConfig,
      given(loaded()),
      ...stageMounts,
      click(role('button', { name: 'All adjustments' })),
      click(role('button', { name: 'Add Exposure adjustment' })),
      Command.resolve(
        CreateLayer,
        EditorMessage.LayerCreated({ layer: createTestLayer('exposure') }),
      ),
      ...resolveRender(),
      sceneExpect(label('Exposure draft')).toExist(),
      click(role('button', { name: 'Close adjustment' })),
      ...resolveRender(),
      sceneExpect(label('Exposure draft')).not.toExist(),
      Command.expectNone(),
    )
  })

  it('Apply closes the sheet but keeps the layer selected; selecting it again reopens', () => {
    const { model: drafting } = selectTool(loaded(), 'exposure')
    const { model: applied } = update(drafting, EditorMessage.ConfirmedDraft())
    expect(applied.inspectorDismissed).toBe(true)
    expect(applied.phase._tag).toBe('Selected')
    const layer = applied.chain[0]
    if (!layer) {
      throw new Error('fixture: expected a committed layer')
    }
    const { model: reselected } = update(applied, EditorMessage.SelectedLayer({ id: layer.id }))
    expect(reselected.inspectorDismissed).toBe(false)
  })
})
