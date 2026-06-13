import {
	Contrast,
	Eye,
	Sun,
	Palette,
	Aperture,
	Sparkles,
	Eclipse,
	Shirt,
	Flame,
	CircleDot,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

import { Text } from "../../../components/ui/text";
import { type LayerType, layerRegistry } from "../chain/registry";

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

type ToolOverlayProps={
	visible: boolean;
	onClose: () => void;
	onSelect: (type: LayerType) => void;
};

export function ToolOverlay({ visible, onClose, onSelect }: ToolOverlayProps) {
	const translateY = useSharedValue(600);
	const [activeTab, setActiveTab] = useState<"adjustments" | "luts">("adjustments");

	// Animate in/out based on visible prop
	// Note: In production, we'd use useDerivedValue or useEffect
	// For now, this is a simplified version

	const tools = Object.keys(layerRegistry) as LayerType[];

	const gesture = Gesture.Pan()
		.onUpdate((e) => {
			"worklet";
			if (e.translationY > 0) {
				translateY.value = e.translationY;
			}
		})
		.onEnd((e) => {
			"worklet";
			if (e.translationY > 100 || e.velocityY > 500) {
				translateY.value = withSpring(600);
				// onClose will be called via useEffect
			} else {
				translateY.value = withSpring(0);
			}
		});

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: translateY.value }],
	}));

	if (!visible) return null;

	return (
		<View className="absolute inset-0 z-40">
			{/* Backdrop */}
			<Pressable className="absolute inset-0 bg-black/60" onPress={onClose} />

			{/* Sheet */}
			<GestureDetector gesture={gesture}>
				<Animated.View
					style={animatedStyle}
					className="absolute bottom-0 left-0 right-0 bg-[#111] rounded-t-2xl"
				>
					{/* Handle */}
					<View className="items-center pt-3 pb-2">
						<View className="w-10 h-1 rounded-full bg-white/30" />
					</View>

					{/* Tabs */}
					<View className="flex-row border-b border-white/10">
						<Pressable
							onPress={() => setActiveTab("adjustments")}
							className={`flex-1 py-3 items-center ${activeTab === "adjustments" ? "border-b-2 border-white" : ""}`}
						>
							<Text
								style={{
									fontFamily: "Electrolize_400Regular",
									color: activeTab === "adjustments" ? "#fff" : "#666",
									letterSpacing: 2,
									fontSize: 13,
								}}
							>
								ADJUSTMENTS
							</Text>
						</Pressable>
						<Pressable
							onPress={() => setActiveTab("luts")}
							className={`flex-1 py-3 items-center ${activeTab === "luts" ? "border-b-2 border-white" : ""}`}
						>
							<Text
								style={{
									fontFamily: "Electrolize_400Regular",
									color: activeTab === "luts" ? "#fff" : "#666",
									letterSpacing: 2,
									fontSize: 13,
								}}
							>
								LUTS
							</Text>
						</Pressable>
					</View>

					{/* Tool grid */}
					<View className="px-4 py-4">
						{activeTab === "adjustments" ? (
							<View className="flex-row flex-wrap gap-3">
								{tools.map((type) => {
									const Icon = TOOL_ICONS[type] ?? Sun;
									const label = layerRegistry[type].label.toUpperCase();
									return (
										<Pressable
											key={type}
											onPress={() => onSelect(type)}
											className="w-[22%] items-center justify-center border border-white/20 rounded-lg py-4"
											style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
										>
											<Icon size={24} className="text-white mb-2" />
											<Text
												style={{
													fontSize: 8,
													color: "#fff",
													letterSpacing: 0.5,
													fontFamily: "Electrolize_400Regular",
													textAlign: "center",
												}}
											>
												{label}
											</Text>
										</Pressable>
									);
								})}
							</View>
						) : (
							<View className="items-center justify-center py-12">
								<Text
									style={{
										fontFamily: "Electrolize_400Regular",
										color: "#666",
										letterSpacing: 1,
									}}
								>
									Coming soon
								</Text>
							</View>
						)}
					</View>
				</Animated.View>
			</GestureDetector>
		</View>
	);
}
