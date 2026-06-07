import { FlatList, Pressable } from "react-native";

import { Text } from "../../../components/ui/text";
import { layerRegistry, type LayerType } from "../chain/registry";

const GRID = Object.keys(layerRegistry) as LayerType[];

export function AddPanel({ onAdd }: { onAdd: (type: LayerType) => void }) {
	return (
		<FlatList
			data={GRID}
			numColumns={2}
			keyExtractor={(item) => item}
			renderItem={({ item: type }) => (
				<Pressable
					onPress={() => onAdd(type)}
					className="flex-1 p-4 justify-center border-r border-border border-b"
				>
					<Text className="text-sm font-medium">{layerRegistry[type].label}</Text>
				</Pressable>
			)}
		/>
	);
}
