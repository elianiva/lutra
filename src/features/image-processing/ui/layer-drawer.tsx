import * as Haptics from "expo-haptics";
import { useCallback, useEffect } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

import { Text } from "../../../components/ui/text";
import { type Layer } from "../chain/types";
import { LayersPanel } from "./layers-panel";

const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 1 };
const DRAWER_WIDTH = 340;

type LayerDrawerProps = {
	visible: boolean;
	layers: Layer[];
	selectedId: string | null;
	onClose: () => void;
	onSelect: (id: string) => void;
	onRemove: (id: string) => void;
	onReorder: (from: number, to: number) => void;
	onToggleVisible: (id: string) => void;
};

export function LayerDrawer({
	visible,
	layers,
	selectedId,
	onClose,
	onSelect,
	onRemove,
	onReorder,
	onToggleVisible,
}: LayerDrawerProps) {
	const translateX = useSharedValue(DRAWER_WIDTH);
	const backdropOpacity = useSharedValue(0);

	// Animate in/out based on visible prop
	useEffect(() => {
		if (visible) {
			translateX.value = withSpring(0, SPRING_CONFIG);
			backdropOpacity.value = withSpring(1, SPRING_CONFIG);
		} else {
			translateX.value = withSpring(DRAWER_WIDTH, SPRING_CONFIG);
			backdropOpacity.value = withSpring(0, SPRING_CONFIG);
		}
	}, [visible]);

	const handleSelect = useCallback((id: string) => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		onSelect(id);
		onClose();
	}, [onSelect, onClose]);

	const gesture = Gesture.Pan()
		.activeOffsetX([-10, 10])
		.onUpdate((e) => {
			"worklet";
			// Only allow swiping right to dismiss
			if (e.translationX > 0) {
				translateX.value = e.translationX;
				backdropOpacity.value = 1 - e.translationX / DRAWER_WIDTH;
			}
		})
		.onEnd((e) => {
			"worklet";
			if (e.translationX > 100 || e.velocityX > 500) {
				translateX.value = withSpring(DRAWER_WIDTH, SPRING_CONFIG);
				backdropOpacity.value = withSpring(0, SPRING_CONFIG);
			} else {
				translateX.value = withSpring(0, SPRING_CONFIG);
				backdropOpacity.value = withSpring(1, SPRING_CONFIG);
			}
		});

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: translateX.value }],
	}));

	const backdropStyle = useAnimatedStyle(() => ({
		opacity: backdropOpacity.value,
	}));

	return (
		<View className="absolute inset-0 z-40" pointerEvents={visible ? "auto" : "none"}>
			{/* Backdrop */}
			<Animated.View style={backdropStyle} className="absolute inset-0 bg-black/60">
				<Pressable className="flex-1" onPress={onClose} />
			</Animated.View>

			{/* Drawer */}
			<GestureDetector gesture={gesture}>
				<Animated.View
					style={animatedStyle}
					className="absolute top-0 right-0 bottom-0 bg-[#111]"
				>
					{/* Header */}
					<View className="pt-14 pb-4 px-4 border-b border-white/10">
						<Text
							style={{
								fontFamily: "Electrolize_400Regular",
								color: "#fff",
								letterSpacing: 2,
								fontSize: 14,
							}}
						>
							LAYERS
						</Text>
					</View>

					{/* Layer list */}
					<View className="flex-1" style={{ width: DRAWER_WIDTH }}>
						<LayersPanel
							layers={layers}
							selectedId={selectedId}
							onSelect={handleSelect}
							onRemove={onRemove}
							onReorder={onReorder}
							onToggleVisible={onToggleVisible}
						/>
					</View>
				</Animated.View>
			</GestureDetector>
		</View>
	);
}
