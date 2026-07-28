import { type ReactNode, useCallback, useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { usePanGesture, GestureDetector } from "react-native-gesture-handler";
import { type SharedValue, useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

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

const format = (v: number, fmt?: (v: number) => string) => (fmt ? fmt(v) : v.toFixed(2));

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
  const [displayValue, setDisplayValue] = useState(() => format(value.value, formatValue));
  const updateDisplay = useCallback(
    (v: number) => setDisplayValue(format(v, formatValue)),
    [formatValue],
  );

  const ticks = generateTicks(majorTicks);
  const hasTicks = ticks.length > 0;
  const scrollPosition = hasTicks ? getValueTickPosition(value.value, ticks) : 0;

  useAnimatedReaction(
    () => value.value,
    (current) => scheduleOnRN(updateDisplay, current),
  );

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
        {toggled && <Text style={{ fontSize: 20, color: "#fff" }}>⇅</Text>}
        <Text
          style={{
            fontSize: 20,
            fontWeight: "500",
            color: "#fff",
            letterSpacing: 2,
            fontFamily: "Electrolize_400Regular",
            fontVariant: ["tabular-nums"],
            minWidth: 60,
            textAlign: "center",
          }}
        >
          {label.toUpperCase()}
        </Text>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "400",
            color: "#fff",
            fontFamily: "Electrolize_400Regular",
            fontVariant: ["tabular-nums"],
            minWidth: 60,
            textAlign: "center",
          }}
        >
          {displayValue}
        </Text>
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
