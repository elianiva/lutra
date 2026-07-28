import * as Haptics from "expo-haptics";
import {
	Contrast,
	Eye,
	Sun,
	Palette,
	Aperture,
	Eclipse,
	Sparkles,
	Shirt,
	CircleDot,
	Flame,
} from "lucide-react-native";
import { useCallback } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "../../../components/ui/icon";
import { Text } from "../../../components/ui/text";
import { layerRegistry, type LayerType } from "../chain/registry";

const TOOL_ICONS: Record<string, typeof Sun> = {
	exposure: Sun,
	contrast: Contrast,
	saturation: Palette,
	whiteBalance: Eye,
	vignette: Aperture,
	shadows: Eclipse,
	highlights: Sparkles,
	grain: Shirt,
	chromaticAberration: CircleDot,
	clarity: Flame,
};

type PinnedToolsProps = {
	tools: LayerType[];
	onToolPress: (type: LayerType) => void;
	onToolLongPress: (type: LayerType) => void;
};

export function PinnedTools({ tools, onToolPress, onToolLongPress }: PinnedToolsProps) {
	const handlePress = useCallback(
		(type: LayerType) => {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			onToolPress(type);
		},
		[onToolPress],
	);

	const handleLongPress = useCallback(
		(type: LayerType) => {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
			onToolLongPress(type);
		},
		[onToolLongPress],
	);

	return (
		<View className="flex-row items-center justify-center gap-2 px-4 flex-1 w-full bg-black">
			{tools.map((type) => {
				const LucideIcon = TOOL_ICONS[type] ?? Sun;
				const label = layerRegistry[type].label.toUpperCase();
				return (
					<Pressable
						key={type}
						onPress={() => handlePress(type)}
						onLongPress={() => handleLongPress(type)}
						delayLongPress={500}
						className="flex-1 items-center justify-center py-3"
						style={{
							borderWidth: 1,
							borderColor: "rgba(255,255,255,0.25)",
						}}
					>
						<Icon as={LucideIcon} size={22} className="text-white mb-1.5" />
						<Text
							style={{
								fontSize: 12,
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
