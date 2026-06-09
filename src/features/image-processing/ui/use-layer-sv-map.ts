import { useRef } from "react";
import { makeMutable, type SharedValue } from "react-native-reanimated";

import { layerRegistry } from "../chain/registry";
import { type Layer } from "../chain/types";

// Editor-owned map of layerId → live shared values. One source of truth
// shared by Pipeline (renderer) and Params (slider). The map is held in a
// ref so the Editor doesn't re-render when SVs are touched. Each entry is
// created once (when the layer is added) and discarded when the layer is
// removed — Reanimated GC handles the SV lifetime. Values are synced from
// the chain store on every render so the UI-thread worklets always see the
// correct value from frame 1.
//
// The value type is a string-indexed SV record rather than the narrow
// `LayerSVs` union: callers (Pipeline uniforms binder, export image
// renderer) iterate field keys at runtime and need a uniform record
// shape. The narrow per-layer shape is still derivable from the
// registry when a type-checked narrow view is needed.
export type LayerSVMap = Map<string, Record<string, SharedValue<number>>>;

function createSVs(): Record<string, SharedValue<number>> {
	return {};
}

function syncSVs(layer: Layer, svs: Record<string, SharedValue<number>>): void {
	const entry = layerRegistry[layer.type];
	for (const [key] of Object.entries(entry.fields)) {
		const chainVal = (layer as unknown as Record<string, number>)[key];
		if (!svs[key]) {
			svs[key] = makeMutable(chainVal);
		} else if (svs[key].value !== chainVal) {
			// Recreate the SV with the chain-store value. Direct assignment
			// (sv.value = x) from the JS thread doesn't reliably propagate
			// to the UI thread in Reanimated 4, but `makeMutable` correctly
			// sets the initial value on both threads for a new SV.
			svs[key] = makeMutable(chainVal);
		}
	}
}

export function useLayerSVMap(layers: Layer[]): LayerSVMap {
	const map = useRef<LayerSVMap>(new Map());

	// Diff the chain store's layer list against the existing map. We do
	// this in the render path (not in a useEffect) because adding/removing
	// SVs is cheap and we want the map to be ready before the first
	// commit. New layers get SVs created on first encounter; values are
	// synced from the chain store on every render so the UI-thread worklets
	// always see the correct value.
	for (const layer of layers) {
		if (!map.current.has(layer.id)) {
			map.current.set(layer.id, createSVs());
		}
		syncSVs(layer, map.current.get(layer.id)!);
	}
	for (const id of Array.from(map.current.keys())) {
		if (!layers.find((l) => l.id === id)) {
			map.current.delete(id);
		}
	}

	return map.current;
}
