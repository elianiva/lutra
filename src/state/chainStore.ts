import { createStore } from "@xstate/store";
import type { Layer, LayerType } from "../layers/types";
import { createLayer } from "../layers/defaults";

type ChainContext = { layers: Layer[] };

// Per-layer param patches. Widens to a discriminated union as more layer types
// land — the reducer only merges keys the target layer actually owns, so a
// too-wide patch is a type bug, not a runtime bug.
type LayerPatch = Partial<{ stops: number }>;

export const chainStore = createStore({
  context: { layers: [] as Layer[] },
  on: {
    add: (context, event: { layerType: LayerType }) => ({
      layers: [...context.layers, createLayer(event.layerType)],
    }),
    remove: (context, event: { id: string }) => ({
      layers: context.layers.filter((l) => l.id !== event.id),
    }),
    updateParams: (
      context,
      event: { id: string; patch: LayerPatch },
    ) => ({
      layers: context.layers.map((l) =>
        l.id === event.id ? { ...l, ...event.patch } : l,
      ),
    }),
  },
});
