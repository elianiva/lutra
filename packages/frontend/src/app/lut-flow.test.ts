import { describe, it, expect } from 'vitest'
import { initialModel } from './model'
import { update } from './update'
import { SelectedTool, ChangedDraftLut, ToggledLutPicker, ConfirmedDraft } from './message'
import type { Catalog } from './message'

// ---- helpers ----

const catalog: Catalog = [
  {
    name: 'Kodak 2393 Cuspclip',
    lut_file: 'luts/print/kodak_2393_cuspclip.cube',
    category: 'Print',
    thumbnail: 'thumbnails/print/kodak_2393_cuspclip.jpg',
  },
  {
    name: 'Agfa APX 100',
    lut_file: 'luts/bw/agfa_apx_100.cube',
    category: 'Bw',
    thumbnail: 'thumbnails/bw/agfa_apx_100.jpg',
  },
]

const withCatalog = { ...initialModel(), catalog }

// ---- tests ----

describe('LUT layer flow', () => {
  it('keeps the LUT tool inert until the catalog loads', () => {
    const [model] = update(initialModel(), SelectedTool({ type: 'lut' }))
    expect(model.draft).toBeNull()
  })

  it('creates a LUT draft with the first catalog entry and the picker open', () => {
    const [model] = update(withCatalog, SelectedTool({ type: 'lut' }))
    expect(model.draft?.type).toBe('lut')
    if (model.draft?.type === 'lut') {
      expect(model.draft.lutId).toBe('luts/print/kodak_2393_cuspclip.cube')
      expect(model.draft.amount).toBe(1)
    }
    expect(model.lutPickerOpen).toBe(true)
  })

  it('swaps the draft LUT and re-renders', () => {
    const [withDraft] = update(withCatalog, SelectedTool({ type: 'lut' }))
    const [model] = update(withDraft, ChangedDraftLut({ lutId: 'luts/bw/agfa_apx_100.cube' }))
    if (model.draft?.type === 'lut') {
      expect(model.draft.lutId).toBe('luts/bw/agfa_apx_100.cube')
    }
    // No image loaded: the render is skipped, but the draft holds the pick
    expect(model.draft).not.toBeNull()
  })

  it('confirms the draft into the chain and closes the picker', () => {
    const [withDraft] = update(withCatalog, SelectedTool({ type: 'lut' }))
    const [model] = update(withDraft, ConfirmedDraft())
    expect(model.chain).toHaveLength(1)
    expect(model.draft).toBeNull()
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
