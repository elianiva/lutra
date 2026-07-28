import {
  Contrast,
  Eye,
  Sun,
  Palette,
  Aperture,
  Sparkles,
  Eclipse,
  Shirt,
  Flame,
  CircleDot,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import { BottomSheet } from "../../../components/ui/bottom-sheet";
import { Icon } from "../../../components/ui/icon";
import { Text } from "../../../components/ui/text";
import { type LayerType, layerRegistry } from "../chain/registry";

const SHEET_HEIGHT = 420;

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

type ToolOverlayProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: LayerType) => void;
};

export function ToolOverlay({ visible, onClose, onSelect }: ToolOverlayProps) {
  const [activeTab, setActiveTab] = useState<"adjustments" | "luts">("adjustments");
  const tools = Object.keys(layerRegistry) as LayerType[];

  const handleSelect = useCallback(
    (type: LayerType) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelect(type);
    },
    [onSelect],
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} height={SHEET_HEIGHT}>
      <View className="flex-row border-b border-white/10">
        <Pressable
          onPress={() => setActiveTab("adjustments")}
          className={`flex-1 py-3 items-center ${activeTab === "adjustments" ? "border-b-2 border-white" : ""}`}
        >
          <Text
            style={{
              fontFamily: "Electrolize_400Regular",
              color: activeTab === "adjustments" ? "#fff" : "#666",
              letterSpacing: 2,
              fontSize: 13,
            }}
          >
            ADJUSTMENTS
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("luts")}
          className={`flex-1 py-3 items-center ${activeTab === "luts" ? "border-b-2 border-white" : ""}`}
        >
          <Text
            style={{
              fontFamily: "Electrolize_400Regular",
              color: activeTab === "luts" ? "#fff" : "#666",
              letterSpacing: 2,
              fontSize: 13,
            }}
          >
            LUTS
          </Text>
        </Pressable>
      </View>

      <View className="px-4 py-4">
        {activeTab === "adjustments" ? (
          <View className="flex-row flex-wrap gap-3">
            {tools.map((type) => {
              const LucideIcon = TOOL_ICONS[type] ?? Sun;
              const label = layerRegistry[type].label.toUpperCase();
              return (
                <Pressable
                  key={type}
                  onPress={() => handleSelect(type)}
                  className="w-[22%] items-center justify-center border border-white/20 rounded-lg py-4"
                  style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                >
                  <Icon as={LucideIcon} size={24} className="text-white mb-2" />
                  <Text
                    style={{
                      fontSize: 8,
                      color: "#fff",
                      letterSpacing: 0.5,
                      fontFamily: "Electrolize_400Regular",
                      textAlign: "center",
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View className="items-center justify-center py-12">
            <Text
              style={{
                fontFamily: "Electrolize_400Regular",
                color: "#666",
                letterSpacing: 1,
              }}
            >
              Coming soon
            </Text>
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
