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
import { LutId, type LayerType } from '@lutra/engine'
import { EditId } from '@lutra/store'
import { MockImageBitmap } from '../vitest-setup'
import { RenderHandle } from '../gpu/backend'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { Idle } from './phase'
import {
  SelectedTool,
  ChangedDraftLut,
  ChangedLayerLut,
  ToggledLutPicker,
  ConfirmedDraft,
  CancelledDraft,
  PreviewedLut,
  SelectedLutTab,
  LutRecentsLoaded,
  LutRecentsSaved,
  LutThumbGenerated,
  LutThumbFailed,
  SaveRequested,
  SaveAsRequested,
  ExportRequested,
  ClearedImage,
  EditLoaded,
  SelectedLayer,
  RemovedLayer,
  RenderedFrame,
  HistogramComputed,
  ScaledCanvas,
  CanvasRegistered,
  CatalogLoaded,
  CatalogFailed,
} from './message'
import { PanZoom, RegisterCanvas } from './canvas-stage'
import { GenerateLutThumb, RenderChain, ReadHistogram, SaveLutRecents } from './command'
import { LutLoadError } from '../luts/store'
import type { Catalog } from './message'
import type { Model } from './model'

// ---- helpers ----

const lutPrint = LutId('luts/print/kodak_2393_cuspclip.cube')
const lutBw = LutId('luts/bw/agfa_apx_100.cube')

const catalog: Catalog = [
  {
    name: 'Kodak 2393 Cuspclip',
    lut_file: lutPrint,
    category: 'Print',
    thumbnail: 'thumbnails/print/kodak_2393_cuspclip.jpg',
  },
  {
    name: 'Agfa APX 100',
    lut_file: lutBw,
    category: 'Bw',
    thumbnail: 'thumbnails/bw/agfa_apx_100.jpg',
  },
]

/** A stub handle — the tests never execute GPU work, so only its type flows
 *  through the model (same pattern as histogram-flow.test.ts). */
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

/** A LUT draft (Drafting phase, bar open, no render in flight). */
const lutDraft = () => settled(update(loaded(), SelectedTool({ type: 'lut' }))[0])

/** A committed LUT layer (Selected phase, bar closed, no render in flight). */
const selectedLut = () => settled(update(lutDraft(), ConfirmedDraft())[0])

/** A committed lut + exposure chain with the LUT layer selected. */
const selectedLutWithExposure = () => {
  const committed = selectedLut()
  const [withExposure] = update(committed, SelectedTool({ type: 'exposure' }))
  const [done] = update(withExposure, ConfirmedDraft())
  const lutLayer = done.chain.find((l) => l.type === 'lut')
  if (!lutLayer) throw new Error('fixture: expected a lut layer')
  return update(done, SelectedLayer({ id: lutLayer.id }))[0]
}

const draftLayerType = (model: Model): LayerType | undefined =>
  model.phase._tag === 'Drafting' ? model.phase.layer.type : undefined

const draftLutId = (model: Model): LutId | undefined =>
  model.phase._tag === 'Drafting' && model.phase.layer.type === 'lut'
    ? model.phase.layer.lutId
    : undefined

// ---- update flow ----

