import { describe, it, expect } from 'vitest'
import { Command, Mount, click, given, role, scene, label, text, expect as sceneExpect } from 'foldkit/scene'
import { FieldKey, type LayerType } from '@lutra/engine'
import { EditId } from '@lutra/store'
import { MockImageBitmap } from '../vitest-setup'
import { RenderHandle } from '../gpu/backend'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { Idle } from './phase'
import {
  SelectedTool,
  ConfirmedDraft,
  CancelledDraft,
  UpdatedDraftParam,
  UpdatedLayerParam,
  SelectedMixerColor,
  RemovedLayer,
  ClearedImage,
  EditLoaded,
  RenderedFrame,
  ScaledCanvas,
  CanvasRegistered,
} from './message'
import { PanZoom, RegisterCanvas } from './canvas-stage'
import { MIXER_COLORS } from './layer-meta'
import type { Model } from './model'

// ---- helpers ----

/** A stub handle — the tests never execute GPU work, so only its type flows
 *  through the model (same pattern as lut-flow.test.ts). */
const stubHandle = () =>
  // oxlint-disable-next-line consistent-type-assertions
  new RenderHandle({} as GPUTexture, 200, 150, { buffer: {} as GPUBuffer, map: null })

/** A model in the Idle phase with a loaded image. */
const loaded = () => ({
  ...initialModel(),
  phase: Idle(),
  source: { bitmap: new MockImageBitmap(200, 150), width: 200, height: 150, error: null },
})

/** Settle the in-flight render the way RenderedFrame does, so the next
 *  renderNow dispatches a fresh RenderChain (assertable in tests). */
const settled = (model: Model): Model =>
  update(model, RenderedFrame({ stamp: model.revision, handle: stubHandle() }))[0]

/** A Color Mixer draft (Drafting phase, no render in flight). */
const mixerDraft = () => settled(update(loaded(), SelectedTool({ type: 'colorMixer' }))[0])

/** A committed Color Mixer layer (Selected phase, no render in flight). */
const selectedMixer = () => settled(update(mixerDraft(), ConfirmedDraft())[0])

const draftLayer = (model: Model) =>
  model.phase._tag === 'Drafting' ? model.phase.layer : null

const draftId = (model: Model) => draftLayer(model)?.id

/** Read a numeric field off a heterogeneous layer. */
const field = (layer: { type: LayerType; id: string }, key: string): number => {
  const record: Record<string, unknown> = layer
  const value = record[key]
  return typeof value === 'number' ? value : NaN
}

// ---- update flow ----

describe('Color Mixer layer flow', () => {
  it('creates a Color Mixer draft with all 24 fields zeroed', () => {
    const [model] = update(loaded(), SelectedTool({ type: 'colorMixer' }))
    expect(model.phase._tag).toBe('Drafting')
    const layer = draftLayer(model)
    expect(layer?.type).toBe('colorMixer')
    if (layer?.type === 'colorMixer') {
      for (const color of MIXER_COLORS) {
        for (const channel of ['Hue', 'Saturation', 'Luminance'] as const) {
          expect(field(layer, `${color.key}${channel}`)).toBe(0)
        }
      }
    }
  })

  it('updates a draft mixer field through the machine', () => {
    const [withDraft] = update(loaded(), SelectedTool({ type: 'colorMixer' }))
    const [model] = update(
      withDraft,
      UpdatedDraftParam({ field: FieldKey('blueSaturation'), value: 0.4 }),
    )
    expect(model.phase._tag).toBe('Drafting')
    const layer = draftLayer(model)
    if (layer?.type === 'colorMixer') {
      expect(layer.blueSaturation).toBe(0.4)
    }
  })

  it('selects the active hue range per layer, clamped to 0..7', () => {
    const [withDraft] = update(loaded(), SelectedTool({ type: 'colorMixer' }))
    const id = draftId(withDraft)
    expect(id).toBeDefined()
    // Presentation-only: no render is dispatched for a swatch tap.
    const [selected] = update(withDraft, SelectedMixerColor({ id: id!, color: 5 }))
    expect(selected.activeMixerColor[id!]).toBe(5)
    const [clamped] = update(selected, SelectedMixerColor({ id: id!, color: 99 }))
    expect(clamped.activeMixerColor[id!]).toBe(7)
  })

  it('keeps the active range selection across confirm (same layer id)', () => {
    const [withDraft] = update(loaded(), SelectedTool({ type: 'colorMixer' }))
    const id = draftId(withDraft)
    const [withColor] = update(withDraft, SelectedMixerColor({ id: id!, color: 3 }))
    const [model] = update(withColor, ConfirmedDraft())
    expect(model.chain).toHaveLength(1)
    expect(model.chain[0]?.id).toBe(id)
    expect(model.activeMixerColor[id!]).toBe(3)
  })

  it('updates a committed mixer field and the active range', () => {
    let model = selectedMixer()
    const id = model.chain[0]!.id
    expect(model.phase._tag).toBe('Selected')

    const [updated] = update(
      model,
      UpdatedLayerParam({ id, field: FieldKey('redHue'), value: 0.5 }),
    )
    expect(field(updated.chain[0]!, 'redHue')).toBe(0.5)

    model = updated
    const [withColor] = update(model, SelectedMixerColor({ id, color: 6 }))
    expect(withColor.activeMixerColor[id]).toBe(6)
  })

  it('clears the selection entry on cancel and on remove', () => {
    const [withDraft] = update(loaded(), SelectedTool({ type: 'colorMixer' }))
    const id = draftId(withDraft)!
    const [withColor] = update(withDraft, SelectedMixerColor({ id, color: 2 }))
    const [cancelled] = update(withColor, CancelledDraft())
    expect(cancelled.activeMixerColor[id]).toBeUndefined()

    const [withColor2] = update(withColor, ConfirmedDraft())
    const [removed] = update(withColor2, RemovedLayer({ id }))
    expect(removed.activeMixerColor[id]).toBeUndefined()
  })

  it('resets the selection map when the image clears or an edit loads', () => {
    const [withDraft] = update(loaded(), SelectedTool({ type: 'colorMixer' }))
    const id = draftId(withDraft)!
    const [withColor] = update(withDraft, SelectedMixerColor({ id, color: 4 }))

    const [cleared] = update(withColor, ClearedImage())
    expect(cleared.activeMixerColor).toEqual({})

    const [loaded2] = update(loaded(), SelectedTool({ type: 'colorMixer' }))
    const [withColor2] = update(loaded2, SelectedMixerColor({ id: draftId(loaded2)!, color: 1 }))
    const [editLoaded] = update(
      withColor2,
      EditLoaded({
        id: EditId('11111111-1111-4111-8111-111111111111'),
        chain: [],
        bitmap: new MockImageBitmap(200, 150),
        width: 200,
        height: 150,
        source: new Uint8Array(0),
      }),
    )
    expect(editLoaded.activeMixerColor).toEqual({})
  })
})

