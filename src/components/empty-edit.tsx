import { Text, View } from "react-native";

export function EmptyEdit() {
	return (
		<View className="flex-1 items-center justify-center p-4">
			<Text className="text-zinc-500 text-center">
				No layer selected. Switch to Add to add a layer, or Layers to pick one.
			</Text>
		</View>
	);
}
