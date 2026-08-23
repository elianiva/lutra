import { describe, it, expect } from 'vitest'
import { Effect } from 'effect'
import * as fc from 'fast-check'
import { Command, Mount, given, scene, selector, label, expect as sceneExpect } from 'foldkit/scene'
import { MockImageBitmap } from '../vitest-setup'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { Idle } from './phase'
import { EditorMessage } from './message'
import { PanZoom, RegisterCanvas, CompareDivider } from './canvas-stage'
import { createLayerFor, PresentFrame } from './command'

// ---- helpers ----

/** A model with an image loaded (Idle phase) so compare messages land. */
const loadedModel = () => ({
  ...initialModel(),
  phase: Idle(),
  source: { bitmap: new MockImageBitmap(200, 150), error: null, height: 150, width: 200 },
})

/** The compare presentation state on a dispatched PresentFrame, if any. */
interface PresentArgs {
  readonly present?: {
    readonly mode: string
    readonly showBefore: boolean
    readonly splitAt: number
  }
}
const presented = (commands: readonly { readonly name: string; readonly args?: PresentArgs }[]) =>
  commands.find((c) => c.name === 'PresentFrame')?.args?.present

// ---- update flow ----

describe('compare flow', () => {
  it('entering Toggle reveals the source and presents without rendering', () => {
    const [model, commands] = update(
      loadedModel(),
      EditorMessage.ChangedCompareMode({ mode: 'toggle' }),
    )
    expect(model.compareMode).toBe('toggle')
    expect(model.compareToggleBefore).toBe(true)
    expect(commands.some((c) => c.name === 'PresentFrame')).toBe(true)
    expect(commands.some((c) => c.name === 'RenderChain')).toBe(false)
    expect(presented(commands)).toEqual({ mode: 'toggle', showBefore: true, splitAt: 0.5 })
  })

  it('clicking the active Toggle segment flips back to the graded output', () => {
    const [toggled] = update(loadedModel(), EditorMessage.ChangedCompareMode({ mode: 'toggle' }))
    const [model, commands] = update(toggled, EditorMessage.ChangedCompareMode({ mode: 'toggle' }))
    expect(model.compareMode).toBe('toggle')
    expect(model.compareToggleBefore).toBe(false)
    expect(presented(commands)).toEqual({ mode: 'toggle', showBefore: false, splitAt: 0.5 })
  })

  it('switching modes keeps the split position and shows the graded side', () => {
    const [split] = update(loadedModel(), EditorMessage.ChangedCompareMode({ mode: 'split' }))
    const [moved] = update(split, EditorMessage.ChangedSplitPosition({ position: 0.3 }))
    const [model] = update(moved, EditorMessage.ChangedCompareMode({ mode: 'off' }))
    expect(model.compareMode).toBe('off')
    expect(model.compareSplitAt).toBe(0.3)
  })

  it('clamps any split position into [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.double({ max: 1_000_000, min: -1_000_000, noDefaultInfinity: true, noNaN: true }),
        (position) => {
          const [model] = update(loadedModel(), EditorMessage.ChangedSplitPosition({ position }))
          expect(model.compareSplitAt).toBeGreaterThanOrEqual(0)
          expect(model.compareSplitAt).toBeLessThanOrEqual(1)
          // Positions already in range pass through untouched (-0 clamps to +0,
          // which is the same value).
          if (position >= 0 && position <= 1) {
            expect(model.compareSplitAt).toBe(position || 0)
          }
        },
      ),
    )
  })

  it('does not present without an image', () => {
    const [model, commands] = update(
      initialModel(),
      EditorMessage.ChangedCompareMode({ mode: 'split' }),
    )
    expect(model.compareMode).toBe('off')
    expect(commands).toHaveLength(0)
  })

  it('a new image resets the split position but keeps the mode', () => {
    const [split] = update(loadedModel(), EditorMessage.ChangedCompareMode({ mode: 'split' }))
    const [moved] = update(split, EditorMessage.ChangedSplitPosition({ position: 0.7 }))
    const [cleared] = update(moved, EditorMessage.ClearedImage())
    expect(cleared.compareMode).toBe('split')
    expect(cleared.compareSplitAt).toBe(0.5)
  })

  it('carries the compare state into every chain render', () => {
    const [split] = update(loadedModel(), EditorMessage.ChangedCompareMode({ mode: 'split' }))
    const [moved] = update(split, EditorMessage.ChangedSplitPosition({ position: 0.3 }))
    const [toggled] = update(moved, EditorMessage.ChangedCompareMode({ mode: 'toggle' }))
    const [, commands] = update(
      toggled,
      EditorMessage.RemovedLayer({ id: Effect.runSync(createLayerFor('exposure')).id }),
    )
    const render = commands.find((c) => c.name === 'RenderChain')
    expect(render?.args?.present).toEqual({
      mode: 'toggle',
      showBefore: true,
      splitAt: 0.3,
    })
  })
})

// ---- view (scene) ----

const sceneConfig = { update, view } as const

