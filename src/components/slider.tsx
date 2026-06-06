import { type ReactNode, useCallback, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	type SharedValue,
	useAnimatedReaction,
	useAnimatedStyle,
	useSharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

const TRACK_HEIGHT = 4;
const THUMB_SIZE = 20;

const clamp = (min: number, x: number, max: number) => {
	"worklet";
	return Math.max(min, Math.min(max, x));
};

type SliderProps = {
	value: SharedValue<number>;
	min: number;
	max: number;
	step?: number;
	label: string;
	formatValue?: (v: number) => string;
	onCommit: (v: number) => void;
};

export function Slider({
	value,
	min,
	max,
	step = 0.01,
	label,
	formatValue,
	onCommit,
}: SliderProps): ReactNode {
	const trackWidth = useSharedValue(0);
	const [displayValue, setDisplayValue] = useState(
		formatValue ? formatValue(value.value) : value.value.toFixed(2),
	);

	const updateDisplay = useCallback(
		(v: number) => setDisplayValue(formatValue ? formatValue(v) : v.toFixed(2)),
		[formatValue],
	);

	useAnimatedReaction(
		() => value.value,
		(current) => scheduleOnRN(updateDisplay, current),
	);

	const setValueFromX = (x: number) => {
		"worklet";
		const clamped = clamp(0, x, trackWidth.value);
		const ratio = trackWidth.value > 0 ? clamped / trackWidth.value : 0;
		const raw = min + ratio * (max - min);
		const snapped = Math.round(raw / step) * step;
		value.value = clamp(min, snapped, max);
	};

	const pan = Gesture.Pan()
		.activeOffsetX([-2, 2])
		.onBegin((e) => {
			setValueFromX(e.x);
			scheduleOnRN(onCommit, value.value);
		})
		.onChange((e) => {
			setValueFromX(e.x);
			scheduleOnRN(onCommit, value.value);
		});

	const tap = Gesture.Tap().onEnd((e) => {
		setValueFromX(e.x);
		scheduleOnRN(onCommit, value.value);
	});

	const gesture = Gesture.Race(pan, tap);

	const thumbStyle = useAnimatedStyle(() => {
		const ratio = (value.value - min) / (max - min);
		return { transform: [{ translateX: ratio * trackWidth.value - THUMB_SIZE / 2 }] };
	});

	const onTrackLayout = (e: LayoutChangeEvent) => {
		trackWidth.value = e.nativeEvent.layout.width;
	};

	return (
		<View>
			<View className="flex-row items-center justify-between mb-1">
				<Text className="text-zinc-300 text-sm">{label}</Text>
				<Text className="text-zinc-400 text-sm w-20 text-right">{displayValue}</Text>
			</View>
			<GestureDetector gesture={gesture}>
				<View className="h-12 justify-center" onLayout={onTrackLayout} collapsable={false}>
					<View className="bg-zinc-700 rounded-full" style={{ height: TRACK_HEIGHT }} />
					<Animated.View
						className="absolute bg-white rounded-full"
						style={[thumbStyle, { width: THUMB_SIZE, height: THUMB_SIZE }]}
					/>
				</View>
			</GestureDetector>
		</View>
	);
}
