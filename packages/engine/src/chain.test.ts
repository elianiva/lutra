import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { createLayer, nextLayerId, makeRegistry, LAYER_TYPES } from './layers'
import type { Layer, LayerType } from './layers'
import { FieldKey } from './brands'
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
  exposure: renderExposure,
  contrast: renderContrast,
  shadows: renderShadows,
  highlights: renderHighlights,
  whiteBalance: renderWhiteBalance,
  saturation: renderSaturation,
  colorMixer: renderColorMixer,
  grain: renderGrain,
  vignette: renderVignette,
  chromaticAberration: renderChromaticAberration,
  clarity: renderClarity,
  lut: renderLut,
})

/** Read a numeric field from a layer, typed as unknown→number. */
function field(layer: Layer, key: FieldKey): number {
  const record: Record<string, unknown> = layer
  const value = record[key]
  return typeof value === 'number' ? value : NaN
}

/**
 * The documented per-type defaults — a product contract pinned
 * independently of the registry (a default drifting in the registry
 * fails the differential check).
 */
const DEFAULTS: Record<LayerType, Record<string, number>> = {
  exposure: { stops: 0 },
  contrast: { amount: 0 },
  shadows: { amount: 0 },
  highlights: { amount: 0 },
  whiteBalance: { temp: 0, tint: 0 },
  saturation: { amount: 0 },
  // The Color Mixer: 24 fields, all zeroed (identity).
  colorMixer: {
    redHue: 0,
    redSaturation: 0,
    redLuminance: 0,
    orangeHue: 0,
    orangeSaturation: 0,
    orangeLuminance: 0,
    yellowHue: 0,
    yellowSaturation: 0,
    yellowLuminance: 0,
    greenHue: 0,
    greenSaturation: 0,
    greenLuminance: 0,
    aquaHue: 0,
    aquaSaturation: 0,
    aquaLuminance: 0,
    blueHue: 0,
    blueSaturation: 0,
    blueLuminance: 0,
    purpleHue: 0,
    purpleSaturation: 0,
    purpleLuminance: 0,
    magentaHue: 0,
    magentaSaturation: 0,
    magentaLuminance: 0,
  },
  grain: { texture: 0, size: 0, blur: 0 },
  vignette: { amount: 0, size: 0.6 },
  chromaticAberration: { amount: 0 },
  clarity: { amount: 0 },
  lut: { amount: 1 },
}

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
    params[key] = field(layer, FieldKey(key))
  }
  for (const key of Object.keys(registry[layer.type].stringFields ?? {})) {
    const record: Record<string, unknown> = layer
    strings[key] = String(record[key])
  }
  return { id: layer.id, type: layer.type, visible: layer.visible, params, strings }
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
      expect(field(r, FieldKey(key)), `param ${key} of ${m.type}`).toBe(value)
    }
    for (const [key, value] of Object.entries(m.strings)) {
      const record: Record<string, unknown> = r
      expect(record[key]).toBe(value)
    }
  }
}

/** Snapshot the observable state of a chain (for the immutability checks). */
const snapshot = (chain: ReadonlyArray<Layer>) =>
  chain.map((l) => {
    const record: Record<string, unknown> = l
    return {
      id: l.id,
      type: l.type,
      visible: l.visible,
      fields: Object.entries(record),
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
    const created = result[result.length - 1]!
    // The new layer pins the documented defaults.
    expect(created.type).toBe(this.type)
    expect(created.visible).toBe(true)
    for (const [key, expected] of Object.entries(DEFAULTS[this.type])) {
      expect(field(created, FieldKey(key))).toBe(expected)
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
  if (model.chain.length === 0 || target === 'missing') return nextLayerId()
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
    real.chain = updateLayerParam(input, {
      type: this.type,
      // oxlint-disable-next-line consistent-type-assertions
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
  .tuple(typeArb, fc.nat(2), fc.double({ min: -2, max: 2, noNaN: true, noDefaultInfinity: true }))
  .map(([type, keyIdx, value]) => {
    const keys = Object.keys(registry[type].fields)
    return new UpdateParam(type, keys[Math.min(keyIdx, keys.length - 1)]!, value)
  })

const allCommands = fc.commands(
  [
    typeArb.map((type) => new AddLayer(type)),
    targetArb.map((target) => new RemoveLayer(target)),
    fc
      .tuple(targetArb, fc.integer({ min: -3, max: 10 }))
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
          expect(field(layer, FieldKey(key))).toBe(expected)
        }
        // String-typed fields get their registry defaults (LUT id empty).
        for (const [key, expected] of Object.entries(registry[type].stringFields ?? {})) {
          const record: Record<string, unknown> = layer
          expect(record[key]).toBe(expected)
        }
      }),
    )
  })

  it('assigns a unique id to every layer in any sequence of creates', () => {
    fc.assert(
      fc.property(fc.array(typeArb, { minLength: 2, maxLength: 20 }), (types) => {
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
          // oxlint-disable-next-line consistent-type-assertions -- a string that the filter proved is not a LayerType
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
          .array(typeArb, { minLength: 0, maxLength: 8 })
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
