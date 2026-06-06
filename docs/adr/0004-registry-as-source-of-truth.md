# The layer registry is the single source of truth for everything per-layer

The v1 codebase had four parallel switches on `LayerType` (`createLayer`, `createSVs`, `formatLayerValue`, the `EditPanel` switch) and a hand-coded `Layer` / `LayerPatch` discriminated union in `types.ts`. Each new adjustment layer meant updating four switches, writing three boilerplate files (`shader.ts`, `view.tsx`, `params.tsx`), five type definitions, and a sixth array in `add-panel.tsx`. The boilerplate was nearly identical across layers (every `view.tsx` was 13 lines of `useDerivedValue` + `RuntimeShader`; every `params.tsx` was 30-40 lines of `Slider` plumbing), and the failure mode was silent: forgetting to add the new layer to one of the four switches compiled but produced a runtime miss.

The refactor collapsed all of it into **one table** — `layerRegistry` — and made everything else read from it.

## What the registry contains

```ts
export const layerRegistry = {
    exposure: {
        effect: exposureEffect,           // SkRuntimeEffect
        label: "Exposure",                 // header + grid cell
        fields: {                          // one per Slider
            stops: { default: 0, min: -3, max: 3, label: "EV", format: "ev" },
        },
        formatValue: (l) => formatEV(l.stops),  // Layers-panel summary
        params?: CustomParamsComponent,     // optional override
    },
    // ...
} as const satisfies Record<string, LayerEntry>;
```

A field is `{ default, min, max, step?, label, format }` where `format` is a preset (`"signed" | "ev" | "percent"`) or an inline `(v: number) => string`. The preset list is small; per-layer custom formatters (e.g. whiteBalance's Kelvin display) live in the entry.

## What derives from the registry

| Concern                | Source                                       |
|------------------------|----------------------------------------------|
| `Layer` / `LayerPatch` / `LayerSVs` unions | `keyof typeof layerRegistry` + distributive `K extends LayerType ? ... : never` |
| `LayerFor<K>` / `PatchFor<K>` / `SVsFor<K>` | same distributive shape per literal `K` |
| `createLayer(type)`    | iterate `entry.fields`, take `field.default` |
| `createSVs(layer)`     | iterate `entry.fields`, `makeMutable(...)`   |
| `<LayerFilter>`        | one shared component; takes `effect` + `keys` |
| `<Params>`             | one shared component; iterates `entry.fields`, renders one `Slider` per field |
| Add panel grid         | `Object.keys(layerRegistry)`                 |
| `formatLayerValue`     | dispatch to `entry.formatValue`              |

Adding a 10th adjustment is **one entry** in the registry (plus a shader file). Types, factory functions, UI, and grid follow automatically.

## How the type derivation works

```ts
type Entry<K extends LayerType> = LayerRegistry[K];

type LayerFor<K extends LayerType> = K extends LayerType
    ? { type: K; id: string; visible: boolean }
      & { [F in keyof Entry<K>["fields"]]: number }
    : never;
```

The `K extends LayerType ? ... : never` shape is **distributive** — `LayerFor<LayerType>` distributes over the union and produces a true union of per-layer types. Without it, `LayerFor<LayerType>` collapses into a single object whose `type` is the union and whose fields are the union of all field types, which breaks the patch flow (you can't narrow on `l.type` to know which fields exist).

`as const satisfies Record<string, LayerEntry>` keeps the narrow literal keys per entry; the indexed access `{ [F in keyof Entry<K>["fields"]]: number }` produces the right per-layer field map.

The one ergonomic concession: `LayerEntry.formatValue: (layer: any) => string`. The `any` widens the param so the registry can hold a heterogeneous map, which means per-entry bodies are type-checked only as `(any) => string` — the return type is enforced, but field accesses on `layer` are not. The narrow check happens at the call site: `formatLayerValue` is invoked with a concrete `Layer`, so the surrounding types catch mistakes like passing a non-Layer or reading a field that doesn't exist on the layer's runtime type. The alternative — a per-entry generic `LayerEntry<K>` with the narrow param baked in — would put a generic in the registry definition, which doesn't compose with the `Record<string, LayerEntry>` shape. One `as (l: Layer) => string` cast at the dispatcher is the trade-off.

## Related small decisions captured here

**Caller generates the layer; the store appends.** The chain store's `add` event takes `{ layer: Layer }`, not `{ layerType: LayerType }`. The editor calls `createLayer(type)` up front, dispatches `add` with the new layer, and uses the known id to send `SELECT_LAYER` — no `getSnapshot().context.layers.at(-1)` read-back at the call site, which would race with any future async add flow.

**`updateParams` trusts the type system at the call site.** The reducer's defensive `l.type !== event.patch.type` fallback is gone. The generic `Params` component constructs the patch with the right discriminant (the type checker enforces the match), and the spread `{ ...l, ...event.patch.patch }` is the one place the runtime is trusted over the type system (cast `as Layer`). The previous silent fallback hid a real bug class behind a no-op.

**`params` is a slot, not a requirement.** The `LayerEntry` has an optional `params` field for layers that need a custom UI in the future (e.g. an HSL adjustment with a color picker). The generic `Params` covers every layer today; the slot exists so a future override is a one-line change at the entry, not a structural change at the dispatch site.
