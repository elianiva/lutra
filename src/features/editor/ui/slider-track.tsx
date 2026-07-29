import { memo } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { Text } from "../../../components/ui/text";

const RULER_HEIGHT = 86;
const MAJOR_TICK_HEIGHT = 42;
const MINOR_TICK_HEIGHT = 28;
const MAJOR_TICK_WIDTH = 3;
const MINOR_TICK_WIDTH = 3;
const INDICATOR_WIDTH = 4;
const FADE_WIDTH = 150;
const TICK_GAP = 16;
const TICK_LABEL_HEIGHT = 18;
const MINOR_COUNT = 10;

export type Tick = { value: number; isMajor: boolean };

export function generateTicks(majorTicks: number[]): Tick[] {
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

export function getValueTickPosition(value: number, ticks: Tick[]): number {
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

type SliderTrackProps = {
  trackWidth: number;
  scrollPosition: SharedValue<number>;
  ticks: Tick[];
  formatValue?: (v: number) => string;
  min: number;
  max: number;
};

export const SliderTrack = memo(function SliderTrack({
  trackWidth,
  scrollPosition,
  ticks,
  formatValue,
  min,
  max,
}: SliderTrackProps) {
  const fmt = (v: number) => (formatValue ? formatValue(v) : v.toFixed(2));

  // Translate the tick container on the UI thread — no React re-renders during panning.
  const tickScrollStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -scrollPosition.value * TICK_GAP }],
  }));

  if (trackWidth <= 0) {
    return (
      <View
        style={{
          height: RULER_HEIGHT,
          overflow: "visible",
        }}
        collapsable={false}
      />
    );
  }

  return (
    <View
      style={{
        height: RULER_HEIGHT,
        overflow: "visible",
      }}
      collapsable={false}
    >
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
          zIndex: 10,
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
          zIndex: 10,
        }}
      />

      {ticks.length > 0 ? (
        <Animated.View style={[{ position: "absolute", left: 0, right: 0, height: RULER_HEIGHT }, tickScrollStyle]}>
          {ticks.map((tick, i) => {
            const x = i * TICK_GAP + trackWidth / 2;

            const screenCenter = trackWidth / 2;
            const distFromCenter = Math.abs(x - screenCenter);
            const maxDist = trackWidth / 2;
            const t = maxDist === 0 ? 0 : distFromCenter / maxDist;
            const opacity = Math.max(0.08, 1 - t * t * 0.9);

            const tickH = tick.isMajor ? MAJOR_TICK_HEIGHT : MINOR_TICK_HEIGHT;
            const tickW = tick.isMajor ? MAJOR_TICK_WIDTH : MINOR_TICK_WIDTH;

            return (
              <View
                key={`${tick.value}-${i}`}
                style={{
                  position: "absolute",
                  left: x - tickW / 2,
                  bottom: 0,
                  height: RULER_HEIGHT,
                  opacity,
                }}
              >
                <View
                  style={{
                    position: "absolute",
                    bottom: TICK_LABEL_HEIGHT,
                    width: tickW,
                    height: tickH,
                    backgroundColor: "#fff",
                    borderRadius: 1.5,
                  }}
                />
                {tick.isMajor && (
                  <Text
                    className="text-white text-lg text-center"
                    style={{
                      position: "absolute",
                      bottom: -20,
                      left: -18,
                      width: 40,
                      opacity: Math.max(0.4, 1 - t * 0.6),
                    }}
                  >
                    {Number.isInteger(tick.value) ? tick.value : tick.value.toFixed(1)}
                  </Text>
                )}
              </View>
            );
          })}
        </Animated.View>
      ) : (
        <>
          <View style={{ position: "absolute", left: 24, bottom: 0, height: RULER_HEIGHT }}>
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
              className="text-[#606060] text-[11px] text-center"
              style={{
                position: "absolute",
                bottom: 0,
                left: -14,
                width: 32,
              }}
            >
              {fmt(min)}
            </Text>
          </View>
          <View style={{ position: "absolute", right: 24, bottom: 0, height: RULER_HEIGHT }}>
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
              className="text-white text-[11px] text-center"
              style={{
                position: "absolute",
                bottom: 0,
                left: -14,
                width: 32,
              }}
            >
              {fmt(max)}
            </Text>
          </View>
        </>
      )}

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
          zIndex: 20,
        }}
      />
    </View>
  );
});
