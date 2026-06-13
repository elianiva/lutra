import * as Haptics from "expo-haptics";
import { Contrast, Eye, Sun, Palette, Aperture } from "lucide-react-native";
import { useCallback } from "react";
import { Pressable, View } from "react-native";

import { Text } from "../../../components/ui/text";
import { type LayerType } from "../chain/registry";

const TOOL_ICONS: Record<string, typeof Sun> = {
	exposure: Sun,
	contrast: Contrast,
	saturation: Palette,
	whiteBalance: Eye,
	vignette: Aperture,
};

const TOOL_LABELS: Record<string, string> = {
	exposure: "EXPOSURE",
	contrast: "CONTRAST",
	saturation: "SATURATION",
	whiteBalance: "WB",
	vignette: "VIGNETTE",
};

type PinnedToolsProps = {
	tools: LayerType[];
	onToolPress: (type: LayerType) => void;
	onToolLongPress: (type: LayerType) => void;
};

export function PinnedTools({ tools, onToolPress, onToolLongPress }: PinnedToolsProps) {
	const handlePress = useCallback((type: LayerType) => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		onToolPress(type);
	}, [onToolPress]);

	const handleLongPress = useCallback((type: LayerType) => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		onToolLongPress(type);
	}, [onToolLongPress]);

	return (
		<View className="flex-row items-center justify-center gap-2 px-4">
			{tools.map((type) => {
				const Icon = TOOL_ICONS[type] ?? Sun;
				const label = TOOL_LABELS[type] ?? type.toUpperCase();
				return (
					<Pressable
						key={type}
						onPress={() => handlePress(type)}
						onLongPress={() => handleLongPress(type)}
						delayLongPress={500}
						className="items-center justify-center rounded-lg px-3 py-3 min-w-[64px]"
						style={{
							backgroundColor: "rgba(255,255,255,0.04)",
							borderWidth: 1,
							borderColor: "rgba(255,255,255,0.25)",
						}}
					>
						<Icon size={22} className="text-white mb-1.5" />
						<Text
							style={{
								fontSize: 9,
								color: "#fff",
								letterSpacing: 1.5,
								fontFamily: "Electrolize_400Regular",
							}}
						>
							{label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}
