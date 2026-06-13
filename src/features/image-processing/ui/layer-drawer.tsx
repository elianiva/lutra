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
	const translateX = useSharedValue(400);

	const gesture = Gesture.Pan()
		.activeOffsetX([-10, 10])
		.onUpdate((e) => {
			"worklet";
			// Only allow swiping right to dismiss
			if (e.translationX > 0) {
				translateX.value = e.translationX;
			}
		})
		.onEnd((e) => {
			"worklet";
			if (e.translationX > 100 || e.velocityX > 500) {
				translateX.value = withSpring(400);
			} else {
				translateX.value = withSpring(0);
			}
		});

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: translateX.value }],
	}));

	if (!visible) return null;

	return (
		<View className="absolute inset-0 z-40">
			{/* Backdrop */}
			<Pressable className="absolute inset-0 bg-black/60" onPress={onClose} />

			{/* Drawer */}
			<GestureDetector gesture={gesture}>
				<Animated.View
					style={animatedStyle}
					className="absolute top-0 right-0 bottom-0 w-[85%] bg-[#111]"
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
					<View className="flex-1">
						<LayersPanel
							layers={layers}
							selectedId={selectedId}
							onSelect={(id) => {
								onSelect(id);
								onClose();
							}}
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
