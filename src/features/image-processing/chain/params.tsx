import { View } from "react-native";
import { type SharedValue } from "react-native-reanimated";

import { ParamHeader } from "../ui/param-header";
import { Slider } from "../ui/slider";
import { type FieldDef } from "./format";
import { resolveFormat } from "./format";
import { layerRegistry } from "./registry";
import { type Layer, type LayerPatch } from "./types";

// Generic params UI. Reads field shape (label, min/max/step, format) from
// the registry and renders one Slider per field. Replaces the nine
// per-layer params.tsx files; the registry is the only place to update
// when a layer adds/removes/renames a field.
type ParamsProps = {
	layer: Layer;
	sv: Record<string, SharedValue<number>>;
	onCommit: (patch: LayerPatch) => void;
	onRemove: () => void;
};

export function Params({ layer, onCommit, onRemove, sv }: ParamsProps) {
	const entry = layerRegistry[layer.type];
	const fields = entry.fields as Record<string, FieldDef>;
	const values = sv;
	return (
		<View className="gap-3">
			<ParamHeader label={entry.label} onRemove={onRemove} />
			{Object.entries(fields).map(([key, field]) => (
				<Slider
					key={key}
					value={values[key]}
					min={field.min}
					max={field.max}
					step={field.step}
					label={field.label}
					formatValue={resolveFormat(field.format)}
					onCommit={(v) =>
						onCommit({ type: layer.type, patch: { [key]: v } } as LayerPatch)
					}
				/>
			))}
		</View>
	);
}
