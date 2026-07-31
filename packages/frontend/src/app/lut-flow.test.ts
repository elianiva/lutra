import { describe, it, expect } from 'vitest'
import { LutId, type LayerType } from '@lutra/engine'
import { initialModel } from './model'
import { update } from './update'
import { Idle } from './phase'
import { SelectedTool, ChangedDraftLut, ToggledLutPicker, ConfirmedDraft } from './message'
import type { Catalog } from './message'
import type { Model } from './model'

// ---- helpers ----

const catalog: Catalog = [
  {
    name: 'Kodak 2393 Cuspclip',
    lut_file: LutId('luts/print/kodak_2393_cuspclip.cube'),
    category: 'Print',
    thumbnail: 'thumbnails/print/kodak_2393_cuspclip.jpg',
  },
  {
    name: 'Agfa APX 100',
    lut_file: LutId('luts/bw/agfa_apx_100.cube'),
    category: 'Bw',
    thumbnail: 'thumbnails/bw/agfa_apx_100.jpg',
  },
]

// A model in the Idle phase (image loaded, nothing mid-flight) with the
// catalog in place, so the LUT tool is pickable.
const withCatalog = { ...initialModel(), phase: Idle(), catalog }

// ---- tests ----

describe('LUT layer flow', () => {
  it('keeps the LUT tool inert until the catalog loads', () => {
    const [model] = update(initialModel(), SelectedTool({ type: 'lut' }))
    expect(model.phase._tag).toBe('Empty')
  })

  it('creates a LUT draft with the first catalog entry and the picker open', () => {
    const [model] = update(withCatalog, SelectedTool({ type: 'lut' }))
    expect(model.phase._tag).toBe('Drafting')
    if (model.phase._tag === 'Drafting' && model.phase.layer.type === 'lut') {
      expect(model.phase.layer.lutId).toBe('luts/print/kodak_2393_cuspclip.cube')
      expect(model.phase.layer.amount).toBe(1)
    }
    expect(model.lutPickerOpen).toBe(true)
  })

  it('swaps the draft LUT through the machine and keeps the draft', () => {
    const [withDraft] = update(withCatalog, SelectedTool({ type: 'lut' }))
    const [model] = update(
      withDraft,
      ChangedDraftLut({ lutId: LutId('luts/bw/agfa_apx_100.cube') }),
    )
    expect(model.phase._tag).toBe('Drafting')
    if (model.phase._tag === 'Drafting' && model.phase.layer.type === 'lut') {
      expect(model.phase.layer.lutId).toBe('luts/bw/agfa_apx_100.cube')
    }
  })

  it('ignores a LUT swap on a non-LUT draft', () => {
    const [withDraft] = update(withCatalog, SelectedTool({ type: 'exposure' }))
    const [model] = update(
      withDraft,
      ChangedDraftLut({ lutId: LutId('luts/bw/agfa_apx_100.cube') }),
    )
    expect(model.phase._tag).toBe('Drafting')
    expect(draftLayerType(model)).toBe('exposure')
  })

  it('confirms the draft into the chain and closes the picker', () => {
    const [withDraft] = update(withCatalog, SelectedTool({ type: 'lut' }))
    const [model] = update(withDraft, ConfirmedDraft())
    expect(model.chain).toHaveLength(1)
    expect(model.phase._tag).toBe('Selected')
    expect(model.lutPickerOpen).toBe(false)
    if (model.chain[0]?.type === 'lut') {
      expect(model.chain[0].lutId).toBe('luts/print/kodak_2393_cuspclip.cube')
    }
  })

  it('only toggles the picker for a LUT draft or selected LUT layer', () => {
    // No draft, nothing selected: toggle is a no-op
    const [m1] = update(withCatalog, ToggledLutPicker())
    expect(m1.lutPickerOpen).toBe(false)

    // With a LUT draft: toggles
    const [withDraft] = update(withCatalog, SelectedTool({ type: 'lut' }))
    const [m2] = update(withDraft, ToggledLutPicker())
    expect(m2.lutPickerOpen).toBe(false)

    // A non-LUT draft: no-op
    const [withExposure] = update(withCatalog, SelectedTool({ type: 'exposure' }))
    const [m3] = update(withExposure, ToggledLutPicker())
    expect(m3.lutPickerOpen).toBe(false)
  })
})

const draftLayerType = (model: Model): LayerType | undefined =>
  model.phase._tag === 'Drafting' ? model.phase.layer.type : undefined
