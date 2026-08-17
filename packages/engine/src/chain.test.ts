import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { createLayer, nextLayerId, makeRegistry, LAYER_TYPES } from './layers'
import type { Layer, LayerType } from './layers'
import { FieldKey } from './brands'
import { numField, strField } from './layers/fields'
import type { LayerFieldValue } from './layers/fields'
import type { LayerId } from './brands'
import {
  addLayer,
  removeLayer,
  reorderLayer,
  updateLayerParam,
  toggleLayerVisibility,
  replaceChain,
} from './chain'
import {
  renderExposure,
  renderContrast,
  renderShadows,
  renderHighlights,
  renderToneCurve,
  renderWhiteBalance,
  renderSaturation,
  renderColorMixer,
  renderGrain,
  renderVignette,
  renderChromaticAberration,
  renderClarity,
  renderLut,
} from './shaders'

// ---- helpers ----

const registry = makeRegistry({
  chromaticAberration: renderChromaticAberration,
  clarity: renderClarity,
  colorMixer: renderColorMixer,
  contrast: renderContrast,
  exposure: renderExposure,
  grain: renderGrain,
  highlights: renderHighlights,
  lut: renderLut,
  saturation: renderSaturation,
  shadows: renderShadows,
  toneCurve: renderToneCurve,
  vignette: renderVignette,
  whiteBalance: renderWhiteBalance,
})

/**
 * The documented per-type defaults — a product contract pinned
 * independently of the registry (a default drifting in the registry
 * fails the differential check).
 */
const DEFAULTS = {
  exposure: { stops: 0 },
  contrast: { amount: 0 },
  shadows: { amount: 0 },
  highlights: { amount: 0 },
  // The Tone Curve's 5 identity points (docs/adr/0028): the diagonal.
  toneCurve: {
    p0x: 0,
    p0y: 0,
    p1x: 0.25,
    p1y: 0.25,
    p2x: 0.5,
    p2y: 0.5,
    p3x: 0.75,
    p3y: 0.75,
    p4x: 1,
    p4y: 1,
  },
  whiteBalance: { temp: 0, tint: 0 },
  saturation: { amount: 0 },
  // The Color Mixer: 24 fields, all zeroed (identity).
  colorMixer: {
    aquaHue: 0,
    aquaLuminance: 0,
    aquaSaturation: 0,
    blueHue: 0,
    blueLuminance: 0,
    blueSaturation: 0,
    greenHue: 0,
    greenLuminance: 0,
    greenSaturation: 0,
    magentaHue: 0,
    magentaLuminance: 0,
    magentaSaturation: 0,
    orangeHue: 0,
    orangeLuminance: 0,
    orangeSaturation: 0,
    purpleHue: 0,
    purpleLuminance: 0,
    purpleSaturation: 0,
    redHue: 0,
    redLuminance: 0,
    redSaturation: 0,
    yellowHue: 0,
    yellowLuminance: 0,
    yellowSaturation: 0,
  },
  grain: { blur: 0, size: 0, texture: 0 },
  vignette: { amount: 0, size: 0.6 },
  chromaticAberration: { amount: 0 },
  clarity: { amount: 0 },
  lut: { amount: 1 },
} satisfies Record<LayerType, Record<string, number>>

const typeArb = fc.constantFrom(...LAYER_TYPES)

// ---- model-based chain operations ----

/** The simplified reference model: what the chain must look like. */
interface ModelLayer {
  readonly id: LayerId
  readonly type: LayerType
  readonly visible: boolean
  readonly params: Record<string, number>
  /** String-typed fields (e.g. the LUT layer's lutId reference). */
  readonly strings: Record<string, string>
}

interface ChainModel {
  chain: ModelLayer[]
}

interface ChainReal {
  chain: Layer[]
}

/** Map a real layer into the model shape (used only to read the ids). */
const toModelLayer = (layer: Layer): ModelLayer => {
  const params: Record<string, number> = {}
  const strings: Record<string, string> = {}
  for (const key of Object.keys(registry[layer.type].fields)) {
    params[key] = numField(layer, FieldKey(key))
  }
  for (const key of Object.keys(registry[layer.type].stringFields ?? {})) {
    strings[key] = strField(layer, FieldKey(key))
  }
  return { id: layer.id, params, strings, type: layer.type, visible: layer.visible }
}

