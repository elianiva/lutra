import { type SharedValue } from "react-native-reanimated";

import { type LayerRegistry, type LayerType } from "./registry";

// All shapes below are derived from `layerRegistry` — adding a new layer or
// a new field on a layer updates these unions automatically. The
// `K extends LayerType ? ... : never` shape makes each helper
// distributive: `LayerFor<LayerType>` distributes over the union and gives
// us the full Layer union, not a single object with a union of fields.

type Entry<K extends LayerType> = LayerRegistry[K];

// The per-layer concrete shape: discriminant + common fields + every
// registry field typed as number.
export type LayerFor<K extends LayerType> = K extends LayerType
	? { type: K; id: string; visible: boolean } & { [F in keyof Entry<K>["fields"]]: number }
	: never;

export type Layer = LayerFor<LayerType>;

// The per-layer patch: which fields the consumer is allowed to update.
// The store reducer relies on the patch discriminator matching the layer
// type to apply a safe spread.
export type PatchFor<K extends LayerType> = K extends LayerType
	? {
			type: K;
			patch: Partial<{ [F in keyof Entry<K>["fields"]]: number }>;
		}
	: never;

export type LayerPatch = PatchFor<LayerType>;

// Live shared values, one per registry field. The renderer (Pipeline)
// reads these inside `useDerivedValue`; the editor (Slider) writes them on
// drag; the store commits the final value on release.
export type SVsFor<K extends LayerType> = K extends LayerType
	? { [F in keyof Entry<K>["fields"]]: SharedValue<number> }
	: never;

export type LayerSVs = SVsFor<LayerType>;
