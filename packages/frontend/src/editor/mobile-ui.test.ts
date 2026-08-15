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
import { EditId } from '@lutra/store'
import { MockImageBitmap } from '../vitest-setup'
import { RenderHandle } from '../gpu/backend'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { Idle } from './phase'
import {
  SelectedTool,
  SelectedLayer,
  ConfirmedDraft,
  ClearedImage,
  EditLoaded,
  ImageDecoded,
  ToggledMobileSheet,
  RenderedFrame,
  HistogramComputed,
  ScaledCanvas,
  CanvasRegistered,
} from './message'
import { PanZoom, RegisterCanvas } from './canvas-stage'
import { RenderChain, ReadHistogram } from './command'
import type { Catalog } from './message'
import type { Model } from './model'

// ---- helpers ----

const lutPrint = LutId('luts/print/kodak_2393_cuspclip.cube')

const catalog: Catalog = [
  {
    name: 'Kodak 2393 Cuspclip',
    lut_file: lutPrint,
    category: 'Print',
    thumbnail: 'thumbnails/print/kodak_2393_cuspclip.jpg',
  },
]

/** A stub handle — the tests never execute GPU work, so only its type flows
 *  through the model (same pattern as lut-flow.test.ts). */
const stubHandle = () =>
  // oxlint-disable-next-line consistent-type-assertions
  new RenderHandle({} as GPUTexture, 200, 150, { buffer: {} as GPUBuffer, map: null })

const editId = () => EditId('11111111-1111-4111-8111-111111111111')

/** A model in the Idle phase with a loaded image and the catalog. */
const loaded = () => ({
  ...initialModel(),
  phase: Idle(),
  catalog,
  source: { bitmap: new MockImageBitmap(200, 150), width: 200, height: 150, error: null },
})

/** Settle the in-flight render the way RenderedFrame does, so the next
 *  renderNow dispatches a fresh RenderChain (assertable in tests). */
const settled = (model: Model): Model =>
  update(model, RenderedFrame({ stamp: model.revision, handle: stubHandle() }))[0]

// ---- update flow (docs/adr/0024-mobile-ui) ----

describe('mobile bottom sheets', () => {
  it('starts closed', () => {
    expect(initialModel().mobileSheet).toBeNull()
  })

  it('ToggledMobileSheet opens the tapped sheet', () => {
    const [model] = update(loaded(), ToggledMobileSheet({ sheet: 'tools' }))
    expect(model.mobileSheet).toBe('tools')
  })

  it('tapping the active tab closes the sheet', () => {
    const [opened] = update(loaded(), ToggledMobileSheet({ sheet: 'layers' }))
    const [model] = update(opened, ToggledMobileSheet({ sheet: 'layers' }))
    expect(model.mobileSheet).toBeNull()
  })

  it('tapping the other tab switches the sheet', () => {
    const [opened] = update(loaded(), ToggledMobileSheet({ sheet: 'tools' }))
    const [model] = update(opened, ToggledMobileSheet({ sheet: 'layers' }))
    expect(model.mobileSheet).toBe('layers')
  })

  it('picking a tool follows the draft to the Layers sheet', () => {
    const [model] = update(loaded(), SelectedTool({ type: 'exposure' }))
    expect(model.phase._tag).toBe('Drafting')
    expect(model.mobileSheet).toBe('layers')
  })

  it('selecting a layer opens the Layers sheet', () => {
    const [withDraft] = update(loaded(), SelectedTool({ type: 'exposure' }))
    const [committed] = update(withDraft, ConfirmedDraft())
    const layer = committed.chain[0]
    if (!layer) throw new Error('fixture: expected a committed layer')
    const [model] = update(committed, SelectedLayer({ id: layer.id }))
    expect(model.mobileSheet).toBe('layers')
  })

  it('a new image closes the sheets', () => {
    const [withSheet] = update(loaded(), ToggledMobileSheet({ sheet: 'layers' }))
    const [model] = update(
      withSheet,
      ImageDecoded({
        bitmap: new MockImageBitmap(200, 150),
        width: 200,
        height: 150,
        source: new Uint8Array([1]),
      }),
    )
    expect(model.mobileSheet).toBeNull()
  })

  it('ClearedImage closes the sheets', () => {
    const [withSheet] = update(loaded(), ToggledMobileSheet({ sheet: 'layers' }))
    const [model] = update(withSheet, ClearedImage())
    expect(model.mobileSheet).toBeNull()
  })

  it('EditLoaded closes the sheets', () => {
    const [withSheet] = update(loaded(), ToggledMobileSheet({ sheet: 'tools' }))
    const [model] = update(
      withSheet,
      EditLoaded({
        id: editId(),
        chain: [],
        bitmap: new MockImageBitmap(200, 150),
        width: 200,
        height: 150,
        source: new Uint8Array([9]),
      }),
    )
    expect(model.mobileSheet).toBeNull()
  })
})

