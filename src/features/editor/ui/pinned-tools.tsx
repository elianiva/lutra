import * as Haptics from "expo-haptics";
import { useCallback, useMemo } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";

import { Icon } from "../../../components/ui/icon";
import { Text } from "../../../components/ui/text";
import { layerRegistry, type LayerType } from "../chain/registry";

type PinnedToolsProps = {
	onToolPress: (type: LayerType) => void;
};

export function PinnedTools({ onToolPress }: PinnedToolsProps) {
	const { width: screenW } = useWindowDimensions();

	const pinned = useMemo(
		() =>
			(Object.entries(layerRegistry) as [LayerType, (typeof layerRegistry)[LayerType]][]).filter(
				([, entry]) => entry.pinned,
			),
		[],
	);

	const handlePress = useCallback(
		(type: LayerType) => {
			Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
			onToolPress(type);
		},
		[onToolPress],
	);

	// Calculate button dimensions deterministically — no reliance on
	// flex-1 + arbitrary Tailwind values that may not resolve.
	const GAP = 8;
	const PADDING_X = 16;
	const count = pinned.length;
	const buttonW = (screenW - PADDING_X * 2 - GAP * (count - 1)) / count;

	// Scale font size to button width so labels never overflow.
	const fontSize = buttonW < 72 ? 8 : buttonW < 90 ? 9 : 10;

	return (
		<View className="flex-row items-center justify-center px-4 bg-black" style={{ gap: GAP }}>
			{pinned.map(([type, entry]) => {
				const label = entry.label.toUpperCase();
				return (
					<Pressable
						key={type}
						onPress={() => handlePress(type)}
						className="items-center justify-center py-3"
						style={{
							width: buttonW,
							borderWidth: 1,
							borderColor: "rgba(255,255,255,0.25)",
						}}
					>
						<Icon as={entry.icon} size={22} className="text-white mb-1.5" />
						<Text
							numberOfLines={1}
							tracking="normal"
							className="text-white text-center"
							style={{ fontSize }}
						>
							{label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}
