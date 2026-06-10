import { Trash2 } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { type SharedValue } from "react-native-reanimated";

import { Icon } from "../../../components/ui/icon";
import { Params } from "../chain/params";
import { type Layer, type LayerPatch } from "../chain/types";

type Props = {
  layer: Layer;
  sv: Record<string, SharedValue<number>>;
  onCommit: (id: string, patch: LayerPatch) => void;
  onRemove: (id: string) => void;
};

export function EditPanel({ layer, sv, onCommit, onRemove }: Props) {
  return (
    <View className="flex-1">
      <View className="px-4 py-8 flex-1">
        <Params
          layer={layer}
          sv={sv}
          onCommit={(patch) => onCommit(layer.id, patch)}
          onRemove={() => onRemove(layer.id)}
        />
      </View>
      {/* Subtle delete button - bottom right */}
      <Pressable
        onPress={() => onRemove(layer.id)}
        className="absolute bottom-4 right-4 p-2 rounded-full"
        style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
      >
        <Icon as={Trash2} className="text-muted-foreground size-4" />
      </Pressable>
    </View>
  );
}
