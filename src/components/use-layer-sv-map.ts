import { useRef } from "react";
import { makeMutable, type SharedValue } from "react-native-reanimated";

import { type Layer, type SVsFor, type LayerType } from "../layers/types";

// Editor-owned map of layerId → live shared values. One source of truth
// shared by Pipeline (renderer) and EditPanel (slider). The map is held in
// a ref so the Editor doesn't re-render when SVs are touched. Each entry
// is created once (when the layer is added) and discarded when the layer
// is removed — Reanimated GC handles the SV lifetime.
type SVsByType = {
	[K in LayerType]: SVsFor<K>;
};

export type LayerSVMap = Map<string, SVsByType[LayerType]>;

function createSVs(layer: Layer): SVsByType[LayerType] {
	switch (layer.type) {
		case "exposure":
			return { stops: makeMutable(layer.stops) };
		case "contrast":
			return { amount: makeMutable(layer.amount) };
		case "shadows":
			return {
				shadows: makeMutable(layer.shadows),
				highlights: makeMutable(layer.highlights),
			};
		case "whiteBalance":
			return {
				temp: makeMutable(layer.temp),
				tint: makeMutable(layer.tint),
			};
		case "saturation":
			return { amount: makeMutable(layer.amount) };
	}
}

export function useLayerSVMap(layers: Layer[]): LayerSVMap {
	const map = useRef<LayerSVMap>(new Map());

	// Diff the chain store's layer list against the existing map. We do this
	// in the render path (not in a useEffect) because adding/removing SVs is
	// cheap and we want the map to be ready before the first commit. New
	// layers get SVs initialized to the chain store's value; removed layers
	// are dropped.
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

// Helper for tests / future use: type-safe SV getter.
export function getSVs<K extends LayerType>(
	map: LayerSVMap,
	id: string,
	type: K,
): SVsFor<K> | undefined {
	const sv = map.get(id);
	if (!sv) return undefined;
	// The map stores a union; the caller knows the expected type.
	return sv as unknown as SVsFor<K>;
}

// Re-export the SharedValue type for convenience in callers.
export type { SharedValue };
