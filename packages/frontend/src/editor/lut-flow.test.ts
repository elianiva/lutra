import { describe, it, expect } from 'vitest'
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
  testId,
  text,
  expect as sceneExpect,
} from 'foldkit/scene'
import { LutId } from '@lutra/engine'
import type { LayerType } from '@lutra/engine'
import { EditId } from '@lutra/store'
import { MockImageBitmap } from '../vitest-setup'
import { RenderHandle } from '../gpu/backend'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { Idle } from './phase'
import { selectTool } from './test-layer'
import { EditorMessage } from './message'
import { PanZoom, RegisterCanvas } from './canvas-stage'
import { GenerateLutThumb, RenderChain, ReadHistogram, SaveLutRecents } from './command'
import { LutLoadError } from '../luts/store'
import type { Catalog } from './message'
import type { Model } from './model'

const lutPrint = LutId('luts/print/kodak_2393_cuspclip.cube')
const lutBw = LutId('luts/bw/agfa_apx_100.cube')

const catalog: Catalog = [
  {
    category: 'Print',
    lut_file: lutPrint,
    name: 'Kodak 2393 Cuspclip',
    thumbnail: 'thumbnails/print/kodak_2393_cuspclip.jpg',
  },
  {
    category: 'Bw',
    lut_file: lutBw,
    name: 'Agfa APX 100',
    thumbnail: 'thumbnails/bw/agfa_apx_100.jpg',
  },
]

// SAFETY: fabricated GPU handle stub — tests never execute GPU work, so only its type flows through the model; the buffer has no backing storage and is never read.
const stubHandle = () =>
  // SAFETY: fabricated GPU handle stub — tests never execute GPU work, so only its type flows through the model; the buffer has no backing storage and is never read.
  // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion, typescript/consistent-type-assertions -- SAFETY: fabricated GPU handle stub
  new RenderHandle({} as GPUTexture, 200, 150, { buffer: {} as GPUBuffer, state: { _tag: 'Idle' }, generation: 0 })

const editId = () => EditId('11111111-1111-4111-8111-111111111111')

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

/** A LUT draft (Drafting phase, bar open, no render in flight). */
const lutDraft = () => settled(selectTool(loaded(), 'lut').model)

/** A committed LUT layer (Selected phase, bar closed, no render in flight). */
const selectedLut = () => settled(update(lutDraft(), EditorMessage.ConfirmedDraft()).model)

/** A committed lut + exposure chain with the LUT layer selected. */
const selectedLutWithExposure = () => {
  const committed = selectedLut()
  const { model: withExposure } = selectTool(committed, 'exposure')
  const { model: done } = update(withExposure, EditorMessage.ConfirmedDraft())
  const lutLayer = done.chain.find((l) => l.type === 'lut')
  if (!lutLayer) {
    throw new Error('fixture: expected a lut layer')
  }
  return update(done, EditorMessage.SelectedLayer({ id: lutLayer.id })).model
}

const draftLayerType = (model: Model): LayerType | undefined =>
  model.phase._tag === 'Drafting' ? model.phase.layer.type : undefined

const draftLutId = (model: Model): LutId | undefined =>
  model.phase._tag === 'Drafting' && model.phase.layer.type === 'lut'
    ? model.phase.layer.lutId
    : undefined

