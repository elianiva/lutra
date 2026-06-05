import { type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

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
  onCommit: (v: number) => void;
};

export function Slider({ value, min, max, step = 0.01, onCommit }: SliderProps): ReactNode {
  const trackWidth = useSharedValue(0);

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
    .onBegin((e) => setValueFromX(e.x))
    .onChange((e) => setValueFromX(e.x))
    .onEnd(() => runOnJS(onCommit)(value.value));

  const tap = Gesture.Tap().onEnd((e) => {
    setValueFromX(e.x);
    runOnJS(onCommit)(value.value);
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
    <GestureDetector gesture={gesture}>
      <View
        className="h-12 justify-center"
        onLayout={onTrackLayout}
        collapsable={false}
      >
        <View
          className="bg-zinc-700 rounded-full"
          style={{ height: TRACK_HEIGHT }}
        />
        <Animated.View
          className="absolute bg-white rounded-full shadow"
          style={[thumbStyle, { width: THUMB_SIZE, height: THUMB_SIZE }]}
        />
      </View>
    </GestureDetector>
  );
}
