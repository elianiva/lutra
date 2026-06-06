import { createStore } from "@xstate/store";

import { type Layer, type LayerPatch } from "../layers/types";

// The chain store holds the canonical edit chain. The renderer reads
// shared values (per-layer) on the UI thread; this store is the source of
// truth for persistence and reorder. The editor commits to it on slider
// release (see ADR 0003).
export const chainStore = createStore({
	context: { layers: [] as Layer[] },
	on: {
		// The caller generates the layer (and its id) and passes the whole
		// object. This avoids a brittle read-back via getSnapshot() at the
		// call site, which would race with any future async add flow.
		add: (_ctx, event: { layer: Layer }) => ({
			layers: [..._ctx.layers, event.layer],
		}),
		remove: (_ctx, event: { id: string }) => ({
			layers: _ctx.layers.filter((l) => l.id !== event.id),
		}),
		updateParams: (_ctx, event: { id: string; patch: LayerPatch }) => ({
			layers: _ctx.layers.map((l) => {
				if (l.id !== event.id) return l;
				// Discriminant mismatch is a programmer error: the editor
				// always knows the layer type at the call site. The cast
				// below is the one place the runtime is trusted over the
				// type system; the type checker enforces the match.
				return { ...l, ...event.patch.patch } as Layer;
			}),
		}),
		reorder: (_ctx, event: { from: number; to: number }) => {
			if (event.from === event.to) return;
			const next = [..._ctx.layers];
			const [moved] = next.splice(event.from, 1);
			next.splice(event.to, 0, moved);
			return { layers: next };
		},
		toggleVisible: (_ctx, event: { id: string }) => ({
			layers: _ctx.layers.map((l) =>
				l.id === event.id ? { ...l, visible: !l.visible } : l,
			),
		}),
	},
});