describe('LUT layer flow', () => {
  it('keeps the LUT tool inert until the catalog loads', () => {
    const { model } = update(initialModel(), EditorMessage.SelectedTool({ type: 'lut' }))
    expect(model.phase._tag).toBe('Empty')
  })

  it('creates a LUT draft with the first catalog entry and the bar open', () => {
    const { model } = selectTool(loaded(), 'lut')
    expect(model.phase._tag).toBe('Drafting')
    if (model.phase._tag === 'Drafting' && model.phase.layer.type === 'lut') {
      expect(model.phase.layer.lutId).toBe(lutPrint)
      expect(model.phase.layer.amount).toBe(1)
    }
    expect(model.lutBarOpen).toBe(true)
  })

  it('swaps the draft LUT through the machine and keeps the draft', () => {
    const { model: withDraft } = selectTool(loaded(), 'lut')
    const { model } = update(withDraft, EditorMessage.ChangedDraftLut({ lutId: lutBw }))
    expect(model.phase._tag).toBe('Drafting')
    expect(draftLutId(model)).toBe(lutBw)
  })

  it('ignores a LUT swap on a non-LUT draft', () => {
    const { model: withDraft } = selectTool(loaded(), 'exposure')
    const { model } = update(withDraft, EditorMessage.ChangedDraftLut({ lutId: lutBw }))
    expect(model.phase._tag).toBe('Drafting')
    expect(draftLayerType(model)).toBe('exposure')
  })

  it('confirms the draft into the chain and closes the bar', () => {
    const { model: withDraft } = selectTool(loaded(), 'lut')
    const { model } = update(withDraft, EditorMessage.ConfirmedDraft())
    expect(model.chain).toHaveLength(1)
    expect(model.phase._tag).toBe('Selected')
    expect(model.lutBarOpen).toBe(false)
    if (model.chain[0]?.type === 'lut') {
      expect(model.chain[0].lutId).toBe(lutPrint)
    }
  })

  it('only toggles the bar for a LUT draft or selected LUT layer', () => {
    const { model: m1 } = update(loaded(), EditorMessage.ToggledLutPicker())
    expect(m1.lutBarOpen).toBe(false)

    const { model: withDraft } = selectTool(loaded(), 'lut')
    const { model: m2 } = update(withDraft, EditorMessage.ToggledLutPicker())
    expect(m2.lutBarOpen).toBe(false)

    const { model: withExposure } = selectTool(loaded(), 'exposure')
    const { model: m3 } = update(withExposure, EditorMessage.ToggledLutPicker())
    expect(m3.lutBarOpen).toBe(false)
  })
})

describe('LUT bar preview (hover)', () => {
  it('previews the LUT on the draft without touching the machine', () => {
    const { model, commands = [] } = update(
      lutDraft(),
      EditorMessage.PreviewedLut({ lutId: lutBw }),
    )
    expect(model.previewLut).toBe(lutBw)
    expect(draftLutId(model)).toBe(lutPrint)
    const render = commands.find((c) => c.name === 'RenderChain')
    expect(render?.args?.draft).toMatchObject({ lutId: lutBw })
  })

  it('PreviewedLut(null) restores the committed lutId', () => {
    const { model: hovered } = update(lutDraft(), EditorMessage.PreviewedLut({ lutId: lutBw }))
    const { model, commands = [] } = update(
      settled(hovered),
      EditorMessage.PreviewedLut({ lutId: null }),
    )
    expect(model.previewLut).toBeNull()
    const render = commands.find((c) => c.name === 'RenderChain')
    expect(render?.args?.draft).toMatchObject({ lutId: lutPrint })
  })

  it('same-value hover does not bump the revision (no redundant render)', () => {
    const { model: hovered } = update(lutDraft(), EditorMessage.PreviewedLut({ lutId: lutBw }))
    const { model, commands = [] } = update(hovered, EditorMessage.PreviewedLut({ lutId: lutBw }))
    expect(model.previewLut).toBe(lutBw)
    expect(model.revision).toBe(hovered.revision)
    expect(commands).toEqual([])
  })

  it('hover without an image is ignored', () => {
    const { model, commands = [] } = update(
      { ...initialModel(), catalog, phase: Idle() },
      EditorMessage.PreviewedLut({ lutId: lutBw }),
    )
    expect(model.previewLut).toBeNull()
    expect(commands).toEqual([])
  })

  it('hover without a LUT target is ignored', () => {
    const { model, commands = [] } = update(loaded(), EditorMessage.PreviewedLut({ lutId: lutBw }))
    expect(model.previewLut).toBeNull()
    expect(commands).toEqual([])
  })

  it('previews on a selected chain LUT layer without touching the chain', () => {
    const committed = selectedLut()
    const { model, commands = [] } = update(committed, EditorMessage.PreviewedLut({ lutId: lutBw }))
    expect(model.previewLut).toBe(lutBw)
    expect(model.chain).toEqual(committed.chain)
    const render = commands.find((c) => c.name === 'RenderChain')
    expect(render?.args?.layers).toMatchObject([{ lutId: lutBw }])
  })

  it('SelectedLutTab sets the tab', () => {
    const { model } = update(loaded(), EditorMessage.SelectedLutTab({ tab: 'Print' }))
    expect(model.lutTab).toBe('Print')
  })
})