/** The differential invariant: model and real chains agree on every step. */
const expectModelMatches = (model: ChainModel, real: ChainReal): void => {
  expect(model.chain).toHaveLength(real.chain.length)
  for (let i = 0; i < model.chain.length; i++) {
    const m = model.chain[i]!
    const r = real.chain[i]!
    expect(r.id).toBe(m.id)
    expect(r.type).toBe(m.type)
    expect(r.visible).toBe(m.visible)
    for (const [key, value] of Object.entries(m.params)) {
      expect(numField(r, FieldKey(key)), `param ${key} of ${m.type}`).toBe(value)
    }
    for (const [key, value] of Object.entries(m.strings)) {
      expect(strField(r, FieldKey(key))).toBe(value)
    }
  }
}

/** Snapshot the observable state of a chain (for the immutability checks). */
const snapshot = (chain: readonly Layer[]) =>
  chain.map((l) => {
    const record: Record<string, LayerFieldValue> = l
    return {
      fields: Object.entries(record),
      id: l.id,
      type: l.type,
      visible: l.visible,
    }
  })

class AddLayer implements fc.Command<ChainModel, ChainReal> {
  constructor(readonly type: LayerType) {}
  check(): boolean {
    return true
  }
  run(model: ChainModel, real: ChainReal): void {
    const before = snapshot(real.chain)
    const result = addLayer(real.chain, this.type, registry)
    // The op is pure: the input chain is untouched.
    expect(snapshot(real.chain)).toEqual(before)
    const created = result.at(-1)!
    // The new layer pins the documented defaults.
    expect(created.type).toBe(this.type)
    expect(created.visible).toBe(true)
    for (const [key, expected] of Object.entries(DEFAULTS[this.type])) {
      expect(numField(created, FieldKey(key))).toBe(expected)
    }
    real.chain = result
    model.chain = [...model.chain, toModelLayer(created)]
  }
  toString(): string {
    return `AddLayer(${this.type})`
  }
}

type Target = 'first' | 'middle' | 'last' | 'missing'

const targetArb: fc.Arbitrary<Target> = fc.constantFrom('first', 'middle', 'last', 'missing')

/** Pick the target id deterministically from the current model chain. */
const pickId = (model: ChainModel, target: Target): LayerId => {
  if (model.chain.length === 0 || target === 'missing') {
    return nextLayerId()
  }
  const idx =
    target === 'first'
      ? 0
      : target === 'last'
        ? model.chain.length - 1
        : Math.floor(model.chain.length / 2)
  return model.chain[idx]!.id
}

class RemoveLayer implements fc.Command<ChainModel, ChainReal> {
  constructor(readonly target: Target) {}
  check(): boolean {
    return true
  }
  run(model: ChainModel, real: ChainReal): void {
    const id = pickId(model, this.target)
    const input = real.chain
    const before = snapshot(input)
    real.chain = removeLayer(input, id)
    // The op is pure: the input chain is untouched.
    expect(snapshot(input)).toEqual(before)
    model.chain = model.chain.filter((l) => l.id !== id)
    expectModelMatches(model, real)
  }
  toString(): string {
    return `RemoveLayer(${this.target})`
  }
}

class ReorderLayer implements fc.Command<ChainModel, ChainReal> {
  constructor(
    readonly target: Target,
    readonly newIndex: number,
  ) {}
  check(): boolean {
    return true
  }
  run(model: ChainModel, real: ChainReal): void {
    const id = pickId(model, this.target)
    const input = real.chain
    const before = snapshot(input)
    real.chain = reorderLayer(input, id, this.newIndex)
    // The op is pure: the input chain is untouched.
    expect(snapshot(input)).toEqual(before)

    // Model semantics: splice the layer to newIndex, unless the index is
    // out of range or the id is absent — both are no-ops.
    if (this.newIndex >= 0 && this.newIndex < model.chain.length) {
      const idx = model.chain.findIndex((l) => l.id === id)
      if (idx !== -1) {
        const [moved] = model.chain.splice(idx, 1)
        model.chain.splice(this.newIndex, 0, moved!)
      }
    }
    expectModelMatches(model, real)
  }
  toString(): string {
    return `ReorderLayer(${this.target}, ${this.newIndex})`
  }
}

class ToggleVisibility implements fc.Command<ChainModel, ChainReal> {
  constructor(readonly target: Target) {}
  check(): boolean {
    return true
  }
  run(model: ChainModel, real: ChainReal): void {
    const input = real.chain
    const before = snapshot(input)
    const id = pickId(model, this.target)
    real.chain = toggleLayerVisibility(input, id)
    // The op is pure: the input chain is untouched.
    expect(snapshot(input)).toEqual(before)
    model.chain = model.chain.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
    expectModelMatches(model, real)
  }
  toString(): string {
    return `ToggleVisibility(${this.target})`
  }
}

