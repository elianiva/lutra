import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Check, Sun, Contrast, Eye, Palette, Aperture, Eclipse, Sparkles, Shirt, CircleDot, Flame } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

import { Icon } from "../../../components/ui/icon";
import { Text } from "../../../components/ui/text";
import { layerRegistry, type LayerType } from "../chain/registry";

const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 1 };
const SHEET_HEIGHT = 500;

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

const STORAGE_KEY = "lutra:pinned-tools";

type CustomizePinnedProps = {
	visible: boolean;
	currentPinned: LayerType[];
	onClose: (newPinned: LayerType[]) => void;
};

export function CustomizePinned({ visible, currentPinned, onClose }: CustomizePinnedProps) {
	const [selected, setSelected] = useState<LayerType[]>(currentPinned);
	const translateY = useSharedValue(SHEET_HEIGHT);
	const backdropOpacity = useSharedValue(0);

	const allTools = Object.keys(layerRegistry) as LayerType[];

	// Animate in/out based on visible prop
	useEffect(() => {
		if (visible) {
			translateY.value = withSpring(0, SPRING_CONFIG);
			backdropOpacity.value = withSpring(1, SPRING_CONFIG);
		} else {
			translateY.value = withSpring(SHEET_HEIGHT, SPRING_CONFIG);
			backdropOpacity.value = withSpring(0, SPRING_CONFIG);
		}
	}, [visible]);

	// Reset selection when opening
	useEffect(() => {
		if (visible) {
			setSelected(currentPinned);
		}
	}, [visible, currentPinned]);

	const toggleTool = useCallback((type: LayerType) => {
		Haptics.selectionAsync();
		setSelected((prev) => {
			if (prev.includes(type)) {
				// Don't allow removing last tool
				if (prev.length <= 1) return prev;
				return prev.filter((t) => t !== type);
			} else {
				// Max 5
				if (prev.length >= 5) return prev;
				return [...prev, type];
			}
		});
	}, []);

	const handleConfirm = useCallback(async () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		try {
			await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
		} catch {
			// Best effort
		}
		// Animate out first
		translateY.value = withSpring(SHEET_HEIGHT, SPRING_CONFIG);
		backdropOpacity.value = withSpring(0, SPRING_CONFIG);
		// Then close
		setTimeout(() => onClose(selected), 200);
	}, [selected, onClose]);

	const gesture = Gesture.Pan()
		.onUpdate((e) => {
			"worklet";
			if (e.translationY > 0) {
				translateY.value = e.translationY;
				backdropOpacity.value = 1 - e.translationY / SHEET_HEIGHT;
			}
		})
		.onEnd((e) => {
			"worklet";
			if (e.translationY > 100 || e.velocityY > 500) {
				translateY.value = withSpring(SHEET_HEIGHT, SPRING_CONFIG);
				backdropOpacity.value = withSpring(0, SPRING_CONFIG);
			} else {
				translateY.value = withSpring(0, SPRING_CONFIG);
				backdropOpacity.value = withSpring(1, SPRING_CONFIG);
			}
		});

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: translateY.value }],
	}));

	const backdropStyle = useAnimatedStyle(() => ({
		opacity: backdropOpacity.value,
	}));

	return (
		<View className="absolute inset-0 z-40" pointerEvents={visible ? "auto" : "none"}>
			{/* Backdrop */}
			<Animated.View style={backdropStyle} className="absolute inset-0 bg-black/60">
				<Pressable className="flex-1" onPress={() => onClose(currentPinned)} />
			</Animated.View>

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

					{/* Header */}
					<View className="px-4 pb-3 flex-row items-center justify-between">
						<Text
							style={{
								fontFamily: "Electrolize_400Regular",
								color: "#fff",
								letterSpacing: 2,
								fontSize: 14,
							}}
						>
							CUSTOMIZE TOOLS
						</Text>
						<Text
							style={{
								fontFamily: "Electrolize_400Regular",
								color: "#666",
								fontSize: 12,
							}}
						>
							{selected.length}/5
						</Text>
					</View>

					{/* Tool grid */}
					<ScrollView className="px-4 pb-8" style={{ maxHeight: 350 }}>
						<View className="flex-row flex-wrap gap-3">
							{allTools.map((type) => {
								const LucideIcon = TOOL_ICONS[type] ?? Sun;
								const label = layerRegistry[type].label.toUpperCase();
								const isSelected = selected.includes(type);
								return (
									<Pressable
										key={type}
										onPress={() => toggleTool(type)}
										className="w-[22%] items-center justify-center border rounded-lg py-4"
										style={{
											borderColor: isSelected ? "#fff" : "rgba(255,255,255,0.2)",
											backgroundColor: isSelected ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
										}}
									>
										<Icon as={LucideIcon} size={24} className={isSelected ? "text-white" : "text-white/60"} />
										<Text
											style={{
												fontSize: 8,
												color: isSelected ? "#fff" : "#999",
												letterSpacing: 0.5,
												fontFamily: "Electrolize_400Regular",
												textAlign: "center",
												marginTop: 8,
											}}
										>
											{label}
										</Text>
										{isSelected && (
											<View className="absolute top-2 right-2">
												<Icon as={Check} className="text-white" size={12} />
											</View>
										)}
									</Pressable>
								);
							})}
						</View>
					</ScrollView>

					{/* Confirm button */}
					<View className="px-4 pb-8">
						<Pressable
							onPress={handleConfirm}
							className="items-center py-3 rounded-xl"
							style={{ backgroundColor: "#fff" }}
						>
							<Text
								style={{
									fontFamily: "Electrolize_400Regular",
									color: "#000",
									letterSpacing: 2,
									fontSize: 13,
								}}
							>
								DONE
							</Text>
						</Pressable>
					</View>
				</Animated.View>
			</GestureDetector>
		</View>
	);
}

// Load pinned tools from storage
export async function loadPinnedTools(): Promise<LayerType[]> {
	try {
		const stored = await AsyncStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			if (Array.isArray(parsed) && parsed.length > 0 && parsed.length <= 5) {
				return parsed;
			}
		}
	} catch {
		// Fall back to defaults
	}
	return ["exposure", "whiteBalance", "saturation", "contrast", "vignette"];
}
