import { Contrast, Eye, Sun, Palette, Aperture } from "lucide-react-native";
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
	return (
		<View className="flex-row items-center justify-center gap-2 px-4">
			{tools.map((type) => {
				const Icon = TOOL_ICONS[type] ?? Sun;
				const label = TOOL_LABELS[type] ?? type.toUpperCase();
				return (
					<Pressable
						key={type}
						onPress={() => onToolPress(type)}
						onLongPress={() => onToolLongPress(type)}
						delayLongPress={500}
						className="items-center justify-center border border-white/30 rounded-lg px-3 py-3 min-w-[64px]"
						style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
					>
						<Icon size={22} className="text-white mb-1.5" />
						<Text
							style={{
								fontSize: 9,
								color: "#fff",
								letterSpacing: 1,
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