describe('LUT layer flow', () => {
  it('keeps the LUT tool inert until the catalog loads', () => {
    const [model] = update(initialModel(), SelectedTool({ type: 'lut' }))
    expect(model.phase._tag).toBe('Empty')
  })

  it('creates a LUT draft with the first catalog entry and the bar open', () => {
    const [model] = update(loaded(), SelectedTool({ type: 'lut' }))
    expect(model.phase._tag).toBe('Drafting')
    if (model.phase._tag === 'Drafting' && model.phase.layer.type === 'lut') {
      expect(model.phase.layer.lutId).toBe(lutPrint)
      expect(model.phase.layer.amount).toBe(1)
    }
    expect(model.lutBarOpen).toBe(true)
  })

  it('swaps the draft LUT through the machine and keeps the draft', () => {
    const [withDraft] = update(loaded(), SelectedTool({ type: 'lut' }))
    const [model] = update(withDraft, ChangedDraftLut({ lutId: lutBw }))
    expect(model.phase._tag).toBe('Drafting')
    expect(draftLutId(model)).toBe(lutBw)
  })

  it('ignores a LUT swap on a non-LUT draft', () => {
    const [withDraft] = update(loaded(), SelectedTool({ type: 'exposure' }))
    const [model] = update(withDraft, ChangedDraftLut({ lutId: lutBw }))
    expect(model.phase._tag).toBe('Drafting')
    expect(draftLayerType(model)).toBe('exposure')
  })

  it('confirms the draft into the chain and closes the bar', () => {
    const [withDraft] = update(loaded(), SelectedTool({ type: 'lut' }))
    const [model] = update(withDraft, ConfirmedDraft())
    expect(model.chain).toHaveLength(1)
    expect(model.phase._tag).toBe('Selected')
    expect(model.lutBarOpen).toBe(false)
    if (model.chain[0]?.type === 'lut') {
      expect(model.chain[0].lutId).toBe(lutPrint)
    }
  })

  it('only toggles the bar for a LUT draft or selected LUT layer', () => {
    // No draft, nothing selected: toggle is a no-op
    const [m1] = update(loaded(), ToggledLutPicker())
    expect(m1.lutBarOpen).toBe(false)

    // With a LUT draft: toggles
    const [withDraft] = update(loaded(), SelectedTool({ type: 'lut' }))
    const [m2] = update(withDraft, ToggledLutPicker())
    expect(m2.lutBarOpen).toBe(false)

    // A non-LUT draft: no-op
    const [withExposure] = update(loaded(), SelectedTool({ type: 'exposure' }))
    const [m3] = update(withExposure, ToggledLutPicker())
    expect(m3.lutBarOpen).toBe(false)
  })
})

describe('LUT bar preview (hover)', () => {
  it('previews the LUT on the draft without touching the machine', () => {
    const [model, commands] = update(lutDraft(), PreviewedLut({ lutId: lutBw }))
    expect(model.previewLut).toBe(lutBw)
    // The machine-owned draft keeps its committed lutId — the preview is
    // applied at render time only.
    expect(draftLutId(model)).toBe(lutPrint)
    const render = commands.find((c) => c.name === 'RenderChain')
    expect(render?.args?.draft).toMatchObject({ lutId: lutBw })
  })

  it('PreviewedLut(null) restores the committed lutId', () => {
    const [hovered] = update(lutDraft(), PreviewedLut({ lutId: lutBw }))
    const [model, commands] = update(settled(hovered), PreviewedLut({ lutId: null }))
    expect(model.previewLut).toBeNull()
    const render = commands.find((c) => c.name === 'RenderChain')
    expect(render?.args?.draft).toMatchObject({ lutId: lutPrint })
  })

  it('same-value hover does not bump the revision (no redundant render)', () => {
    const [hovered] = update(lutDraft(), PreviewedLut({ lutId: lutBw }))
    const [model, commands] = update(hovered, PreviewedLut({ lutId: lutBw }))
    expect(model.previewLut).toBe(lutBw)
    expect(model.revision).toBe(hovered.revision)
    expect(commands).toEqual([])
  })

  it('hover without an image is ignored', () => {
    const [model, commands] = update(
      { ...initialModel(), phase: Idle(), catalog },
      PreviewedLut({ lutId: lutBw }),
    )
    expect(model.previewLut).toBeNull()
    expect(commands).toEqual([])
  })

  it('hover without a LUT target is ignored', () => {
    const [model, commands] = update(loaded(), PreviewedLut({ lutId: lutBw }))
    expect(model.previewLut).toBeNull()
    expect(commands).toEqual([])
  })

  it('previews on a selected chain LUT layer without touching the chain', () => {
    const committed = selectedLut()
    const [model, commands] = update(committed, PreviewedLut({ lutId: lutBw }))
    expect(model.previewLut).toBe(lutBw)
    expect(model.chain).toEqual(committed.chain)
    const render = commands.find((c) => c.name === 'RenderChain')
    expect(render?.args?.layers).toMatchObject([{ lutId: lutBw }])
  })

  it('SelectedLutTab sets the tab', () => {
    const [model] = update(loaded(), SelectedLutTab({ tab: 'Print' }))
    expect(model.lutTab).toBe('Print')
  })
})

