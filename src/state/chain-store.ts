import { createStore } from "@xstate/store";

import { createLayer } from "../layers/defaults";
import { type Layer, type LayerPatch, type LayerType } from "../layers/types";

export const chainStore = createStore({
	context: { layers: [] as Layer[] },
	on: {
		add: (context, event: { layerType: LayerType }) => ({
			layers: [...context.layers, createLayer(event.layerType)],
		}),
		remove: (context, event: { id: string }) => ({
			layers: context.layers.filter((l) => l.id !== event.id),
		}),
		// Discriminated patch: event.patch.type must equal the target layer's
		// type. Reducer ignores mismatches rather than crashing.
		updateParams: (context, event: { id: string; patch: LayerPatch }) => ({
			layers: context.layers.map((l) => {
				if (l.id !== event.id) return l;
				if (l.type !== event.patch.type) return l;
				return { ...l, ...event.patch.patch } as Layer;
			}),
		}),
		reorder: (context, event: { from: number; to: number }) => {
			if (event.from === event.to) return;
			const next = [...context.layers];
			const [moved] = next.splice(event.from, 1);
			next.splice(event.to, 0, moved);
			return { layers: next };
		},
		toggleVisible: (context, event: { id: string }) => ({
			layers: context.layers.map((l) =>
				l.id === event.id ? { ...l, visible: !l.visible } : l,
			),
		}),
	},
});
