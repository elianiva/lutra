import { describe, it, expect } from 'vitest'
import {
  Command,
  Mount,
  click,
  given,
  role,
  scene,
  selector,
  label,
  all,
  expectAll,
  text,
  expect as sceneExpect,
} from 'foldkit/scene'
import { curvePointsOf, CURVE_X_EPS } from '@lutra/engine'
import { MockImageBitmap } from '../vitest-setup'
import { RenderHandle } from '../gpu/backend'
import { initialModel } from './model'
import { update } from './update'
import { view } from './view'
import { Idle } from './phase'
import {
  SelectedTool,
  ConfirmedDraft,
  CurvePointDragged,
  CurveReset,
  RenderedFrame,
  HistogramComputed,
  ScaledCanvas,
  CanvasRegistered,
} from './message'
import { PanZoom, RegisterCanvas } from './canvas-stage'
import { CurveWidget } from './tone-curve'
import { RenderChain, ReadHistogram } from './command'
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

/** A Tone Curve draft (Drafting phase, no render in flight). */
const curveDraft = () => settled(update(loaded(), SelectedTool({ type: 'toneCurve' }))[0])

/** A committed Tone Curve layer (Selected phase, no render in flight). */
const selectedCurve = () => settled(update(curveDraft(), ConfirmedDraft())[0])

const draftLayer = (model: Model) => (model.phase._tag === 'Drafting' ? model.phase.layer : null)

const pointsOf = (model: Model, index = 0) => curvePointsOf(model.chain[index]!)

const drag = (model: Model, index: number, x: number, y: number) =>
  update(model, CurvePointDragged({ index, x, y }))

// ---- update flow ----

