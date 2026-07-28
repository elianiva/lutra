import { View } from "react-native";

import { Text } from "../../../components/ui/text";

export function EmptyEdit() {
	return (
		<View className="flex-1 items-center justify-center p-4">
			<Text
				style={{
					fontFamily: "Electrolize_400Regular",
					color: "#666",
					letterSpacing: 1,
					fontSize: 12,
					textAlign: "center",
				}}
			>
				Select a tool to begin editing
			</Text>
		</View>
	);
}

export function EmptyChain() {
	return (
		<View className="flex-1 items-center justify-center p-4">
			<Text
				style={{
					fontFamily: "Electrolize_400Regular",
					color: "#666",
					letterSpacing: 1,
					fontSize: 11,
					textAlign: "center",
				}}
			>
				No adjustments yet.{"\n"}Tap a tool below or use the chevron to see all tools.
			</Text>
		</View>
	);
}