// ---- view (scene) ----

const sceneConfig = { update, view } as const

const stageMounts = [
  Mount.resolve(PanZoom, ScaledCanvas({ scale: 1, offsetX: 0, offsetY: 0 })),
  Mount.resolve(RegisterCanvas, CanvasRegistered()),
]

describe('Color Mixer view', () => {
  it('renders the tool card with its copy', () => {
    scene(
      sceneConfig,
      given(loaded()),
      ...stageMounts,
      sceneExpect(role('button', { name: 'Add Color Mixer adjustment' })).toExist(),
      sceneExpect(
        text('Adjusts hue, saturation, and brightness of one color range at a time.'),
      ).toExist(),
      sceneExpect(text('Recolor a single tone — sky, skin, grass — and leave the rest.')).toExist(),
      Command.expectNone(),
    )
  })

  it('shows the draft with 8 swatches and the active range’s three sliders', () => {
    scene(
      sceneConfig,
      given(mixerDraft()),
      ...stageMounts,
      sceneExpect(label('Color Mixer draft')).toExist(),
      // All 8 hue ranges are swatches; Red is active by default.
      sceneExpect(role('button', { name: 'Select Red' })).toHaveAttr('aria-pressed', 'true'),
      sceneExpect(role('button', { name: 'Select Orange' })).toHaveAttr('aria-pressed', 'false'),
      sceneExpect(role('button', { name: 'Select Yellow' })).toExist(),
      sceneExpect(role('button', { name: 'Select Green' })).toExist(),
      sceneExpect(role('button', { name: 'Select Aqua' })).toExist(),
      sceneExpect(role('button', { name: 'Select Blue' })).toExist(),
      sceneExpect(role('button', { name: 'Select Purple' })).toExist(),
      sceneExpect(role('button', { name: 'Select Magenta' })).toExist(),
      // Exactly the active range's three sliders — not 24.
      sceneExpect(role('button', { name: 'HUE' })).toExist(),
      sceneExpect(role('button', { name: 'SATURATION' })).toExist(),
      sceneExpect(role('button', { name: 'LUMINANCE' })).toExist(),
      Command.expectNone(),
    )
  })

  it('switches the sliders to the tapped range', () => {
    // The draft has a red hue value set; the HUE slider shows +45° for it.
    const withDraft = settled(
      update(
        mixerDraft(),
        UpdatedDraftParam({ field: FieldKey('redHue'), value: 0.5 }),
      )[0],
    )
    scene(
      sceneConfig,
      given(withDraft),
      ...stageMounts,
      sceneExpect(text('+45°')).toExist(),
      click(role('button', { name: 'Select Blue' })),
      // Blue is active; the HUE slider now shows blue's value (0°) while
      // red's +45° stays on the layer untouched.
      sceneExpect(role('button', { name: 'Select Blue' })).toHaveAttr('aria-pressed', 'true'),
      sceneExpect(role('button', { name: 'Select Red' })).toHaveAttr('aria-pressed', 'false'),
      sceneExpect(text('+45°')).not.toExist(),
      Command.expectNone(),
    )
  })

  it('shows the committed row summary with the active range’s values', () => {
    const withMixer = selectedMixer()
    const id = withMixer.chain[0]!.id
    const withValue = settled(
      update(
        withMixer,
        UpdatedLayerParam({ id, field: FieldKey('redHue'), value: 0.5 }),
      )[0],
    )
    scene(
      sceneConfig,
      given(withValue),
      ...stageMounts,
      // The row's summary: active range name + non-default values.
      sceneExpect(text('Red +45°')).toExist(),
      // The swatch row is inside the selected row's expanded panel.
      sceneExpect(role('button', { name: 'Select Red' })).toExist(),
      Command.expectNone(),
    )
  })
})
