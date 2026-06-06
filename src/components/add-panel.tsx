import { FlatList, Pressable } from "react-native";

import { layerRegistry, type LayerType } from "../layers/registry";
import { Text } from "./ui/text";

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
