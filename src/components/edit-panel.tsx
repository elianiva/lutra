import { View } from "react-native";

import { Params } from "../layers/params";
import { type Layer, type LayerSVs, type LayerPatch } from "../layers/types";

type Props = {
	layer: Layer;
	sv: LayerSVs;
	onCommit: (id: string, patch: LayerPatch) => void;
	onRemove: (id: string) => void;
};

export function EditPanel({ layer, sv, onCommit, onRemove }: Props) {
	return (
		<View className="p-4 flex-1">
			<Params
				layer={layer}
				sv={sv}
				onCommit={(patch) => onCommit(layer.id, patch)}
				onRemove={() => onRemove(layer.id)}
			/>
		</View>
	);
}