describe('Tone Curve layer flow', () => {
  it('creates a Tone Curve draft as the identity curve', () => {
    const [model] = update(loaded(), SelectedTool({ type: 'toneCurve' }))
    expect(model.phase._tag).toBe('Drafting')
    const layer = draftLayer(model)
    expect(layer?.type).toBe('toneCurve')
    if (layer?.type === 'toneCurve') {
      expect(curvePointsOf(layer)).toEqual([
        { x: 0, y: 0 },
        { x: 0.25, y: 0.25 },
        { x: 0.5, y: 0.5 },
        { x: 0.75, y: 0.75 },
        { x: 1, y: 1 },
      ])
    }
  })

  it('a drag moves the draft point through the machine and re-renders', () => {
    // An S-curve start: pull the mid-lights point up.
    const [model, commands] = drag(curveDraft(), 3, 0.75, 0.9)
    expect(model.phase._tag).toBe('Drafting')
    const layer = draftLayer(model)
    if (layer?.type === 'toneCurve') {
      expect(curvePointsOf(layer)[3]).toEqual({ x: 0.75, y: 0.9 })
    }
    expect(commands.some((c) => c.name === 'RenderChain')).toBe(true)
  })

  it('a drag clamps the draft point between its neighbors', () => {
    const [withDraft] = update(loaded(), SelectedTool({ type: 'toneCurve' }))
    // Dragging p1 far right must stop before p2's x.
    const [model] = drag(withDraft, 1, 0.9, 0.5)
    const layer = draftLayer(model)
    if (layer?.type === 'toneCurve') {
      const points = curvePointsOf(layer)
      expect(points[1]!.x).toBeCloseTo(0.5 - CURVE_X_EPS, 6)
      expect(points[1]!.y).toBe(0.5)
      // The neighbors are untouched.
      expect(points[0]).toEqual({ x: 0, y: 0 })
      expect(points[2]).toEqual({ x: 0.5, y: 0.5 })
    }
  })

  it('confirm commits the moved curve to the chain', () => {
    const [withDraft] = drag(curveDraft(), 2, 0.5, 0.7)
    const [model] = update(withDraft, ConfirmedDraft())
    expect(model.chain).toHaveLength(1)
    expect(pointsOf(model)[2]).toEqual({ x: 0.5, y: 0.7 })
  })

  it('a drag on the focused chain layer updates it directly', () => {
    const [model] = drag(selectedCurve(), 2, 0.5, 0.7)
    expect(model.phase._tag).toBe('Selected')
    expect(pointsOf(model)[2]).toEqual({ x: 0.5, y: 0.7 })
  })

  it('reset returns the draft to the identity curve', () => {
    const [withDraft] = drag(curveDraft(), 2, 0.5, 0.7)
    const [model] = update(withDraft, CurveReset())
    const layer = draftLayer(model)
    if (layer?.type === 'toneCurve') {
      expect(curvePointsOf(layer)).toEqual([
        { x: 0, y: 0 },
        { x: 0.25, y: 0.25 },
        { x: 0.5, y: 0.5 },
        { x: 0.75, y: 0.75 },
        { x: 1, y: 1 },
      ])
    }
  })

  it('reset returns the committed layer to the identity curve', () => {
    const [withDrag] = drag(selectedCurve(), 0, 0, 0.1)
    const [model] = update(withDrag, CurveReset())
    expect(pointsOf(model)[0]).toEqual({ x: 0, y: 0 })
    expect(pointsOf(model)).toEqual([
      { x: 0, y: 0 },
      { x: 0.25, y: 0.25 },
      { x: 0.5, y: 0.5 },
      { x: 0.75, y: 0.75 },
      { x: 1, y: 1 },
    ])
  })

  it('drags and resets are ignored without a toneCurve target', () => {
    // No image / no selection: a stray drag changes nothing.
    const idleModel = loaded()
    const [idle, idleCommands] = drag(idleModel, 2, 0.5, 0.7)
    expect(idle).toBe(idleModel)
    expect(idleCommands).toHaveLength(0)

    // A non-curve selection is not a drag target either.
    const [withExposure] = update(loaded(), SelectedTool({ type: 'exposure' }))
    const [confirmed] = update(withExposure, ConfirmedDraft())
    const exposure = settled(confirmed)
    const [afterDrag, commands] = drag(exposure, 2, 0.5, 0.7)
    expect(afterDrag.chain[0]).toBe(exposure.chain[0])
    expect(commands).toHaveLength(0)

    const [afterReset] = update(afterDrag, CurveReset())
    expect(afterReset.chain[0]).toBe(exposure.chain[0])
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

describe('Tone Curve view', () => {
  it('renders the tool card with its copy', () => {
    scene(
      sceneConfig,
      given(loaded()),
      ...stageMounts,
      sceneExpect(role('button', { name: 'Add Tone Curve adjustment' })).toExist(),
      sceneExpect(
        text('Shapes brightness across the whole range with a draggable curve.'),
      ).toExist(),
      sceneExpect(text('Bend the tones — an S-curve, lifted blacks, or a custom grade.')).toExist(),
      Command.expectNone(),
    )
  })

  it('a draft shows the curve widget with 5 handles and no reset button', () => {
    scene(
      sceneConfig,
      given(curveDraft()),
      ...stageMounts,
      sceneExpect(label('Tone Curve draft')).toExist(),
      // The widget is the plot; the handles are its draggable points.
      sceneExpect(role('img', { name: 'Tone curve' })).toExist(),
      sceneExpect(selector('[data-curve-handle]')).toExist(),
      expectAll(all.selector('[data-curve-handle]')).toHaveCount(5),
      sceneExpect(text('Drag the points to shape the curve.')).toExist(),
      // A neutral curve has nothing to reset — the affordance is absent.
      // (Resolving the mount with a drag of p2 to its identity position is
      // a no-op — the curve stays neutral; the render it fires is resolved
      // below.)
      Mount.resolve(CurveWidget, CurvePointDragged({ index: 2, x: 0.5, y: 0.5 })),
      ...resolveRender(),
      sceneExpect(role('button', { name: 'Reset curve' })).toBeAbsent(),
      Command.expectNone(),
    )
  })

  it('a drag moves the point, draws the curve off the diagonal, and reveals the reset button', () => {
    scene(
      sceneConfig,
      given(curveDraft()),
      ...stageMounts,
      // The mount's drag emits unit-space positions; update clamps and
      // applies them (the point jumps to the grab position on down).
      Mount.resolve(CurveWidget, CurvePointDragged({ index: 2, x: 0.5, y: 0.7 })),
      ...resolveRender(),
      // The handle moved up to y = 0.7 (viewBox y is down: 100 - 67.6).
      sceneExpect(selector('[data-curve-handle="2"]')).toHaveAttr('cx', '50'),
      sceneExpect(selector('[data-curve-handle="2"]')).toHaveAttr('cy', '32.4'),
      // The curve now diverges from the dashed diagonal: reset is offered.
      sceneExpect(role('button', { name: 'Reset curve' })).toExist(),
      Command.expectNone(),
    )
  })

  it('the reset button returns the curve to the diagonal', () => {
    const dragged = settled(
      update(curveDraft(), CurvePointDragged({ index: 2, x: 0.5, y: 0.7 }))[0],
    )
    scene(
      sceneConfig,
      given(dragged),
      ...stageMounts,
      // Re-resolving the already-dragged point to the same position is a
      // no-op — the mount must be resolved, and this keeps the model as-is.
      // (The drag it fires re-renders; that render is resolved below.)
      Mount.resolve(CurveWidget, CurvePointDragged({ index: 2, x: 0.5, y: 0.7 })),
      ...resolveRender(),
      sceneExpect(role('button', { name: 'Reset curve' })).toExist(),
      click(role('button', { name: 'Reset curve' })),
      ...resolveRender(),
      sceneExpect(role('button', { name: 'Reset curve' })).toBeAbsent(),
      // The handle is back on the diagonal (cy = 100 - 50 = 50 at x = 0.5).
      sceneExpect(selector('[data-curve-handle="2"]')).toHaveAttr('cy', '50'),
      Command.expectNone(),
    )
  })

  it('a committed curve shows the widget when selected, with the Custom summary', () => {
    const withDrag = settled(
      update(selectedCurve(), CurvePointDragged({ index: 1, x: 0.3, y: 0.2 }))[0],
    )
    scene(
      sceneConfig,
      given(withDrag),
      ...stageMounts,
      // Resolving the mount with the same drag position keeps the curve as-is.
      Mount.resolve(CurveWidget, CurvePointDragged({ index: 1, x: 0.3, y: 0.2 })),
      ...resolveRender(),
      // The row summary reflects the moved curve; the widget is open.
      sceneExpect(text('Custom')).toExist(),
      sceneExpect(role('img', { name: 'Tone curve' })).toExist(),
      sceneExpect(role('button', { name: 'Reset curve' })).toExist(),
      Command.expectNone(),
    )
  })

  it('an untouched committed curve reads Neutral and shows no reset button', () => {
    scene(
      sceneConfig,
      given(selectedCurve()),
      ...stageMounts,
      // Resolve the mount with a drag of p2 to its identity position — the
      // curve is already neutral, so nothing changes (the render it fires
      // is resolved below).
      Mount.resolve(CurveWidget, CurvePointDragged({ index: 2, x: 0.5, y: 0.5 })),
      ...resolveRender(),
      sceneExpect(text('Neutral')).toExist(),
      sceneExpect(role('button', { name: 'Reset curve' })).toBeAbsent(),
      Command.expectNone(),
    )
  })
})