const loadedStageMounts = [
  Mount.resolve(PanZoom, EditorMessage.ScaledCanvas({ offsetX: 0, offsetY: 0, scale: 1 })),
  Mount.resolve(RegisterCanvas, EditorMessage.CanvasRegistered()),
]

describe('compare control view', () => {
  it('renders the four mode segments', () => {
    scene(
      sceneConfig,
      given({
        ...initialModel(),
        phase: Idle(),
        source: { bitmap: new MockImageBitmap(200, 150), error: null, height: 150, width: 200 },
      }),
      ...loadedStageMounts,
      sceneExpect(label('Off')).toExist(),
      sceneExpect(label('Toggle')).toExist(),
      sceneExpect(label('Split')).toExist(),
      sceneExpect(label('Side by side')).toExist(),
      // Off is active by default.
      sceneExpect(label('Off')).toHaveClass('bg-accent'),
      Command.expectNone(),
    )
  })

  it('renders the control dimmed without an image', () => {
    scene(
      sceneConfig,
      given(initialModel()),
      sceneExpect(label('Split')).toExist(),
      // Without an image the control is inert.
      sceneExpect(label('Split')).toBeDisabled(),
      Command.expectNone(),
    )
  })

  it('doubles the canvas width in Side by side mode so neither side is stretched', () => {
    scene(
      sceneConfig,
      given({
        ...initialModel(),
        compareMode: 'side-by-side',
        phase: Idle(),
        source: { bitmap: new MockImageBitmap(200, 150), error: null, height: 150, width: 200 },
      }),
      ...loadedStageMounts,
      // The canvas is 2× the image width: each half shows its image at
      // native resolution (source left, graded right) instead of squeezing
      // both into the image-sized canvas.
      sceneExpect(selector('#lutra-canvas')).toHaveAttr('width', '400'),
      sceneExpect(selector('#lutra-canvas')).toHaveAttr('height', '150'),
      Command.expectNone(),
    )
  })

  it('keeps the canvas at image size outside Side by side', () => {
    scene(
      sceneConfig,
      given({
        ...initialModel(),
        compareMode: 'split',
        phase: Idle(),
        source: { bitmap: new MockImageBitmap(200, 150), error: null, height: 150, width: 200 },
      }),
      ...loadedStageMounts,
      Mount.resolve(CompareDivider, EditorMessage.ChangedSplitPosition({ position: 0.5 })),
      Command.resolve(PresentFrame, EditorMessage.FramePresented()),
      sceneExpect(selector('#lutra-canvas')).toHaveAttr('width', '200'),
      sceneExpect(selector('#lutra-canvas')).toHaveAttr('height', '150'),
      Command.expectNone(),
    )
  })

  it('renders the divider in Split mode at the split position', () => {
    scene(
      sceneConfig,
      given({
        ...initialModel(),
        compareMode: 'split',
        compareSplitAt: 0.3,
        phase: Idle(),
        source: { bitmap: new MockImageBitmap(200, 150), error: null, height: 150, width: 200 },
      }),
      ...loadedStageMounts,
      // Resolving the mount feeds its message through update, which
      // dispatches the blit-only PresentFrame — resolve that too.
      Mount.resolve(CompareDivider, EditorMessage.ChangedSplitPosition({ position: 0.3 })),
      Command.resolve(PresentFrame, EditorMessage.FramePresented()),
      sceneExpect(selector('[data-compare-divider]')).toExist(),
      // The divider sits at the split position, in image space.
      sceneExpect(selector('[data-compare-divider]')).toHaveStyle('left', '30%'),
      // Counter-scaled by the zoom: at scale 1 the grab strip is 12px, so
      // it stays a constant screen size (and grabbable) when zoomed out.
      sceneExpect(selector('[data-compare-divider]')).toHaveStyle('width', '12px'),
      Command.expectNone(),
    )
  })

  it('counter-scales the divider so its screen size is constant under zoom', () => {
    scene(
      sceneConfig,
      given({
        ...initialModel(),
        compareMode: 'split',
        compareSplitAt: 0.3,
        phase: Idle(),
        source: { bitmap: new MockImageBitmap(200, 150), error: null, height: 150, width: 200 },
      }),
      // The zoomed view comes from the PanZoom mount, like a real stage
      // measure: a 2× scale lands in the model and flows into the divider.
      Mount.resolve(PanZoom, EditorMessage.ScaledCanvas({ offsetX: 0, offsetY: 0, scale: 2 })),
      Mount.resolve(RegisterCanvas, EditorMessage.CanvasRegistered()),
      Mount.resolve(CompareDivider, EditorMessage.ChangedSplitPosition({ position: 0.3 })),
      Command.resolve(PresentFrame, EditorMessage.FramePresented()),
      // Half the layout size (12px / scale) — same ~12px on screen.
      sceneExpect(selector('[data-compare-divider]')).toHaveStyle('width', '6px'),
      sceneExpect(selector('[data-compare-divider]')).toHaveStyle('left', '30%'),
      Command.expectNone(),
    )
  })
})