describe('LUT bar commit + recents', () => {
  it('bar commit clears the preview, bumps recents, and persists', () => {
    const [hovered] = update(lutDraft(), PreviewedLut({ lutId: lutBw }))
    const [model, commands] = update(hovered, ChangedDraftLut({ lutId: lutBw }))
    expect(model.previewLut).toBeNull()
    expect(model.lutRecents).toEqual([lutBw])
    const save = commands.find((c) => c.name === 'SaveLutRecents')
    expect(save?.args?.recents).toEqual([lutBw])
  })

  it('ChangedLayerLut clears the preview and bumps recents', () => {
    const committed = selectedLut()
    const [hovered] = update(committed, PreviewedLut({ lutId: lutBw }))
    const [model, commands] = update(
      hovered,
      ChangedLayerLut({ id: hovered.chain[0]!.id, lutId: lutBw }),
    )
    expect(model.previewLut).toBeNull()
    expect(model.lutRecents).toEqual([lutBw])
    expect(model.chain[0]).toMatchObject({ type: 'lut', lutId: lutBw })
    expect(commands.some((c) => c.name === 'SaveLutRecents')).toBe(true)
  })

  it('recents dedupe-prepend and cap at 12', () => {
    let model = lutDraft()
    // Seed 12 distinct recents (newest first) through draft commits.
    for (let i = 0; i < 12; i++) {
      model = update(model, ChangedDraftLut({ lutId: LutId(`luts/print/seed_${i}.cube`) }))[0]
    }
    expect(model.lutRecents).toHaveLength(12)
    expect(model.lutRecents[0]).toBe('luts/print/seed_11.cube')
    expect(model.lutRecents[11]).toBe('luts/print/seed_0.cube')

    // A 13th pick pushes the oldest out.
    model = update(model, ChangedDraftLut({ lutId: LutId('luts/print/new.cube') }))[0]
    expect(model.lutRecents).toHaveLength(12)
    expect(model.lutRecents[0]).toBe('luts/print/new.cube')
    expect(model.lutRecents).not.toContain('luts/print/seed_0.cube')

    // Re-picking an existing id moves it to the front without duplicating.
    model = update(model, ChangedDraftLut({ lutId: LutId('luts/print/seed_5.cube') }))[0]
    expect(model.lutRecents).toHaveLength(12)
    expect(model.lutRecents[0]).toBe('luts/print/seed_5.cube')
    expect(model.lutRecents.filter((id) => id === 'luts/print/seed_5.cube')).toHaveLength(1)
  })

  it('the SelectedTool auto-default does not bump recents', () => {
    const [model] = update(loaded(), SelectedTool({ type: 'lut' }))
    expect(model.lutBarOpen).toBe(true)
    expect(model.lutRecents).toEqual([])
  })

  it('LutRecentsLoaded seeds the recents list', () => {
    const [model] = update(loaded(), LutRecentsLoaded({ recents: [lutBw] }))
    expect(model.lutRecents).toEqual([lutBw])
  })
})

