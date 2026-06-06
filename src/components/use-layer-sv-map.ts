import { useRef } from "react";
import { makeMutable, type SharedValue } from "react-native-reanimated";

import { type FieldDef } from "../layers/format";
import { layerRegistry } from "../layers/registry";
import { type Layer, type LayerSVs } from "../layers/types";

// Editor-owned map of layerId → live shared values. One source of truth
// shared by Pipeline (renderer) and Params (slider). The map is held in a
// ref so the Editor doesn't re-render when SVs are touched. Each entry is
// created once (when the layer is added) and discarded when the layer is
// removed — Reanimated GC handles the SV lifetime.
export type LayerSVMap = Map<string, LayerSVs>;

function createSVs(layer: Layer): LayerSVs {
	const entry = layerRegistry[layer.type];
	const svs = {} as Record<string, SharedValue<number>>;
	for (const [key] of Object.entries(entry.fields) as [string, FieldDef][]) {
		svs[key] = makeMutable((layer as unknown as Record<string, number>)[key]);
	}
	return svs as LayerSVs;
}

export function useLayerSVMap(layers: Layer[]): LayerSVMap {
	const map = useRef<LayerSVMap>(new Map());

	// Diff the chain store's layer list against the existing map. We do
	// this in the render path (not in a useEffect) because adding/removing
	// SVs is cheap and we want the map to be ready before the first
	// commit. New layers get SVs initialized to the chain store's value;
	// removed layers are dropped.
	for (const layer of layers) {
		if (!map.current.has(layer.id)) {
			map.current.set(layer.id, createSVs(layer));
		}
	}
	for (const id of Array.from(map.current.keys())) {
		if (!layers.find((l) => l.id === id)) {
			map.current.delete(id);
		}
	}

	return map.current;
}
