import { type ReactNode, useCallback, useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { usePanGesture, GestureDetector } from "react-native-gesture-handler";
import {
  type SharedValue,
  useAnimatedProps,
  useDerivedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import AnimateableText from "react-native-animateable-text";

import { Text } from "../../../components/ui/text";
import { SliderTrack, generateTicks, getValueTickPosition } from "./slider-track";

// Piecewise-linear transfer function, modelled after libinput's
// pointer-acceleration profile. Three zones:
//   [0 … LOW]  — deceleration (40% speed) for micro-adjustments
//   (LOW … HIGH] — linear ramp from 40% → MAX factor
//   > HIGH      — capped at MAX factor (covers range on fast swipes)
// See docs/slider-physics.md for rationale and tuning guidance.
const BASE_SENSITIVITY = 0.015;
const DECEL_FACTOR = 0.4;
const ACCEL_MAX = 1.6;
const LOW_VEL = 2;
const HIGH_VEL = 16;

const clamp = (min: number, x: number, max: number) => {
  "worklet";
  return Math.max(min, Math.min(max, x));
};

const format = (v: number, fmt?: (v: number) => string) => {
  "worklet";
  return fmt ? fmt(v) : v.toFixed(2);
};

type SliderProps = {
  value: SharedValue<number>;
  min: number;
  max: number;
  label: string;
  formatValue?: (v: number) => string;
  onCommit: (v: number) => void;
  toggled?: boolean;
  activeField?: string;
  onToggle?: () => void;
  majorTicks?: number[];
};

export function Slider({
  value,
  min,
  max,
  label,
  formatValue,
  onCommit,
  toggled = false,
  onToggle,
  majorTicks = [],
}: SliderProps): ReactNode {
  const [trackWidth, setTrackWidth] = useState(0);

  const ticks = generateTicks(majorTicks);
  const hasTicks = ticks.length > 0;

  // Display text: animated props on the UI thread.
  // format functions are now workletized (see format.ts).
  const displayProps = useAnimatedProps(() => ({
    text: format(value.value, formatValue),
  }), [formatValue]);

  const scrollPosition = useDerivedValue(() => {
    return hasTicks ? getValueTickPosition(value.value, ticks) : 0;
  }, [hasTicks, ticks]);

  const gesture = usePanGesture({
    onUpdate: (e) => {
      const mag = Math.abs(e.changeX);
      let factor: number;
      if (mag < LOW_VEL) {
        factor = DECEL_FACTOR;
      } else if (mag < HIGH_VEL) {
        const t = (mag - LOW_VEL) / (HIGH_VEL - LOW_VEL);
        factor = DECEL_FACTOR + t * (ACCEL_MAX - DECEL_FACTOR);
      } else {
        factor = ACCEL_MAX;
      }
      value.value = clamp(min, value.value - e.changeX * BASE_SENSITIVITY * factor, max);
    },
    onFinalize: () => {
      scheduleOnRN(onCommit, value.value);
    },
  });

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width - 32);
  }, []);

  const onLabelPress = useCallback(() => {
    if (toggled && onToggle) onToggle();
  }, [toggled, onToggle]);

  return (
    <View>
      <Pressable
        onPress={onLabelPress}
        disabled={!toggled}
        className="flex-row items-center justify-center mb-4 gap-2"
      >
        {toggled && <Text className="text-white text-xl">⇅</Text>}
        <Text
          tracking="wider"
          className="text-white text-xl font-medium text-center"
          style={{
            fontVariant: ["tabular-nums"],
            minWidth: 60,
          }}
        >
          {label.toUpperCase()}
        </Text>
        <AnimateableText
          animatedProps={displayProps}
          style={{
            fontSize: 20,
            fontWeight: "400",
            color: "#fff",
            fontVariant: ["tabular-nums"],
            minWidth: 60,
            textAlign: "center",
          }}
        />
      </Pressable>

      <GestureDetector gesture={gesture}>
        <View onLayout={onTrackLayout} collapsable={false}>
          <SliderTrack
            trackWidth={trackWidth}
            scrollPosition={scrollPosition}
            ticks={ticks}
            formatValue={formatValue}
            min={min}
            max={max}
          />
        </View>
      </GestureDetector>
    </View>
  );
}
