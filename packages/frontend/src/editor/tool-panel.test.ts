import { describe, it } from 'vitest'
import {
  Command,
  Mount,
  click,
  given,
  hover,
  inside,
  role,
  scene,
  label,
  selector,
  testId,
  text,
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
import { LutLoadError } from '../luts/store'
import type { Catalog } from './message'
import type { Model } from './model'

const catalog: Catalog = [
  {
    category: 'Print',
    lut_file: LutId('luts/print/kodak_2393_cuspclip.cube'),
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

/** Settle the in-flight render the way RenderedFrame does, so the next
 *  renderNow dispatches a fresh RenderChain (assertable in tests). */
const settled = (model: Model): Model =>
  update(model, EditorMessage.RenderedFrame({ handle: stubHandle(), stamp: model.revision })).model

/** An edit with two committed Exposure layers (the ×2 badge fixture). */
const twoExposureLayers = () => {
  const { model: a } = selectTool(loaded(), 'exposure')
  const { model: b } = update(a, EditorMessage.ConfirmedDraft())
  const { model: c } = selectTool(b, 'exposure')
  const { model: d } = update(c, EditorMessage.ConfirmedDraft())
  return d
}

/** A LUT draft (Drafting phase — no new picks allowed). */
const lutDraft = () => settled(selectTool(loaded(), 'lut').model)

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

describe('tool panel cards', () => {
  it('renders every tool as a card with its tooltip copy', () => {
    scene(
      sceneConfig,
      given(loaded()),
      ...stageMounts,
      // Every tool is a card (the LUT card leads the picker).
      sceneExpect(role('button', { name: 'Add LUT adjustment' })).toExist(),
      sceneExpect(role('button', { name: 'Add Exposure adjustment' })).toExist(),
      sceneExpect(role('button', { name: 'Add Contrast adjustment' })).toExist(),
      sceneExpect(role('button', { name: 'Add Shadows adjustment' })).toExist(),
      sceneExpect(role('button', { name: 'Add Highlights adjustment' })).toExist(),
      sceneExpect(role('button', { name: 'Add Tone Curve adjustment' })).toExist(),
      sceneExpect(role('button', { name: 'Add White Balance adjustment' })).toExist(),
      sceneExpect(role('button', { name: 'Add Saturation adjustment' })).toExist(),
      sceneExpect(role('button', { name: 'Add Color Mixer adjustment' })).toExist(),
      sceneExpect(role('button', { name: 'Add Grain adjustment' })).toExist(),
      sceneExpect(role('button', { name: 'Add Vignette adjustment' })).toExist(),
      sceneExpect(role('button', { name: 'Add Chromatic Aberration adjustment' })).toExist(),
      sceneExpect(role('button', { name: 'Add Clarity adjustment' })).toExist(),
      // The rail is an icon column: hovering a card opens its tooltip with the
      // copy; phones reach the same copy through the palette.
      hover(role('button', { name: 'Add Exposure adjustment' })),
      inside(
        testId('tool-tooltip'),
        sceneExpect(text('Brightens or darkens the whole photo.')).toExist(),
      ),
      // Moving off the card closes it.
      hover(role('button', { name: 'Add Contrast adjustment' })),
      sceneExpect(selector('[data-testid="tool-tooltip"]')).toExist(),
      inside(
        testId('tool-tooltip'),
        sceneExpect(text("Fix a photo that's too dark or too bright.")).toBeAbsent(),
      ),
      // With the catalog loaded, the LUT card shows its copy and is enabled.
      hover(role('button', { name: 'Add LUT adjustment' })),
      inside(
        testId('tool-tooltip'),
        sceneExpect(text('Applies the look of a classic film stock.')).toExist(),
      ),
      sceneExpect(role('button', { name: 'Add LUT adjustment' })).toBeEnabled(),
      Command.expectNone(),
    )
  })

  it('shows the in-edit badge only on cards for tools already in the chain', () => {
    scene(
      sceneConfig,
      given(twoExposureLayers()),
      ...stageMounts,
      // Two committed Exposure layers: the card carries ×2…
      inside(
        role('button', { name: 'Add Exposure adjustment' }),
        sceneExpect(testId('in-edit-badge')).toExist(),
      ),
      // …tools not in the chain carry no badge.
      inside(
        role('button', { name: 'Add Contrast adjustment' }),
        sceneExpect(testId('in-edit-badge')).toBeAbsent(),
      ),
      Command.expectNone(),
    )
  })

  it('a single committed layer shows ×1', () => {
    const { model: withDraft } = selectTool(loaded(), 'vignette')
    const { model: committed } = update(withDraft, EditorMessage.ConfirmedDraft())
    scene(
      sceneConfig,
      given(committed),
      ...stageMounts,
      inside(
        role('button', { name: 'Add Vignette adjustment' }),
        sceneExpect(testId('in-edit-badge')).toExist(),
      ),
      Command.expectNone(),
    )
  })

  it('the LUT card shows the loading caption while the catalog is in flight', () => {
    scene(
      sceneConfig,
      given({ ...loaded(), catalog: null }),
      ...stageMounts,
      hover(role('button', { name: 'Add LUT adjustment' })),
      inside(testId('tool-tooltip'), sceneExpect(text('Loading LUTs…')).toExist()),
      sceneExpect(role('button', { name: 'Add LUT adjustment' })).toBeDisabled(),
      Command.expectNone(),
    )
  })

  it('the LUT card shows the failure caption in its tooltip', () => {
    scene(
      sceneConfig,
      given({
        ...loaded(),
        catalog: null,
        catalogError: new LutLoadError({ message: 'Failed to load luts/film_luts.json: HTTP 500' }),
      }),
      ...stageMounts,
      hover(role('button', { name: 'Add LUT adjustment' })),
      inside(
        testId('tool-tooltip'),
        sceneExpect(text('LUTs unavailable')).toExist(),
        sceneExpect(text('Failed to load luts/film_luts.json: HTTP 500')).toExist(),
      ),
      sceneExpect(role('button', { name: 'Add LUT adjustment' })).toBeDisabled(),
      Command.expectNone(),
    )
  })

  it('clicking a card starts the draft (the drawer shows the draft row)', () => {
    scene(
      sceneConfig,
      given(loaded()),
      ...stageMounts,
      click(role('button', { name: 'Add Exposure adjustment' })),
      Command.resolve(
        CreateLayer,
        EditorMessage.LayerCreated({ layer: createTestLayer('exposure') }),
      ),
      ...resolveRender(),
      sceneExpect(label('Exposure draft')).toExist(),
      Command.expectNone(),
    )
  })

  it('every card is disabled while a draft is active', () => {
    scene(
      sceneConfig,
      given(lutDraft()),
      ...stageMounts,
      sceneExpect(role('button', { name: 'Add Exposure adjustment' })).toBeDisabled(),
      sceneExpect(role('button', { name: 'Add LUT adjustment' })).toBeDisabled(),
      Command.expectNone(),
    )
  })
})