describe('LUT bar commit + recents', () => {
  it('bar commit clears the preview, bumps recents, and persists', () => {
    const { model: hovered } = update(lutDraft(), EditorMessage.PreviewedLut({ lutId: lutBw }))
    const { model, commands = [] } = update(
      hovered,
      EditorMessage.ChangedDraftLut({ lutId: lutBw }),
    )
    expect(model.previewLut).toBeNull()
    expect(model.lutRecents).toEqual([lutBw])
    const save = commands.find((c) => c.name === 'SaveLutRecents')
    expect(save?.args?.recents).toEqual([lutBw])
  })

  it('ChangedLayerLut clears the preview and bumps recents', () => {
    const committed = selectedLut()
    const { model: hovered } = update(committed, EditorMessage.PreviewedLut({ lutId: lutBw }))
    const { model, commands = [] } = update(
      hovered,
      EditorMessage.ChangedLayerLut({ id: hovered.chain[0]!.id, lutId: lutBw }),
    )
    expect(model.previewLut).toBeNull()
    expect(model.lutRecents).toEqual([lutBw])
    expect(model.chain[0]).toMatchObject({ lutId: lutBw, type: 'lut' })
    expect(commands.some((c) => c.name === 'SaveLutRecents')).toBe(true)
  })

  it('recents dedupe-prepend and cap at 12', () => {
    let model = lutDraft()
    for (let i = 0; i < 12; i++) {
      model = update(
        model,
        EditorMessage.ChangedDraftLut({ lutId: LutId(`luts/print/seed_${i}.cube`) }),
      ).model
    }
    expect(model.lutRecents).toHaveLength(12)
    expect(model.lutRecents[0]).toBe('luts/print/seed_11.cube')
    expect(model.lutRecents[11]).toBe('luts/print/seed_0.cube')

    model = update(
      model,
      EditorMessage.ChangedDraftLut({ lutId: LutId('luts/print/new.cube') }),
    ).model
    expect(model.lutRecents).toHaveLength(12)
    expect(model.lutRecents[0]).toBe('luts/print/new.cube')
    expect(model.lutRecents).not.toContain('luts/print/seed_0.cube')

    model = update(
      model,
      EditorMessage.ChangedDraftLut({ lutId: LutId('luts/print/seed_5.cube') }),
    ).model
    expect(model.lutRecents).toHaveLength(12)
    expect(model.lutRecents[0]).toBe('luts/print/seed_5.cube')
    expect(model.lutRecents.filter((id) => id === 'luts/print/seed_5.cube')).toHaveLength(1)
  })

  it('the SelectedTool auto-default does not bump recents', () => {
    const { model } = selectTool(loaded(), 'lut')
    expect(model.lutBarOpen).toBe(true)
    expect(model.lutRecents).toEqual([])
  })

  it('LutRecentsLoaded seeds the recents list', () => {
    const { model } = update(loaded(), EditorMessage.LutRecentsLoaded({ recents: [lutBw] }))
    expect(model.lutRecents).toEqual([lutBw])
  })
})