describe('per-photo LUT thumbnails (lazy generation)', () => {
  const genIds = (commands: ReadonlyArray<{ name: string; args?: Record<string, unknown> }>) =>
    commands.filter((c) => c.name === 'GenerateLutThumb').map((c) => c.args?.lutId)

  it('a LUT draft auto-open generates the visible group', () => {
    // Effective tab: recents-empty falls back to the first category (Print).
    const [, commands] = update(loaded(), SelectedTool({ type: 'lut' }))
    expect(genIds(commands)).toEqual([lutPrint])
  })

  it('a non-LUT draft does not generate (the bar stays closed)', () => {
    const [, commands] = update(loaded(), SelectedTool({ type: 'exposure' }))
    expect(genIds(commands)).toEqual([])
  })

  it('SelectedLutTab generates only the newly visible group', () => {
    const [, commands] = update(lutDraft(), SelectedLutTab({ tab: 'Bw' }))
    expect(genIds(commands)).toEqual([lutBw])
  })

  it('does not regenerate thumbs that already exist', () => {
    const model = { ...lutDraft(), lutThumbs: { [lutBw]: 'blob:done' } }
    const [, commands] = update(model, SelectedLutTab({ tab: 'Bw' }))
    expect(genIds(commands)).toEqual([])
    // The other group is still missing and generates on its visit.
    const [, back] = update(model, SelectedLutTab({ tab: 'Print' }))
    expect(genIds(back)).toEqual([lutPrint])
  })

  it('opening the bar via the chevron generates the visible group; closing does not', () => {
    const committed = selectedLut()
    const [opened, commands] = update(committed, ToggledLutPicker())
    expect(opened.lutBarOpen).toBe(true)
    expect(genIds(commands)).toEqual([lutPrint])
    const [, closed] = update(opened, ToggledLutPicker())
    expect(genIds(closed)).toEqual([])
  })

  it('the recents tab generates its missing entries', () => {
    const model = { ...lutDraft(), lutRecents: [lutBw] }
    const [, commands] = update(model, SelectedLutTab({ tab: 'recents' }))
    expect(genIds(commands)).toEqual([lutBw])
  })

  it('LutThumbGenerated stores the URL for the current photo', () => {
    const model = lutDraft()
    const [next] = update(
      model,
      LutThumbGenerated({ lutId: lutBw, url: 'blob:thumb', bitmap: model.source.bitmap! }),
    )
    expect(next.lutThumbs[lutBw]).toBe('blob:thumb')
  })

  it('a thumb from a previous photo is revoked and dropped', () => {
    const model = lutDraft()
    const [next, commands] = update(
      model,
      LutThumbGenerated({ lutId: lutBw, url: 'blob:stale', bitmap: new MockImageBitmap(1, 1) }),
    )
    expect(next.lutThumbs[lutBw]).toBeUndefined()
    const revoke = commands.find((c) => c.name === 'RevokeLutThumbs')
    expect(revoke?.args?.urls).toEqual(['blob:stale'])
  })

  it('a new image clears the thumbnails and revokes their URLs', () => {
    const model = { ...lutDraft(), lutThumbs: { [lutBw]: 'blob:old' } }
    const [next, commands] = update(
      model,
      EditLoaded({
        id: editId(),
        chain: [],
        bitmap: new MockImageBitmap(200, 150),
        width: 200,
        height: 150,
        source: new Uint8Array([9]),
      }),
    )
    expect(next.lutThumbs).toEqual({})
    const revoke = commands.find((c) => c.name === 'RevokeLutThumbs')
    expect(revoke?.args?.urls).toEqual(['blob:old'])
  })

  it('LutThumbFailed keeps the generic fallback (no state change)', () => {
    const [model, commands] = update(lutDraft(), LutThumbFailed({ lutId: lutBw }))
    expect(model.lutThumbs[lutBw]).toBeUndefined()
    expect(commands).toEqual([])
  })
})

describe('preview cleanup on bar-closing transitions', () => {
  const closingTransitions: ReadonlyArray<{
    readonly name: string
    readonly make: () => Model
    readonly fire: (model: Model) => Model
  }> = [
    {
      name: 'SelectedTool (new draft context)',
      make: selectedLut,
      fire: (m) => update(m, SelectedTool({ type: 'exposure' }))[0],
    },
    { name: 'ConfirmedDraft', make: lutDraft, fire: (m) => update(m, ConfirmedDraft())[0] },
    { name: 'CancelledDraft', make: lutDraft, fire: (m) => update(m, CancelledDraft())[0] },
    {
      name: 'SelectedLayer (another layer)',
      make: selectedLutWithExposure,
      fire: (m) => {
        const other = m.chain.find((l) => l.type !== 'lut')
        if (!other) throw new Error('fixture: expected a non-lut layer')
        return update(m, SelectedLayer({ id: other.id }))[0]
      },
    },
    {
      name: 'RemovedLayer',
      make: selectedLut,
      fire: (m) => {
        const lut = m.chain.find((l) => l.type === 'lut')
        if (!lut) throw new Error('fixture: expected a lut layer')
        return update(m, RemovedLayer({ id: lut.id }))[0]
      },
    },
    { name: 'ClearedImage', make: lutDraft, fire: (m) => update(m, ClearedImage())[0] },
    {
      name: 'EditLoaded',
      make: lutDraft,
      fire: (m) =>
        update(
          m,
          EditLoaded({
            id: editId(),
            chain: [],
            bitmap: new MockImageBitmap(200, 150),
            width: 200,
            height: 150,
            source: new Uint8Array([9]),
          }),
        )[0],
    },
    {
      name: 'ToggledLutPicker (closing)',
      make: lutDraft,
      fire: (m) => update(m, ToggledLutPicker())[0],
    },
  ]

  it.each(closingTransitions)('$name clears the hover preview', ({ make, fire }) => {
    const [hovered] = update(make(), PreviewedLut({ lutId: lutBw }))
    expect(hovered.previewLut).not.toBeNull()
    const model = fire(hovered)
    expect(model.previewLut).toBeNull()
  })
})

