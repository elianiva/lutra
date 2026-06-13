import { Download, Share2, X } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

import { Icon } from "../../../components/ui/icon";
import { Text } from "../../../components/ui/text";

type ExportMenuProps = {
	visible: boolean;
	onClose: () => void;
	onExport: () => void;
};

export function ExportMenu({ visible, onClose, onExport }: ExportMenuProps) {
	const translateY = useSharedValue(-200);

	const gesture = Gesture.Pan()
		.onUpdate((e) => {
			"worklet";
			if (e.translationY < 0) {
				translateY.value = e.translationY;
			}
		})
		.onEnd((e) => {
			"worklet";
			if (e.translationY < -50 || e.velocityY < -500) {
				translateY.value = withSpring(-200);
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

			{/* Menu */}
			<GestureDetector gesture={gesture}>
				<Animated.View
					style={animatedStyle}
					className="absolute top-16 right-4 w-56 bg-[#1a1a1a] rounded-xl overflow-hidden border border-white/10"
				>
					{/* Close button */}
					<Pressable
						onPress={onClose}
						className="absolute top-3 right-3 z-10"
						hitSlop={8}
					>
						<Icon as={X} className="text-white/50" size={16} />
					</Pressable>

					{/* Export options */}
					<View className="py-2">
						<MenuItem
							icon={Download}
							label="Save to Photos"
							onPress={() => {
								onClose();
								onExport();
							}}
						/>
						<MenuItem
							icon={Share2}
							label="Share"
							onPress={onClose}
							disabled
						/>
					</View>
				</Animated.View>
			</GestureDetector>
		</View>
	);
}

function MenuItem({
	icon,
	label,
	onPress,
	disabled = false,
}: {
	icon: typeof Download;
	label: string;
	onPress: () => void;
	disabled?: boolean;
}) {
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			className={`flex-row items-center gap-3 px-4 py-3 ${disabled ? "opacity-40" : "active:bg-white/10"}`}
		>
			<Icon as={icon} className="text-white" size={20} />
			<Text
				style={{
					fontFamily: "Electrolize_400Regular",
					color: "#fff",
					letterSpacing: 1,
					fontSize: 13,
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}