describe('per-photo LUT thumbnails (lazy generation)', () => {
  const genIds = (commands: readonly { name: string; args?: Readonly<{ lutId?: string }> }[]) =>
    commands.filter((c) => c.name === 'GenerateLutThumb').map((c) => c.args?.lutId)

  it('a LUT draft auto-open generates the visible group', () => {
    const { commands = [] } = selectTool(loaded(), 'lut')
    expect(genIds(commands)).toEqual([lutPrint])
  })

  it('a non-LUT draft does not generate (the bar stays closed)', () => {
    const { commands = [] } = selectTool(loaded(), 'exposure')
    expect(genIds(commands)).toEqual([])
  })

  it('SelectedLutTab generates only the newly visible group', () => {
    const { commands = [] } = update(lutDraft(), EditorMessage.SelectedLutTab({ tab: 'Bw' }))
    expect(genIds(commands)).toEqual([lutBw])
  })

  it('does not regenerate thumbs that already exist', () => {
    const model = { ...lutDraft(), lutThumbs: { [lutBw]: 'blob:done' } }
    const { commands = [] } = update(model, EditorMessage.SelectedLutTab({ tab: 'Bw' }))
    expect(genIds(commands)).toEqual([])
    const { commands: back = [] } = update(model, EditorMessage.SelectedLutTab({ tab: 'Print' }))
    expect(genIds(back)).toEqual([lutPrint])
  })

  it('opening the bar via the chevron generates the visible group; closing does not', () => {
    const committed = selectedLut()
    const { model: opened, commands = [] } = update(committed, EditorMessage.ToggledLutPicker())
    expect(opened.lutBarOpen).toBe(true)
    expect(genIds(commands)).toEqual([lutPrint])
    const { commands: closed = [] } = update(opened, EditorMessage.ToggledLutPicker())
    expect(genIds(closed)).toEqual([])
  })

  it('the recents tab generates its missing entries', () => {
    const model = { ...lutDraft(), lutRecents: [lutBw] }
    const { commands = [] } = update(model, EditorMessage.SelectedLutTab({ tab: 'recents' }))
    expect(genIds(commands)).toEqual([lutBw])
  })

  it('LutThumbGenerated stores the URL for the current photo', () => {
    const model = lutDraft()
    const { model: next } = update(
      model,
      EditorMessage.LutThumbGenerated({
        bitmap: model.source.bitmap!,
        lutId: lutBw,
        url: 'blob:thumb',
      }),
    )
    expect(next.lutThumbs[lutBw]).toBe('blob:thumb')
  })

  it('a thumb from a previous photo is revoked and dropped', () => {
    const model = lutDraft()
    const { model: next, commands = [] } = update(
      model,
      EditorMessage.LutThumbGenerated({
        bitmap: new MockImageBitmap(1, 1),
        lutId: lutBw,
        url: 'blob:stale',
      }),
    )
    expect(next.lutThumbs[lutBw]).toBeUndefined()
    const revoke = commands.find((c) => c.name === 'RevokeLutThumbs')
    expect(revoke?.args?.urls).toEqual(['blob:stale'])
  })

  it('a new image clears the thumbnails and revokes their URLs', () => {
    const model = { ...lutDraft(), lutThumbs: { [lutBw]: 'blob:old' } }
    const { model: next, commands = [] } = update(
      model,
      EditorMessage.EditLoaded({
        bitmap: new MockImageBitmap(200, 150),
        chain: [],
        height: 150,
        id: editId(),
        source: new Uint8Array([9]),
        width: 200,
      }),
    )
    expect(next.lutThumbs).toEqual({})
    const revoke = commands.find((c) => c.name === 'RevokeLutThumbs')
    expect(revoke?.args?.urls).toEqual(['blob:old'])
  })

  it('LutThumbFailed keeps the generic fallback (no state change)', () => {
    const { model, commands = [] } = update(
      lutDraft(),
      EditorMessage.LutThumbFailed({ lutId: lutBw }),
    )
    expect(model.lutThumbs[lutBw]).toBeUndefined()
    expect(commands).toEqual([])
  })
})

