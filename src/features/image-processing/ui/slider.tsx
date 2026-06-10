import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode, useCallback, useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import { type SharedValue, useAnimatedReaction } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { Text } from "../../../components/ui/text";

const RULER_HEIGHT = 86;
const MAJOR_TICK_HEIGHT = 42;
const MINOR_TICK_HEIGHT = 28;
const MAJOR_TICK_WIDTH = 3;
const MINOR_TICK_WIDTH = 3;
const INDICATOR_WIDTH = 4;
const SENSITIVITY = 0.04;
const FADE_WIDTH = 150;
const TICK_GAP = 16;
const TICK_LABEL_HEIGHT = 18;

type Tick = { value: number; isMajor: boolean };

const MINOR_COUNT = 10;

function generateTicks(majorTicks: number[]): Tick[] {
  if (majorTicks.length === 0) return [];
  if (majorTicks.length === 1) return [{ value: majorTicks[0], isMajor: true }];

  const ticks: Tick[] = [];

  for (let i = 0; i < majorTicks.length; i++) {
    ticks.push({ value: majorTicks[i], isMajor: true });

    if (i < majorTicks.length - 1) {
      const a = majorTicks[i];
      const b = majorTicks[i + 1];
      const step = (b - a) / (MINOR_COUNT + 1);

      for (let j = 1; j <= MINOR_COUNT; j++) {
        ticks.push({ value: a + step * j, isMajor: false });
      }
    }
  }

  return ticks;
}

const clamp = (min: number, x: number, max: number) => {
  "worklet";
  return Math.max(min, Math.min(max, x));
};

const format = (v: number, fmt?: (v: number) => string) => (fmt ? fmt(v) : v.toFixed(2));

function getValueTickPosition(value: number, ticks: Tick[]): number {
  "worklet";
  if (ticks.length <= 1) return 0;
  if (value <= ticks[0].value) return 0;
  if (value >= ticks[ticks.length - 1].value) return ticks.length - 1;

  for (let i = 0; i < ticks.length - 1; i++) {
    const a = ticks[i];
    const b = ticks[i + 1];
    if (value >= a.value && value <= b.value) {
      const range = b.value - a.value;
      return range === 0 ? i : i + (value - a.value) / range;
    }
  }

  return ticks.length - 1;
}

function getTickValueByIndex(ticks: Tick[], index: number): number {
  "worklet";
  const i = Math.max(0, Math.min(ticks.length - 1, Math.round(index)));
  return ticks[i].value;
}

