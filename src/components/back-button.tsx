import { ChevronLeft } from "lucide-react-native";
import { Pressable, View } from "react-native";

// Pushed screens (editor, options) overlay this in the top-left.
// Translucent surface keeps it readable over arbitrary image content
// in the editor and over any backdrop in options.
export function BackButton({ onPress }: { onPress: () => void }) {
	return (
		<View className="absolute top-12 left-4 z-50">
			<Pressable
				onPress={onPress}
				className="h-11 w-11 items-center justify-center rounded-full bg-background/60 active:opacity-60"
				hitSlop={8}
			>
				<ChevronLeft size={24} className="text-foreground" />
			</Pressable>
		</View>
	);
}
