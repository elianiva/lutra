import { useEffect, useState } from "react";
import {
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { useImage } from "@shopify/react-native-skia";
import { useSelector } from "@xstate/store-react";
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import AnimateableText from "react-native-animateable-text";
import { Pipeline } from "./Pipeline";
import { Slider } from "./Slider";
import { chainStore } from "../state/chainStore";
import { isExposure, type Layer } from "../layers/types";

const AnimatedAnimateableText = Animated.createAnimatedComponent(AnimateableText);

const PANEL_HEIGHT = 220;

export function Editor() {
  const layers = useSelector(chainStore, (s) => s.context.layers);
  const image = useImage(require("../../assets/images/sample.jpg"));
  const { width: screenW } = useWindowDimensions();
  const [canvasH, setCanvasH] = useState(0);

  const exposure = layers.find(isExposure) ?? null;

  // Live scrubbing value. v0.1: one shared value for the only supported layer.
  const stopsSV = useSharedValue(exposure?.stops ?? 0);

  // Sync SV with the layer's canonical stops when the layer identity changes
  // (added / removed). Commits from the slider don't change the id, so this
  // does not snap the slider back during a scrub.
  useEffect(() => {
    stopsSV.value = exposure?.stops ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exposure?.id]);

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    setCanvasH(e.nativeEvent.layout.height);
  };

  const onAdd = () => chainStore.trigger.add({ layerType: "exposure" });
  const onRemove = (id: string) => chainStore.trigger.remove({ id });
  const onStopsCommit = (layer: Layer, stops: number) => {
    if (layer.type !== "exposure") return;
    chainStore.trigger.updateParams({ id: layer.id, patch: { stops } });
  };

  if (!image) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <Text className="text-zinc-400">Loading…</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <View className="flex-1" onLayout={onCanvasLayout}>
        {canvasH > 0 ? (
          <Pipeline
            layers={layers}
            image={image}
            stopsSV={stopsSV}
            width={screenW}
            height={canvasH}
          />
        ) : null}
      </View>
      <View className="bg-zinc-900 px-4 pt-4 gap-3" style={{ height: PANEL_HEIGHT }}>
        {exposure ? (
          <ExposureEditor
            layer={exposure}
            stopsSV={stopsSV}
            onCommit={onStopsCommit}
            onRemove={onRemove}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Pressable onPress={onAdd} className="bg-white active:bg-zinc-200 rounded-lg px-6 py-3">
              <Text className="text-black font-medium">Add Exposure</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

type ExposureEditorProps = {
  layer: Extract<Layer, { type: "exposure" }>;
  stopsSV: SharedValue<number>;
  onCommit: (layer: Layer, stops: number) => void;
  onRemove: (id: string) => void;
};

function formatStops(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)} EV`;
}

function ExposureEditor({ layer, stopsSV, onCommit, onRemove }: ExposureEditorProps) {
  const textSV = useDerivedValue(() => formatStops(stopsSV.value));

  const animatedProps = useAnimatedProps(() => ({ text: textSV.value }));

  return (
    <>
      <View className="flex-row items-center justify-between">
        <Text className="text-white font-medium">Exposure</Text>
        <View className="flex-row items-center gap-3">
          <AnimatedAnimateableText
            animatedProps={animatedProps}
            className="text-zinc-400 text-sm w-20 text-right"
          />
          <Pressable
            onPress={() => onRemove(layer.id)}
            className="px-2 py-1 active:bg-zinc-800 rounded"
          >
            <Text className="text-zinc-400 text-sm">Remove</Text>
          </Pressable>
        </View>
      </View>
      <Slider value={stopsSV} min={-3} max={3} step={0.01} onCommit={(v) => onCommit(layer, v)} />
    </>
  );
}