// ---- view (scene) ----

const sceneConfig = { update, view } as const

const stageMounts = [
  Mount.resolve(PanZoom, ScaledCanvas({ scale: 1, offsetX: 0, offsetY: 0 })),
  Mount.resolve(RegisterCanvas, CanvasRegistered()),
]

const resolveRender = () => [
  Command.resolve(RenderChain, RenderedFrame({ stamp: 999, handle: stubHandle() })),
  Command.resolve(ReadHistogram, HistogramComputed({ bins: new Uint32Array(256), stamp: 999 })),
]

describe('mobile tab bar view', () => {
  it('renders the Adjustments and Layers tabs; no LUT tab without a target', () => {
    scene(
      sceneConfig,
      given(loaded()),
      ...stageMounts,
      sceneExpect(role('button', { name: 'Adjustments' })).toExist(),
      sceneExpect(role('button', { name: 'Layers' })).toExist(),
      sceneExpect(role('button', { name: 'LUT' })).toBeAbsent(),
      Command.expectNone(),
    )
  })

  it('the LUT tab appears only while a LUT target exists and reflects the bar', () => {
    const lutDraft = settled(update(loaded(), SelectedTool({ type: 'lut' }))[0])
    scene(
      sceneConfig,
      given(lutDraft),
      ...stageMounts,
      sceneExpect(role('button', { name: 'LUT' })).toExist(),
      // The bar auto-opens with a LUT draft, so the tab reads pressed.
      sceneExpect(role('button', { name: 'LUT' })).toHaveAttr('aria-pressed', 'true'),
      Command.expectNone(),
    )
  })

  it('clicking a tab toggles the sheet (aria-pressed mirrors the state)', () => {
    scene(
      sceneConfig,
      given(loaded()),
      ...stageMounts,
      click(role('button', { name: 'Adjustments' })),
      sceneExpect(role('button', { name: 'Adjustments' })).toHaveAttr('aria-pressed', 'true'),
      click(role('button', { name: 'Adjustments' })),
      sceneExpect(role('button', { name: 'Adjustments' })).toHaveAttr('aria-pressed', 'false'),
      Command.expectNone(),
    )
  })

  it('picking a tool from the sheet flips it to Layers (the draft sliders)', () => {
    scene(
      sceneConfig,
      given(loaded()),
      ...stageMounts,
      click(role('button', { name: 'Adjustments' })),
      click(role('button', { name: 'Add Exposure adjustment' })),
      ...resolveRender(),
      sceneExpect(role('button', { name: 'Adjustments' })).toHaveAttr('aria-pressed', 'false'),
      sceneExpect(role('button', { name: 'Layers' })).toHaveAttr('aria-pressed', 'true'),
      // The draft row with its sliders is in the Layers sheet.
      sceneExpect(label('Exposure draft')).toExist(),
      Command.expectNone(),
    )
  })
})
