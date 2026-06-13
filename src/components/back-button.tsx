import { ChevronLeft } from "lucide-react-native";
import { Pressable, View } from "react-native";

// Pushed screens (editor, options) overlay this in the top-left.
// White icon on transparent background for readability over
// arbitrary image content in the editor.
export function BackButton({ onPress }: { onPress: () => void }) {
	return (
		<View className="absolute top-12 left-4 z-50">
			<Pressable
				onPress={onPress}
				className="h-11 w-11 items-center justify-center active:opacity-60"
				hitSlop={8}
			>
				<ChevronLeft size={24} className="text-white" />
			</Pressable>
		</View>
	);
}
