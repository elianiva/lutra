import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { type SharedValue, useAnimatedStyle } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { formatLayerValue, layerRegistry } from "../../layers/registry";
import { type Layer } from "../../layers/types";

export const ROW_HEIGHT = 56;
const ROW_GAP = 8;
export const SLOT_HEIGHT = ROW_HEIGHT + ROW_GAP;

export const clamp = (min: number, x: number, max: number) => {
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

  const dragPan = Gesture.Pan()
    .activateAfterLongPress(300)
    .onStart(() => {
      "worklet";
      draggedIndex.value = index;
      dragOffset.value = 0;
    })
    .onChange((e) => {
      "worklet";
      if (draggedIndex.value === index) {
        dragOffset.value = e.translationY;
      }
    })
    .onEnd(() => {
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
    });

  const tap = Gesture.Tap()
    .maxDuration(280)
    .onEnd((_e, success) => {
      "worklet";
      if (success) {
        scheduleOnRN(onSelect, layer.id);
      }
    });

  const gesture = Gesture.Exclusive(dragPan, tap);

  return (
    <Animated.View style={animatedStyle}>
      <GestureDetector gesture={gesture}>
        <View
          className={`rounded-lg p-3 flex-row items-center justify-between ${isSelected ? "bg-zinc-700" : "bg-zinc-800"}`}
          style={{ height: ROW_HEIGHT }}
        >
          <View className="flex-1">
            <Text className="text-white font-medium">
              {layerRegistry[layer.type].meta.label}
            </Text>
            <Text className="text-zinc-400 text-xs">{formatLayerValue(layer)}</Text>
          </View>
          <Pressable onPress={() => onRemove(layer.id)} hitSlop={8} className="px-2 py-1">
            <Text className="text-zinc-500 text-lg">Delete</Text>
          </Pressable>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}
