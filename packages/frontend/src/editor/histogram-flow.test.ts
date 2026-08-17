import { describe, it, expect } from 'vitest'
import { Command, Mount, given, scene, selector, expect as sceneExpect } from 'foldkit/scene'
import { MockImageBitmap } from '../vitest-setup'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { Idle } from './phase'
import {
  RenderedFrame,
  HistogramComputed,
  ClearedImage,
  ScaledCanvas,
  CanvasRegistered,
} from './message'
import { PanZoom, RegisterCanvas } from './canvas-stage'
import { RenderHandle } from '../gpu/backend'

// ---- helpers ----

// SAFETY: fabricated GPU handle stub — the scene never executes GPU work, so only its type and the bins buffer identity flow through the model; the buffer has no backing storage.
const stubHandle = () =>
  // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
  new RenderHandle({} as GPUTexture, 200, 150, { buffer: {} as GPUBuffer, map: null })

// A model in the Idle phase (image loaded) so RenderedFrame lands.
const loadedModel = () => ({ ...initialModel(), phase: Idle() })

// ---- tests ----

describe('histogram flow', () => {
  it('dispatches ReadHistogram for a rendered frame and stores the handle', () => {
    const [model, commands] = update(
      loadedModel(),
      RenderedFrame({ handle: stubHandle(), stamp: 1 }),
    )
    expect(model.renderedStamp).toBe(1)
    expect(model.lastRender).not.toBeNull()
    expect(model.renderPending).toBe(false)
    expect(commands.some((c) => c.name === 'ReadHistogram')).toBe(true)
    expect(commands.some((c) => c.name === 'RenderChain')).toBe(false)
  })

  it('stores bins when the readback lands fresh', () => {
    const [withFrame] = update(loadedModel(), RenderedFrame({ handle: stubHandle(), stamp: 1 }))
    const bins = new Uint32Array(256)
    bins[128] = 42
    const [model] = update(withFrame, HistogramComputed({ bins, stamp: 1 }))
    expect(model.bins).toBe(bins)
  })

  it('drops bins that landed after a newer mutation', () => {
    const [withFrame] = update(loadedModel(), RenderedFrame({ handle: stubHandle(), stamp: 1 }))
    // A mutation bumped the revision to 2 while the readback was in flight.
    const newer = { ...withFrame, revision: 2 }
    const [model, commands] = update(
      newer,
      HistogramComputed({ bins: new Uint32Array(256), stamp: 1 }),
    )
    expect(model.bins).toBeNull()
    expect(commands).toHaveLength(0)
  })

  it('re-renders a stale frame but still consumes its bins buffer', () => {
    // The in-flight render's stamp (1) is older than the model revision (2):
    // a mutation arrived mid-render. The update re-renders with the newest
    // state and still dispatches ReadHistogram for the stale handle so its
    // per-render buffer is destroyed, not leaked.
    const model = {
      ...loadedModel(),
      revision: 2,
      source: { bitmap: new MockImageBitmap(200, 150), error: null, height: 150, width: 200 },
    }
    const [next, commands] = update(model, RenderedFrame({ handle: stubHandle(), stamp: 1 }))
    expect(next.lastRender).toBeNull()
    expect(next.renderPending).toBe(true)
    expect(commands.some((c) => c.name === 'RenderChain')).toBe(true)
    expect(commands.some((c) => c.name === 'ReadHistogram')).toBe(true)
    expect(commands.filter((c) => c.name === 'ReadHistogram')).toHaveLength(1)
  })

  it('resets bins when the image is cleared', () => {
    const [withFrame] = update(loadedModel(), RenderedFrame({ handle: stubHandle(), stamp: 1 }))
    const [withBins] = update(
      withFrame,
      HistogramComputed({ bins: new Uint32Array(256), stamp: 1 }),
    )
    expect(withBins.bins).not.toBeNull()
    const [cleared] = update(withBins, ClearedImage())
    expect(cleared.bins).toBeNull()
  })
})

// ---- overlay rendering (scene) ----

const sceneConfig = { update, view } as const

const loadedStageMounts = [
  Mount.resolve(PanZoom, ScaledCanvas({ offsetX: 0, offsetY: 0, scale: 1 })),
  Mount.resolve(RegisterCanvas, CanvasRegistered()),
]

describe('histogram overlay view', () => {
  it('renders the SVG overlay from the model bins', () => {
    const bins = new Uint32Array(256)
    bins.fill(10)
    bins[200] = 100
    scene(
      sceneConfig,
      given({
        ...initialModel(),
        bins,
        phase: Idle(),
        source: { bitmap: new MockImageBitmap(200, 150), error: null, height: 150, width: 200 },
      }),
      ...loadedStageMounts,
      sceneExpect(selector('svg polygon')).toExist(),
      sceneExpect(selector('svg polyline')).toExist(),
      Command.expectNone(),
    )
  })
})