describe('persistence-during-preview dismissal', () => {
  /** A LUT draft on a save-ready editor (attached record + rendered frame). */
  const saveReady = () => ({
    ...initialModel(),
    phase: Idle(),
    catalog,
    source: { bitmap: new MockImageBitmap(640, 480), width: 640, height: 480, error: null },
    lastRender: stubHandle(),
    renderedStamp: 1,
    attachedEdit: { id: null, source: new Uint8Array([1, 2, 3]) },
  })

  const hoveredDraft = () => {
    const [withDraft] = update(saveReady(), SelectedTool({ type: 'lut' }))
    return update(withDraft, PreviewedLut({ lutId: lutBw }))[0]
  }

  it('SaveRequested while previewing dismisses the preview instead of saving', () => {
    const [model, commands] = update(hoveredDraft(), SaveRequested())
    expect(model.previewLut).toBeNull()
    expect(model.saveStatus).toEqual({ _tag: 'idle' })
    expect(commands.some((c) => c.name === 'SaveEdit')).toBe(false)
    // The next Save proceeds normally.
    const [next, nextCommands] = update(model, SaveRequested())
    expect(next.saveStatus).toEqual({ _tag: 'saving' })
    expect(nextCommands.some((c) => c.name === 'SaveEdit')).toBe(true)
  })

  it('SaveAsRequested while previewing dismisses the preview instead of saving', () => {
    const [model, commands] = update(hoveredDraft(), SaveAsRequested())
    expect(model.previewLut).toBeNull()
    expect(commands.some((c) => c.name === 'SaveEdit')).toBe(false)
    const [, nextCommands] = update(model, SaveAsRequested())
    expect(nextCommands.some((c) => c.name === 'SaveEdit')).toBe(true)
  })

  it('ExportRequested while previewing dismisses the preview instead of opening', () => {
    const [model, commands] = update(hoveredDraft(), ExportRequested())
    expect(model.previewLut).toBeNull()
    expect(model.exportDialog.isOpen).toBe(false)
    expect(commands.some((c) => c.name === 'SnapshotForExport')).toBe(false)
    // The next Export opens the dialog.
    const [next, nextCommands] = update(model, ExportRequested())
    expect(next.exportDialog.isOpen).toBe(true)
    expect(nextCommands.some((c) => c.name === 'SnapshotForExport')).toBe(true)
  })
})