describe('preview cleanup on bar-closing transitions', () => {
  const closingTransitions: readonly {
    readonly name: string
    readonly make: () => Model
    readonly fire: (model: Model) => Model
  }[] = [
    {
      fire: (m) => selectTool(m, 'exposure').model,
      make: selectedLut,
      name: 'SelectedTool (new draft context)',
    },
    {
      fire: (m) => update(m, EditorMessage.ConfirmedDraft()).model,
      make: lutDraft,
      name: 'ConfirmedDraft',
    },
    {
      fire: (m) => update(m, EditorMessage.CancelledDraft()).model,
      make: lutDraft,
      name: 'CancelledDraft',
    },
    {
      fire: (m) => {
        const other = m.chain.find((l) => l.type !== 'lut')
        if (!other) {
          throw new Error('fixture: expected a non-lut layer')
        }
        return update(m, EditorMessage.SelectedLayer({ id: other.id })).model
      },
      make: selectedLutWithExposure,
      name: 'SelectedLayer (another layer)',
    },
    {
      fire: (m) => {
        const lut = m.chain.find((l) => l.type === 'lut')
        if (!lut) {
          throw new Error('fixture: expected a lut layer')
        }
        return update(m, EditorMessage.RemovedLayer({ id: lut.id })).model
      },
      make: selectedLut,
      name: 'RemovedLayer',
    },
    {
      fire: (m) => update(m, EditorMessage.ClearedImage()).model,
      make: lutDraft,
      name: 'ClearedImage',
    },
    {
      fire: (m) =>
        update(
          m,
          EditorMessage.EditLoaded({
            bitmap: new MockImageBitmap(200, 150),
            chain: [],
            height: 150,
            id: editId(),
            source: new Uint8Array([9]),
            width: 200,
          }),
        ).model,
      make: lutDraft,
      name: 'EditLoaded',
    },
    {
      fire: (m) => update(m, EditorMessage.ToggledLutPicker()).model,
      make: lutDraft,
      name: 'ToggledLutPicker (closing)',
    },
  ]

  it.each(closingTransitions)('$name clears the hover preview', ({ make, fire }) => {
    const { model: hovered } = update(make(), EditorMessage.PreviewedLut({ lutId: lutBw }))
    expect(hovered.previewLut).not.toBeNull()
    const model = fire(hovered)
    expect(model.previewLut).toBeNull()
  })
})

describe('persistence-during-preview dismissal', () => {
  /** A LUT draft on a save-ready editor (attached record + rendered frame). */
  const saveReady = () => ({
    ...initialModel(),
    attachedEdit: { id: null, source: new Uint8Array([1, 2, 3]) },
    catalog,
    lastRender: stubHandle(),
    phase: Idle(),
    renderedStamp: 1,
    source: { bitmap: new MockImageBitmap(640, 480), error: null, height: 480, width: 640 },
  })

  const hoveredDraft = () => {
    const { model: withDraft } = selectTool(saveReady(), 'lut')
    return update(withDraft, EditorMessage.PreviewedLut({ lutId: lutBw })).model
  }

  it('SaveRequested while previewing dismisses the preview instead of saving', () => {
    const { model, commands = [] } = update(hoveredDraft(), EditorMessage.SaveRequested())
    expect(model.previewLut).toBeNull()
    expect(model.saveStatus).toEqual({ _tag: 'idle' })
    expect(commands.some((c) => c.name === 'SaveEdit')).toBe(false)
    const { model: next, commands: nextCommands = [] } = update(
      model,
      EditorMessage.SaveRequested(),
    )
    expect(next.saveStatus).toEqual({ _tag: 'saving' })
    expect(nextCommands.some((c) => c.name === 'SaveEdit')).toBe(true)
  })

  it('SaveAsRequested while previewing dismisses the preview instead of saving', () => {
    const { model, commands = [] } = update(hoveredDraft(), EditorMessage.SaveAsRequested())
    expect(model.previewLut).toBeNull()
    expect(commands.some((c) => c.name === 'SaveEdit')).toBe(false)
    const { commands: nextCommands = [] } = update(model, EditorMessage.SaveAsRequested())
    expect(nextCommands.some((c) => c.name === 'SaveEdit')).toBe(true)
  })

  it('ExportRequested while previewing dismisses the preview instead of opening', () => {
    const { model, commands = [] } = update(hoveredDraft(), EditorMessage.ExportRequested())
    expect(model.previewLut).toBeNull()
    expect(model.exportDialog.dialog.isOpen).toBe(false)
    expect(commands.some((c) => c.name === 'SnapshotForExport')).toBe(false)
    const { model: next, commands: nextCommands = [] } = update(
      model,
      EditorMessage.ExportRequested(),
    )
    expect(next.exportDialog.dialog.isOpen).toBe(true)
    expect(nextCommands.some((c) => c.name === 'SnapshotForExport')).toBe(true)
  })
})