/** A param patch: which key of which type, and a generated value. */
class UpdateParam implements fc.Command<ChainModel, ChainReal> {
  constructor(
    readonly type: LayerType,
    readonly key: string,
    readonly value: number,
  ) {}
  check(): boolean {
    return true
  }
  run(model: ChainModel, real: ChainReal): void {
    const input = real.chain
    const before = snapshot(input)
    // SAFETY: the patch value is a free-form JSON field of the layer params; `never` bypasses the union exhaustiveness check a literal cannot satisfy.
    real.chain = updateLayerParam(input, {
      type: this.type,
      // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion, no-chained-type-assertions
      patch: { [this.key]: this.value } as never,
    })
    // The op is pure: the input chain is untouched.
    expect(snapshot(input)).toEqual(before)

    // Model semantics: the FIRST layer of the type gets the patch; a type
    // with no layer is a no-op.
    const idx = model.chain.findIndex((l) => l.type === this.type)
    if (idx !== -1) {
      const layer = model.chain[idx]!
      model.chain[idx] = {
        ...layer,
        params: { ...layer.params, [this.key]: this.value },
      }
    }
    expectModelMatches(model, real)
  }
  toString(): string {
    return `UpdateParam(${this.type}.${this.key} = ${this.value})`
  }
}

/** One command per layer type, with a random field key and value. */
const updateParamArb = fc
  .tuple(typeArb, fc.nat(2), fc.double({ max: 2, min: -2, noDefaultInfinity: true, noNaN: true }))
  .map(([type, keyIdx, value]) => {
    const keys = Object.keys(registry[type].fields)
    return new UpdateParam(type, keys[Math.min(keyIdx, keys.length - 1)]!, value)
  })

const allCommands = fc.commands(
  [
    typeArb.map((type) => new AddLayer(type)),
    targetArb.map((target) => new RemoveLayer(target)),
    fc
      .tuple(targetArb, fc.integer({ max: 10, min: -3 }))
      .map(([target, i]) => new ReorderLayer(target, i)),
    targetArb.map((target) => new ToggleVisibility(target)),
    updateParamArb,
  ],
  { maxCommands: 80 },
)

// ---- tests ----

describe('createLayer', () => {
  it('creates every layer type with the documented defaults', () => {
    // The defaults are a product contract (e.g. vignette size 0.6, LUT
    // amount 1 = full apply), so the property ranges over every type.
    fc.assert(
      fc.property(typeArb, (type) => {
        const layer = createLayer(type, registry)
        expect(layer.type).toBe(type)
        expect(layer.visible).toBe(true)
        for (const [key, expected] of Object.entries(DEFAULTS[type])) {
          expect(numField(layer, FieldKey(key))).toBe(expected)
        }
        // String-typed fields get their registry defaults (LUT id empty).
        for (const [key, expected] of Object.entries(registry[type].stringFields ?? {})) {
          expect(strField(layer, FieldKey(key))).toBe(expected)
        }
      }),
    )
  })

  it('assigns a unique id to every layer in any sequence of creates', () => {
    fc.assert(
      fc.property(fc.array(typeArb, { maxLength: 20, minLength: 2 }), (types) => {
        const ids = types.map((t) => createLayer(t, registry).id)
        expect(new Set(ids).size).toBe(ids.length)
      }),
    )
  })

  it('throws on any unknown type', () => {
    // The registry is a closed union; the test needs a deliberately-typed
    // escape hatch to feed a string the registry cannot contain.
    const layerTypeNames: readonly string[] = LAYER_TYPES
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => !layerTypeNames.includes(s)),
        (type) => {
          // SAFETY: the fast-check filter proved the string is not a LayerType name, so createLayer must reject it.
          // oxlint-disable-next-line consistent-type-assertions, no-unsafe-type-assertion
          expect(() => createLayer(type as LayerType, registry)).toThrow()
        },
      ),
    )
  })
})

describe('chain operations (model-based)', () => {
  it('matches the reference model under any command sequence', () => {
    fc.assert(
      fc.property(allCommands, (cmds) => {
        fc.modelRun(
          () => ({
            model: { chain: [] satisfies ModelLayer[] },
            real: { chain: [] satisfies Layer[] },
          }),
          cmds,
        )
      }),
    )
  })

  it('replaceChain returns exactly the given layers', () => {
    fc.assert(
      fc.property(
        fc
          .array(typeArb, { maxLength: 8, minLength: 0 })
          .map((types) => types.map((t) => createLayer(t, registry))),
        (layers) => {
          const result = replaceChain([], layers)
          expect(result).toEqual(layers)
          expect(result).not.toBe(layers)
        },
      ),
    )
  })
})
