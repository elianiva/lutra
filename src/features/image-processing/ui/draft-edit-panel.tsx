import { Trash2 } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { type SharedValue } from "react-native-reanimated";

import { Icon } from "../../../components/ui/icon";
import { Params } from "../chain/params";
import { type Layer } from "../chain/types";

type Props = {
	layer: Layer;
	sv: Record<string, SharedValue<number>>;
	onUpdate: (patch: Record<string, number>) => void;
	onDiscard: () => void;
};

// Simpler edit panel for draft layers — no id-based commit,
// just passes the field values up.
export function DraftEditPanel({ layer, sv, onUpdate, onDiscard }: Props) {
	return (
		<View className="flex-1">
			<View className="px-4 py-8 flex-1">
				<Params
					layer={layer}
					sv={sv}
					onCommit={(patch) => onUpdate(patch.patch)}
					onRemove={onDiscard}
				/>
			</View>
			{/* Discard button - bottom right */}
			<Pressable
				onPress={onDiscard}
				className="absolute bottom-4 right-4 p-2 rounded-full"
				style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
			>
				<Icon as={Trash2} className="text-muted-foreground size-4" />
			</Pressable>
		</View>
	);
}