describe('catalog load state (LUT card status slot)', () => {
  it('CatalogFailed records the error for the LUT card caption', () => {
    // A catalog-less model: the startup fetch is still in flight (or the
    // LUT library is broken) — the tool panel shows the status caption.
    const [model] = update(
      { ...initialModel(), phase: Idle() },
      CatalogFailed({ error: new LutLoadError({ message: 'Failed to load luts/film_luts.json: HTTP 500' }) }),
    )
    expect(model.catalogError?.message).toBe('Failed to load luts/film_luts.json: HTTP 500')
    // The catalog itself stays missing — the LUT tool remains inert.
    expect(model.catalog).toBeNull()
  })

  it('CatalogLoaded clears a previous failure', () => {
    const [failed] = update(
      { ...initialModel(), phase: Idle() },
      CatalogFailed({ error: new LutLoadError({ message: 'Failed to load luts/film_luts.json: HTTP 500' }) }),
    )
    const [model] = update(failed, CatalogLoaded({ catalog }))
    expect(model.catalogError).toBeNull()
    // The message boundary re-validates the payload — structural equality,
    // not identity.
    expect(model.catalog).toEqual(catalog)
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

/** Resolve a tab-triggered thumb generation with a failure — the scene's
 *  concern is the bar, not the thumb worker; a failed thumb keeps the
 *  generic jpg, which is exactly what these tests assume. */
const resolveThumbFailure = (lutId: LutId) =>
  Command.resolve(GenerateLutThumb, LutThumbFailed({ lutId }))

describe('LUT bar view', () => {
  it('renders tabs + thumbs for a LUT draft; hover previews; click commits', () => {
    scene(
      sceneConfig,
      given(lutDraft()),
      ...stageMounts,
      // Tab column: the catalog categories with counts (Recents hidden
      // while empty). Print is the active tab (first-category fallback).
      sceneExpect(role('button', { name: 'Print' })).toExist(),
      sceneExpect(role('button', { name: 'Bw' })).toExist(),
      sceneExpect(role('button', { name: 'Recents' })).toBeAbsent(),
      sceneExpect(role('button', { name: 'Print' })).toHaveClass('bg-panel-alt'),
      // Filmstrip: the active tab's 64px thumbs (lazy img, title tooltip).
      sceneExpect(role('button', { name: 'Apply Kodak 2393 Cuspclip' })).toExist(),
      sceneExpect(role('button', { name: 'Apply Agfa APX 100' })).toBeAbsent(),
      // Switch to the Bw tab.
      click(role('button', { name: 'Bw' })),
      resolveThumbFailure(lutBw),
      sceneExpect(role('button', { name: 'Apply Agfa APX 100' })).toExist(),
      // Hover previews on the canvas (the render carries the previewed
      // draft lutId); the name line shows the hovered entry live.
      hover(role('button', { name: 'Apply Agfa APX 100' })),
      ...resolveRender(),
      sceneExpect(text('Agfa APX 100 · Bw')).toExist(),
      // Click commits: the accent border moves to the clicked thumb, its
      // centered check badge appears (the active LUT must read at a
      // glance), and the name line keeps it (now the committed LUT).
      click(role('button', { name: 'Apply Agfa APX 100' })),
      sceneExpect(role('button', { name: 'Apply Agfa APX 100' })).toHaveClass('border-accent'),
      inside(
        role('button', { name: 'Apply Agfa APX 100' }),
        sceneExpect(testId('current-lut-check')).toExist(),
      ),
      sceneExpect(text('Agfa APX 100 · Bw')).toExist(),
      ...resolveRender(),
      Command.resolve(SaveLutRecents, LutRecentsSaved()),
      Command.expectNone(),
    )
  })

  it('renders the bar for a selected chain LUT layer; click commits the layer', () => {
    scene(
      sceneConfig,
      given({ ...selectedLut(), lutBarOpen: true }),
      ...stageMounts,
      // The committed LUT (Kodak) carries the accent border and the check
      // badge; the uncommitted Bw thumb has neither.
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
      sceneExpect(role('button', { name: 'Apply Kodak 2393 Cuspclip' })).not.toHaveClass(
        'border-accent',
      ),
      // The check badge moved with the border: only the clicked thumb
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
      Command.resolve(SaveLutRecents, LutRecentsSaved()),
      Command.expectNone(),
    )
  })

  it('recents tab falls back to the first category when empty', () => {
    scene(
      sceneConfig,
      given({ ...selectedLut(), lutBarOpen: true, lutTab: 'recents' }),
      ...stageMounts,
      // Recents is empty: the tab is hidden and the first category is the
      // effective tab (content + highlight).
      sceneExpect(role('button', { name: 'Recents' })).toBeAbsent(),
      sceneExpect(role('button', { name: 'Print' })).toHaveClass('bg-panel-alt'),
      sceneExpect(role('button', { name: 'Apply Kodak 2393 Cuspclip' })).toExist(),
      sceneExpect(role('button', { name: 'Apply Agfa APX 100' })).toBeAbsent(),
      Command.expectNone(),
    )
  })

  it('bar thumbs show the vendored generic jpg until the per-photo preview lands', () => {
    const model = lutDraft()
    const bitmap = model.source.bitmap
    if (!bitmap) throw new Error('fixture: expected a bitmap')
    scene(
      sceneConfig,
      given(model),
      ...stageMounts,
      // No per-photo thumb yet: the vendored generic jpg shows.
      sceneExpect(role('img', { name: 'Kodak 2393 Cuspclip' })).toHaveAttr(
        'src',
        '/luts/thumbnails/print/kodak_2393_cuspclip.jpg',
      ),
      // Switch to Bw: generation fires, and the worker result swaps the
      // thumb to the per-photo URL.
      click(role('button', { name: 'Bw' })),
      Command.resolve(
        GenerateLutThumb,
        LutThumbGenerated({ lutId: lutBw, url: 'blob:photo', bitmap }),
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
      // The bar auto-opens with a LUT draft; the chevron on the drawer row
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
