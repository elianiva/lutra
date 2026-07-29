import { View } from "react-native";

import { Text } from "../../../components/ui/text";

export function EmptyEdit() {
	return (
		<View className="flex-1 items-center justify-center p-4">
			<Text
				tracking="normal"
				className="text-[#666] text-xs text-center"
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
				tracking="normal"
				className="text-[#666] text-[11px] text-center"
			>
				No adjustments yet.{"\n"}Tap a tool below or use the chevron to see all tools.
			</Text>
		</View>
	);
}
