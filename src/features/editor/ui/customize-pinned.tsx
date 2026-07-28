import * as Haptics from "expo-haptics";
import { Check, Sun, Contrast, Eye, Palette, Aperture, Eclipse, Sparkles, Shirt, CircleDot, Flame } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { BottomSheet } from "../../../components/ui/bottom-sheet";
import { Icon } from "../../../components/ui/icon";
import { Text } from "../../../components/ui/text";
import { layerRegistry, type LayerType } from "../chain/registry";
import { useSavePinnedTools } from "./use-pinned-tools";

const SHEET_HEIGHT = 500;

const TOOL_ICONS: Record<string, typeof Sun> = {
  exposure: Sun,
  contrast: Contrast,
  saturation: Palette,
  whiteBalance: Eye,
  vignette: Aperture,
  shadows: Eclipse,
  highlights: Sparkles,
  grain: Shirt,
  chromaticAberration: CircleDot,
  clarity: Flame,
};

type CustomizePinnedProps = {
  visible: boolean;
  currentPinned: LayerType[];
  onClose: () => void;
};

export function CustomizePinned({ visible, currentPinned, onClose }: CustomizePinnedProps) {
  const [selected, setSelected] = useState<LayerType[]>(currentPinned);
  const savePinned = useSavePinnedTools();
  const allTools = Object.keys(layerRegistry) as LayerType[];

  useEffect(() => {
    if (visible) setSelected(currentPinned);
  }, [visible, currentPinned]);

  const toggleTool = useCallback((type: LayerType) => {
    Haptics.selectionAsync();
    setSelected((prev) => {
      if (prev.includes(type)) {
        if (prev.length <= 1) return prev;
        return prev.filter((t) => t !== type);
      }
      if (prev.length >= 5) return prev;
      return [...prev, type];
    });
  }, []);

  const handleConfirm = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    savePinned.mutate(selected, {
      onSuccess: () => onClose(),
      onError: () => onClose(),
    });
  }, [selected, onClose, savePinned]);

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <BottomSheet visible={visible} onClose={handleCancel} height={SHEET_HEIGHT}>
      <View className="px-4 pb-3 flex-row items-center justify-between">
        <Text
          style={{
            fontFamily: "Electrolize_400Regular",
            color: "#fff",
            letterSpacing: 2,
            fontSize: 14,
          }}
        >
          CUSTOMIZE TOOLS
        </Text>
        <Text
          style={{
            fontFamily: "Electrolize_400Regular",
            color: "#666",
            fontSize: 12,
          }}
        >
          {selected.length}/5
        </Text>
      </View>

      <ScrollView className="px-4 pb-8" style={{ maxHeight: 350 }}>
        <View className="flex-row flex-wrap gap-3">
          {allTools.map((type) => {
            const LucideIcon = TOOL_ICONS[type] ?? Sun;
            const label = layerRegistry[type].label.toUpperCase();
            const isSelected = selected.includes(type);
            return (
              <Pressable
                key={type}
                onPress={() => toggleTool(type)}
                className="w-[22%] items-center justify-center border rounded-lg py-4"
                style={{
                  borderColor: isSelected ? "#fff" : "rgba(255,255,255,0.2)",
                  backgroundColor: isSelected
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(255,255,255,0.03)",
                }}
              >
                <Icon
                  as={LucideIcon}
                  size={24}
                  className={isSelected ? "text-white" : "text-white/60"}
                />
                <Text
                  style={{
                    fontSize: 8,
                    color: isSelected ? "#fff" : "#999",
                    letterSpacing: 0.5,
                    fontFamily: "Electrolize_400Regular",
                    textAlign: "center",
                    marginTop: 8,
                  }}
                >
                  {label}
                </Text>
                {isSelected && (
                  <View className="absolute top-2 right-2">
                    <Icon as={Check} className="text-white" size={12} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="px-4 pb-8">
        <Pressable
          onPress={handleConfirm}
          className="items-center py-3 rounded-xl"
          style={{ backgroundColor: "#fff" }}
        >
          <Text
            style={{
              fontFamily: "Electrolize_400Regular",
              color: "#000",
              letterSpacing: 2,
              fontSize: 13,
            }}
          >
            DONE
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}


