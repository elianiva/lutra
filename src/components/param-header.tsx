import { Pressable, Text, View } from "react-native";

export function ParamHeader({ label, onRemove }: { label: string; onRemove: () => void }) {
	return (
		<View className="flex-row items-center justify-between">
			<Text className="text-white font-medium">{label}</Text>
			<Pressable onPress={onRemove} className="px-2 py-1 active:bg-zinc-800 rounded">
				<Text className="text-zinc-400 text-sm">Remove</Text>
			</Pressable>
		</View>
	);
}
