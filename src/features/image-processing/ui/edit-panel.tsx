import { View } from "react-native";
import { type SharedValue } from "react-native-reanimated";

import { Params } from "../chain/params";
import { type Layer, type LayerPatch } from "../chain/types";

type Props = {
	layer: Layer;
	sv: Record<string, SharedValue<number>>;
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
