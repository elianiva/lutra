import { Eye, EyeOff, GripVertical, Trash2 } from "lucide-react-native";
import { View } from "react-native";
import {
	GestureDetector,
	useCompetingGestures,
	usePanGesture,
	useTapGesture,
} from "react-native-gesture-handler";
import Animated, { type SharedValue, useAnimatedStyle } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { Icon } from "../../../components/ui/icon";
import { Text } from "../../../components/ui/text";
import { layerRegistry } from "../chain/registry";
import { type Layer, formatLayerValue } from "../chain/types";

export const ROW_HEIGHT = 56;
const ROW_GAP = 8;
export const SLOT_HEIGHT = ROW_HEIGHT + ROW_GAP;

const clamp = (min: number, x: number, max: number) => {
	"worklet";
	return Math.max(min, Math.min(max, x));
};

export function LayerRow({
	layer,
	index,
	total,
	isSelected,
	onSelect,
	onRemove,
	onReorder,
	onToggleVisible,
	draggedIndex,
	dragOffset,
}: {
	layer: Layer;
	index: number;
	total: number;
	isSelected: boolean;
	onSelect: (id: string) => void;
	onRemove: (id: string) => void;
	onReorder: (from: number, to: number) => void;
	onToggleVisible: (id: string) => void;
	draggedIndex: SharedValue<number | null>;
	dragOffset: SharedValue<number>;
}) {
	const animatedStyle = useAnimatedStyle(() => {
		const d = draggedIndex.value;
		if (d === null) {
			return {
				transform: [{ translateY: 0 }, { scale: 1 }],
				opacity: 1,
				zIndex: 1,
				shadowOpacity: 0,
			};
		}
		const newD = clamp(0, d + Math.round(dragOffset.value / ROW_HEIGHT), total - 1);
		const isThisDragged = d === index;
		let ty = 0;
		if (isThisDragged) {
			ty = dragOffset.value;
		} else if (index > d && index <= newD) {
			ty = -SLOT_HEIGHT;
		} else if (index < d && index >= newD) {
			ty = SLOT_HEIGHT;
		}
		return {
			transform: [{ translateY: ty }, { scale: isThisDragged ? 1.04 : 1 }],
			opacity: isThisDragged ? 0.92 : 1,
			zIndex: isThisDragged ? 10 : 1,
			shadowOpacity: isThisDragged ? 0.4 : 0,
			shadowRadius: isThisDragged ? 12 : 0,
			shadowOffset: { width: 0, height: 4 },
			shadowColor: "#000",
		};
	});

	// Define the button taps first — the row tap references them via
	// `requireToFail` so the eye/trash icons can preempt row selection.
	const toggleVisible = useTapGesture({
		onDeactivate: () => {
			"worklet";
			scheduleOnRN(onToggleVisible, layer.id);
		},
	});

	const remove = useTapGesture({
		onDeactivate: () => {
			"worklet";
			scheduleOnRN(onRemove, layer.id);
		},
	});

	// Long-press (300ms) starts a drag. Translation is fed straight into
	// `dragOffset` so the animated style follows the finger; on release we
	// round to a slot and dispatch the reorder to the RN thread.
	const dragPan = usePanGesture({
		activateAfterLongPress: 300,
		onActivate: () => {
			"worklet";
			draggedIndex.value = index;
			dragOffset.value = 0;
		},
		onUpdate: (e) => {
			"worklet";
			if (draggedIndex.value === index) {
				dragOffset.value = e.translationY;
			}
		},
		onDeactivate: () => {
			"worklet";
			if (draggedIndex.value === index) {
				const newIndex = clamp(
					0,
					Math.round(index + dragOffset.value / ROW_HEIGHT),
					total - 1,
				);
				draggedIndex.value = null;
				dragOffset.value = 0;
				if (newIndex !== index) {
					scheduleOnRN(onReorder, index, newIndex);
				}
			}
		},
	});

	// Race the drag and the row tap. Tap (maxDuration 280) wins for short
	// taps; drag wins for long-presses. The button taps cancel the row tap
	// via requireToFail so eye/trash taps don't also select the row.
	const tap = useTapGesture({
		maxDuration: 280,
		requireToFail: [toggleVisible, remove],
		onDeactivate: (e) => {
			"worklet";
			if (e.canceled) return;
			scheduleOnRN(onSelect, layer.id);
		},
	});

	const rowGesture = useCompetingGestures(dragPan, tap);

	return (
		<Animated.View style={animatedStyle}>
			<GestureDetector gesture={rowGesture}>
				<View
					className={`rounded-lg p-3 flex-row items-center justify-between ${isSelected ? "bg-accent" : "bg-secondary"}`}
					style={{ height: ROW_HEIGHT }}
				>
					<View className="flex-row items-center gap-2 flex-1">
						<Icon as={GripVertical} className="text-muted-foreground size-4" />
						<View className="flex-1">
							<Text className="font-medium">{layerRegistry[layer.type].label}</Text>
							<Text variant="muted">{formatLayerValue(layer)}</Text>
						</View>
					</View>
					<View className="flex-row items-center gap-1">
						<GestureDetector gesture={toggleVisible}>
							<View hitSlop={8} className="p-1">
								<Icon
									as={layer.visible ? Eye : EyeOff}
									className={
										layer.visible
											? "text-foreground size-5"
											: "text-muted-foreground size-5"
									}
								/>
							</View>
						</GestureDetector>
						<GestureDetector gesture={remove}>
							<View hitSlop={8} className="p-1">
								<Icon as={Trash2} className="text-destructive size-5" />
							</View>
						</GestureDetector>
					</View>
				</View>
			</GestureDetector>
		</Animated.View>
	);
}
