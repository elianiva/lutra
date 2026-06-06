import { layerRegistry, type LayerType } from "./registry";
import { type Layer, type LayerFor } from "./types";
import { type FieldDef } from "./format";

// Counter-based id is fine for v1 (no persistence yet). When persistence
// lands, swap this for a uuid.
let counter = 0;
export const nextLayerId = (): string => `layer-${++counter}`;

// New layer = default values pulled from the registry. Adding a field
// means adding it to the registry; this function follows. The cast on
// `entry.fields` widens the per-entry field union to `FieldDef`; every
// registry value is shape-compatible with `FieldDef`, so the cast is
// purely a TS-ergonomics concern.
export function createLayer<K extends LayerType>(type: K): LayerFor<K> {
	const entry = layerRegistry[type];
	const fields = {} as { [F in keyof (typeof entry)["fields"]]: number };
	for (const [key, field] of Object.entries(entry.fields) as [string, FieldDef][]) {
		fields[key as keyof typeof fields] = field.default;
	}
	return {
		type,
		id: nextLayerId(),
		visible: true,
		...fields,
	} as LayerFor<K>;
}

export type { Layer };
