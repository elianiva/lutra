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

// ---- helpers ----

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
  new RenderHandle({} as GPUTexture, 200, 150, { buffer: {} as GPUBuffer, map: null })

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
  update(model, EditorMessage.RenderedFrame({ handle: stubHandle(), stamp: model.revision }))[0]

/** An edit with two committed Exposure layers (the ×2 badge fixture). */
const twoExposureLayers = () => {
  const [a] = selectTool(loaded(), 'exposure')
  const [b] = update(a, EditorMessage.ConfirmedDraft())
  const [c] = selectTool(b, 'exposure')
  const [d] = update(c, EditorMessage.ConfirmedDraft())
  return d
}

/** A LUT draft (Drafting phase — no new picks allowed). */
const lutDraft = () => settled(selectTool(loaded(), 'lut')[0])

// ---- view (scene) ----

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
  it('renders every tool as a card with its two copy lines', () => {
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
      // The description block: what it does + when to use it.
      sceneExpect(text('Brightens or darkens the whole photo.')).toExist(),
      sceneExpect(text("Fix a photo that's too dark or too bright.")).toExist(),
      sceneExpect(text('Deepens shadows and lifts highlights.')).toExist(),
      sceneExpect(text('Make a flat photo punchier, or soften it.')).toExist(),
      sceneExpect(text('Lightens or darkens the darkest areas.')).toExist(),
      sceneExpect(text('Pull detail out of underexposed shadows.')).toExist(),
      sceneExpect(text('Lightens or darkens the brightest areas.')).toExist(),
      sceneExpect(text('Recover blown-out skies and bright spots.')).toExist(),
      sceneExpect(
        text('Shapes brightness across the whole range with a draggable curve.'),
      ).toExist(),
      sceneExpect(text('Bend the tones — an S-curve, lifted blacks, or a custom grade.')).toExist(),
      sceneExpect(text('Shifts the color cast: warm or cool, green or magenta.')).toExist(),
      sceneExpect(text('Use it to fix an odd cast or set a mood.')).toExist(),
      sceneExpect(text('Controls how vivid the colors are.')).toExist(),
      sceneExpect(text('Make colors pop, or pull back for a faded look.')).toExist(),
      sceneExpect(
        text('Adjusts hue, saturation, and brightness of one color range at a time.'),
      ).toExist(),
      sceneExpect(text('Recolor a single tone — sky, skin, grass — and leave the rest.')).toExist(),
      sceneExpect(text('Luminance-aware film grain with stock-specific character.')).toExist(),
      sceneExpect(text('Give the photo texture, like classic film.')).toExist(),
      sceneExpect(text("Darkens or brightens the photo's edges.")).toExist(),
      sceneExpect(text('Focus the center, or add a vintage frame.')).toExist(),
      sceneExpect(text('Splits red and blue at the edges, like an old lens.')).toExist(),
      sceneExpect(text('Add a touch of analog imperfection.')).toExist(),
      sceneExpect(text('Adds punch to textures and fine detail.')).toExist(),
      sceneExpect(text('Make surfaces pop, or go softer and dreamy.')).toExist(),
      // Desktop is an icon rail: hovering a card opens its custom tooltip
      // with the copy (the visible block above is the mobile sheet's).
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
      sceneExpect(text('Applies the look of a classic film stock.')).toExist(),
      sceneExpect(text('Give your photo instant analog character.')).toExist(),
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
      sceneExpect(text('×2')).toExist(),
      // …tools not in the chain carry no badge.
      inside(
        role('button', { name: 'Add Contrast adjustment' }),
        sceneExpect(testId('in-edit-badge')).toBeAbsent(),
      ),
      Command.expectNone(),
    )
  })

  it('a single committed layer shows ×1', () => {
    const [withDraft] = selectTool(loaded(), 'vignette')
    const [committed] = update(withDraft, EditorMessage.ConfirmedDraft())
    scene(
      sceneConfig,
      given(committed),
      ...stageMounts,
      inside(
        role('button', { name: 'Add Vignette adjustment' }),
        sceneExpect(testId('in-edit-badge')).toExist(),
      ),
      sceneExpect(text('×1')).toExist(),
      Command.expectNone(),
    )
  })

  it('the LUT card shows the loading caption while the catalog is in flight', () => {
    scene(
      sceneConfig,
      given({ ...loaded(), catalog: null }),
      ...stageMounts,
      sceneExpect(text('Loading LUTs…')).toExist(),
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
      sceneExpect(text('LUTs unavailable')).toExist(),
      hover(role('button', { name: 'Add LUT adjustment' })),
      inside(
        testId('tool-tooltip'),
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
