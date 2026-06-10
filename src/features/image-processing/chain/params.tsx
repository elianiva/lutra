import { useCallback, useState } from "react";
import { View } from "react-native";
import { type SharedValue } from "react-native-reanimated";

import { Slider } from "../ui/slider";
import { type FieldDef } from "./format";
import { resolveFormat } from "./format";
import { layerRegistry } from "./registry";
import { type Layer, type LayerPatch } from "./types";

type ParamsProps = {
  layer: Layer;
  sv: Record<string, SharedValue<number>>;
  onCommit: (patch: LayerPatch) => void;
  onRemove: () => void;
};

export function Params({ layer, onCommit, onRemove, sv }: ParamsProps) {
  const entry = layerRegistry[layer.type];
  const fields = entry.fields as Record<string, FieldDef>;
  const fieldKeys = Object.keys(fields);
  const isToggled = "toggled" in entry && entry.toggled && fieldKeys.length > 1;

  const [activeFieldIndex, setActiveFieldIndex] = useState(0);
  const activeFieldKey = fieldKeys[activeFieldIndex];
  const activeField = fields[activeFieldKey];

  const handleToggle = useCallback(() => {
    setActiveFieldIndex((prev) => (prev + 1) % fieldKeys.length);
  }, [fieldKeys.length]);

  if (isToggled) {
    return (
      <View className="gap-3">
        <Slider
          value={sv[activeFieldKey]}
          min={activeField.min}
          max={activeField.max}
          step={activeField.step}
          label={activeField.label}
          formatValue={resolveFormat(activeField.format)}
          majorTicks={activeField.majorTicks}
          onCommit={(v) =>
            onCommit({ type: layer.type, patch: { [activeFieldKey]: v } } as LayerPatch)
          }
          toggled
          activeField={activeFieldKey}
          onToggle={handleToggle}
        />
      </View>
    );
  }

  return (
    <View className="gap-3">
      {Object.entries(fields).map(([key, field]) => (
        <Slider
          key={key}
          value={sv[key]}
          min={field.min}
          max={field.max}
          step={field.step}
          label={field.label}
          formatValue={resolveFormat(field.format)}
          majorTicks={field.majorTicks}
          onCommit={(v) =>
            onCommit({ type: layer.type, patch: { [key]: v } } as LayerPatch)
          }
        />
      ))}
    </View>
  );
}
