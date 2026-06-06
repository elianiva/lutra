import { View } from "react-native";

import { Text } from "./ui/text";

export function EmptyEdit() {
	return (
		<View className="flex-1 items-center justify-center p-4">
			<Text variant="muted" className="text-center">
				No layer selected. Switch to Add to add a layer, or Layers to pick one.
			</Text>
		</View>
	);
}
