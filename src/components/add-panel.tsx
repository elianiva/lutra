import { Pressable, Text, View } from "react-native";

import { layerRegistry } from "../layers/registry";
import { type LayerType } from "../layers/types";

const GRID: LayerType[] = ["exposure", "contrast", "shadows", "whiteBalance", "saturation"];

export function AddPanel({ onAdd }: { onAdd: (type: LayerType) => void }) {
	return (
		<View className="p-4 flex-1 justify-center">
			<View className="flex-row flex-wrap gap-3 justify-center">
				{GRID.map((type) => (
					<Pressable
						key={type}
						onPress={() => onAdd(type)}
						className="bg-zinc-800 active:bg-zinc-700 rounded-xl py-5 items-center"
						style={{ width: "47%" }}
					>
						<Text className="text-white font-medium">
							{layerRegistry[type].meta.label}
						</Text>
					</Pressable>
				))}
			</View>
		</View>
	);
}
