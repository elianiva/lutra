import { FlatList, Pressable } from "react-native";

import { layerRegistry } from "../layers/registry";
import { type LayerType } from "../layers/types";
import { Text } from "./ui/text";

const GRID: LayerType[] = [
  "exposure",
  "contrast",
  "shadows",
  "whiteBalance",
  "saturation",
  "grain",
  "vignette",
  "chromaticAberration",
  "clarity",
];

export function AddPanel({ onAdd }: { onAdd: (type: LayerType) => void }) {
  return (
    <FlatList
      data={GRID}
      numColumns={2}
      keyExtractor={(item) => item}
      renderItem={({ item: type }) => (
        <Pressable
          onPress={() => onAdd(type)}
          style={{ flex: 1 }}
          className="p-4 justify-center border-r border-border border-b"
        >
          <Text className="text-sm font-medium">{layerRegistry[type].meta.label}</Text>
        </Pressable>
      )}
    />
  );
}