type SliderProps = {
  value: SharedValue<number>;
  min: number;
  max: number;
  step?: number;
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
  step = 0.01,
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

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  useAnimatedReaction(
    () => {
      if (ticks.length === 0) return -1;
      return Math.round(getValueTickPosition(value.value, ticks));
    },
    (current, previous) => {
      if (current !== -1 && current !== previous) {
        scheduleOnRN(triggerHaptic);
      }
    },
  );

  const gesture = usePanGesture({
    onUpdate: (e) => {
      "worklet";
      if (ticks.length === 0) {
        const valueChange = -e.changeX * SENSITIVITY;
        value.value = clamp(min, value.value + valueChange, max);
        return;
      }
      const currentIndex = getValueTickPosition(value.value, ticks);
      const indexChange = -e.changeX / TICK_GAP;
      value.value = getTickValueByIndex(ticks, currentIndex + indexChange);
    },
    onFinalize: () => {
      "worklet";
      if (ticks.length > 0) {
        value.value = getTickValueByIndex(
          ticks,
          getValueTickPosition(value.value, ticks),
        );
      }
      scheduleOnRN(onCommit, value.value);
    },
  });

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width - 32);
  }, []);

  const onLabelPress = useCallback(() => {
    if (toggled && onToggle) {
      onToggle();
    }
  }, [toggled, onToggle]);

  return (
    <View>
      {/* Label + Value - centered, large */}
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
        <View
          style={{
            height: RULER_HEIGHT,
            overflow: "visible",
          }}
          onLayout={onTrackLayout}
          collapsable={false}
        >
          {/* Edge fades - render first so ticks sit on top */}
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(17,17,17,1)", "rgba(17,17,17,1)", "rgba(17,17,17,0)"]}
            locations={[0, 0.5, 1]}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: FADE_WIDTH,
            }}
          />
          <LinearGradient
            pointerEvents="none"
            colors={["rgba(17,17,17,0)", "rgba(17,17,17,1)", "rgba(17,17,17,1)"]}
            locations={[0, 0.5, 1]}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: FADE_WIDTH,
            }}
          />

          {trackWidth > 0 && hasTicks ? (
            ticks.map((tick, i) => {
              const x = (i - scrollPosition) * TICK_GAP + trackWidth / 2;

              if (x < -FADE_WIDTH || x > trackWidth + FADE_WIDTH) {
                return null;
              }

              const screenCenter = trackWidth / 2;
              const distFromCenter = Math.abs(x - screenCenter);
              const maxDist = trackWidth / 2;
              const t = maxDist === 0 ? 0 : distFromCenter / maxDist;
              const opacity = Math.max(0.08, 1 - t * t * 0.9);

              const heightScale = Math.max(0.4, 1 - t * 0.6);
              const tickH = tick.isMajor ? MAJOR_TICK_HEIGHT : MINOR_TICK_HEIGHT;

              return (
                <View
                  key={`${tick.value}-${i}`}
                  style={{
                    position: "absolute",
                    left:
                      x -
                      (tick.isMajor ? MAJOR_TICK_WIDTH : MINOR_TICK_WIDTH) /
                      2,
                    bottom: 0,
                    height: RULER_HEIGHT,
                    opacity,
                  }}
                >
                  <View
                    style={{
                      position: "absolute",
                      bottom: TICK_LABEL_HEIGHT,
                      width: tick.isMajor
                        ? MAJOR_TICK_WIDTH
                        : MINOR_TICK_WIDTH,
                      height: tickH,
                      backgroundColor: "#fff",
                      borderRadius: 1.5,
                    }}
                  />
                  {tick.isMajor && (
                    <Text
                      style={{
                        position: "absolute",
                        bottom: -20,
                        left: -18,
                        width: 40,
                        textAlign: "center",
                        fontSize: 18,
                        color: "#fff",
                        fontFamily: "Electrolize_400Regular",
                        opacity: heightScale,
                      }}
                    >
                      {Number.isInteger(tick.value)
                        ? tick.value
                        : tick.value.toFixed(1)}
                    </Text>
                  )}
                </View>
              );
            })
          ) : (
            <>
              <View
                style={{
                  position: "absolute",
                  left: 24,
                  bottom: 0,
                  height: RULER_HEIGHT,
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    bottom: TICK_LABEL_HEIGHT,
                    width: MINOR_TICK_WIDTH,
                    height: MINOR_TICK_HEIGHT,
                    backgroundColor: "#808080",
                    borderRadius: 1,
                  }}
                />
                <Text
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: -14,
                    width: 32,
                    textAlign: "center",
                    fontSize: 11,
                    color: "#606060",
                    fontFamily: "Electrolize_400Regular",
                  }}
                >
                  {format(min, formatValue)}
                </Text>
              </View>
              <View
                style={{
                  position: "absolute",
                  right: 24,
                  bottom: 0,
                  height: RULER_HEIGHT,
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    bottom: TICK_LABEL_HEIGHT,
                    width: MINOR_TICK_WIDTH,
                    height: MINOR_TICK_HEIGHT,
                    backgroundColor: "#808080",
                    borderRadius: 1,
                  }}
                />
                <Text
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: -14,
                    width: 32,
                    textAlign: "center",
                    fontSize: 11,
                    color: "#fff",
                    fontFamily: "Electrolize_400Regular",
                  }}
                >
                  {format(max, formatValue)}
                </Text>
              </View>
            </>
          )}

          {/* Center indicator - thin red line */}
          <View
            style={{
              position: "absolute",
              left: "50%",
              top: 4,
              bottom: TICK_LABEL_HEIGHT,
              width: INDICATOR_WIDTH,
              backgroundColor: "#cc0000",
              transform: [{ translateX: -INDICATOR_WIDTH / 2 }],
              borderRadius: 2,
            }}
          />
        </View>
      </GestureDetector>
    </View>
  );
}