describe('catalog load state (LUT card status slot)', () => {
  it('CatalogFailed records the error for the LUT card caption', () => {
    const { model } = update(
      { ...initialModel(), phase: Idle() },
      EditorMessage.CatalogFailed({
        error: new LutLoadError({ message: 'Failed to load luts/film_luts.json: HTTP 500' }),
      }),
    )
    expect(model.catalogError?.message).toBe('Failed to load luts/film_luts.json: HTTP 500')
    expect(model.catalog).toBeNull()
  })

  it('CatalogLoaded clears a previous failure', () => {
    const { model: failed } = update(
      { ...initialModel(), phase: Idle() },
      EditorMessage.CatalogFailed({
        error: new LutLoadError({ message: 'Failed to load luts/film_luts.json: HTTP 500' }),
      }),
    )
    const { model } = update(failed, EditorMessage.CatalogLoaded({ catalog }))
    expect(model.catalogError).toBeNull()
    // not identity.
    expect(model.catalog).toEqual(catalog)
  })
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

/** Resolve a tab-triggered thumb generation with a failure — the scene's
 *  concern is the bar, not the thumb worker; a failed thumb keeps the
 *  generic jpg, which is exactly what these tests assume. */
const resolveThumbFailure = (lutId: LutId) =>
  Command.resolve(GenerateLutThumb, EditorMessage.LutThumbFailed({ lutId }))

describe('LUT bar view', () => {
  it('renders tabs + thumbs for a LUT draft; hover previews; click commits', () => {
    scene(
      sceneConfig,
      given(lutDraft()),
      ...stageMounts,
      sceneExpect(role('button', { name: 'Print' })).toExist(),
      sceneExpect(role('button', { name: 'Bw' })).toExist(),
      sceneExpect(role('button', { name: 'Recents' })).toBeAbsent(),
      sceneExpect(role('button', { name: 'Print' })).toHaveClass('bg-panel-alt'),
      sceneExpect(role('button', { name: 'Apply Kodak 2393 Cuspclip' })).toExist(),
      sceneExpect(role('button', { name: 'Apply Agfa APX 100' })).toBeAbsent(),
      click(role('button', { name: 'Bw' })),
      resolveThumbFailure(lutBw),
      sceneExpect(role('button', { name: 'Apply Agfa APX 100' })).toExist(),
      hover(role('button', { name: 'Apply Agfa APX 100' })),
      ...resolveRender(),
      sceneExpect(text('Agfa APX 100 · Bw')).toExist(),
      click(role('button', { name: 'Apply Agfa APX 100' })),
      sceneExpect(role('button', { name: 'Apply Agfa APX 100' })).toHaveClass('border-accent'),
      inside(
        role('button', { name: 'Apply Agfa APX 100' }),
        sceneExpect(testId('current-lut-check')).toExist(),
      ),
      sceneExpect(text('Agfa APX 100 · Bw')).toExist(),
      ...resolveRender(),
      Command.resolve(SaveLutRecents, EditorMessage.LutRecentsSaved()),
      Command.expectNone(),
    )
  })

  it('renders the bar for a selected chain LUT layer; click commits the layer', () => {
    scene(
      sceneConfig,
      given({ ...selectedLut(), lutBarOpen: true }),
      ...stageMounts,
      sceneExpect(role('button', { name: 'Apply Kodak 2393 Cuspclip' })).toHaveClass(
        'border-accent',
      ),
      inside(
        role('button', { name: 'Apply Kodak 2393 Cuspclip' }),
        sceneExpect(testId('current-lut-check')).toExist(),
      ),
      click(role('button', { name: 'Bw' })),
      resolveThumbFailure(lutBw),
      hover(role('button', { name: 'Apply Agfa APX 100' })),
      ...resolveRender(),
      sceneExpect(text('Agfa APX 100 · Bw')).toExist(),
      click(role('button', { name: 'Apply Agfa APX 100' })),
      sceneExpect(role('button', { name: 'Apply Agfa APX 100' })).toHaveClass('border-accent'),
      sceneExpect(role('button', { name: 'Apply Kodak 2393 Cuspclip' })).toBeAbsent(),
      // carries it now.
      inside(
        role('button', { name: 'Apply Agfa APX 100' }),
        sceneExpect(testId('current-lut-check')).toExist(),
      ),
      inside(
        role('button', { name: 'Apply Kodak 2393 Cuspclip' }),
        sceneExpect(testId('current-lut-check')).toBeAbsent(),
      ),
      ...resolveRender(),
      Command.resolve(SaveLutRecents, EditorMessage.LutRecentsSaved()),
      Command.expectNone(),
    )
  })

  it('recents tab falls back to the first category when empty', () => {
    scene(
      sceneConfig,
      given({ ...selectedLut(), lutBarOpen: true, lutTab: 'recents' }),
      ...stageMounts,
      sceneExpect(role('button', { name: 'Recents' })).toBeAbsent(),
      sceneExpect(role('button', { name: 'Print' })).toHaveClass('bg-panel-alt'),
      sceneExpect(role('button', { name: 'Apply Kodak 2393 Cuspclip' })).toExist(),
      sceneExpect(role('button', { name: 'Apply Agfa APX 100' })).toBeAbsent(),
      Command.expectNone(),
    )
  })

  it('bar thumbs show the vendored generic jpg until the per-photo preview lands', () => {
    const model = lutDraft()
    const { bitmap } = model.source
    if (!bitmap) {
      throw new Error('fixture: expected a bitmap')
    }
    scene(
      sceneConfig,
      given(model),
      ...stageMounts,
      sceneExpect(role('img', { name: 'Kodak 2393 Cuspclip' })).toHaveAttr(
        'src',
        '/luts/thumbnails/print/kodak_2393_cuspclip.jpg',
      ),
      click(role('button', { name: 'Bw' })),
      Command.resolve(
        GenerateLutThumb,
        EditorMessage.LutThumbGenerated({ bitmap, lutId: lutBw, url: 'blob:photo' }),
      ),
      sceneExpect(role('img', { name: 'Agfa APX 100' })).toHaveAttr('src', 'blob:photo'),
      Command.expectNone(),
    )
  })

  it('the drawer chevron toggles the bar', () => {
    scene(
      sceneConfig,
      given(lutDraft()),
      ...stageMounts,
      // closes it…
      sceneExpect(label('LUT thumbnails')).toExist(),
      click(role('button', { name: 'Toggle LUT bar' })),
      sceneExpect(label('LUT thumbnails')).toBeAbsent(),
      // …and reopens it.
      click(role('button', { name: 'Toggle LUT bar' })),
      resolveThumbFailure(lutPrint),
      sceneExpect(label('LUT thumbnails')).toExist(),
      Command.expectNone(),
    )
  })
})
