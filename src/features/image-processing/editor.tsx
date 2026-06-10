import { useImage } from "@shopify/react-native-skia";
import { useMachine } from "@xstate/react";
import { useSelector } from "@xstate/store-react";
import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { View, useWindowDimensions, type LayoutChangeEvent } from "react-native";

import { BackButton } from "../../components/back-button";
import { ExportPanel } from "../image-encoding/export-panel";
import { imageStore } from "../image-encoding/image-store";
import { createLayer } from "./chain/defaults";
import { type LayerType } from "./chain/registry";
import { type Layer, type LayerPatch } from "./chain/types";
import { chainStore } from "./state/chain-store";
import { uiMachine, type PanelMode } from "./state/ui-machine";
import { AddPanel } from "./ui/add-panel";
import { EditPanel } from "./ui/edit-panel";
import { EmptyEdit } from "./ui/empty-edit";
import { LayersPanel } from "./ui/layers-panel";
import { PanelTabs } from "./ui/panel-tabs";
import { Pipeline } from "./ui/pipeline";
import { useLayerSVMap } from "./ui/use-layer-sv-map";

const PANEL_HEIGHT = 360;

export function Editor(): ReactNode {
  const layers = useSelector(chainStore, (s) => s.context.layers);
  const previewUri = useSelector(imageStore, (s) => s.context.previewUri);
  const originalUri = useSelector(imageStore, (s) => s.context.originalUri);
  const [uiState, uiSend] = useMachine(uiMachine);
  const { mode, selectedLayerId } = uiState.context;
  const image = useImage(previewUri);
  const { width: screenW } = useWindowDimensions();
  const [canvasH, setCanvasH] = useState(0);

  const svMap = useLayerSVMap(layers);

  // "Back = cancel" lives here so every exit path (back button, OS
  // gesture, hot reload) clears the session automatically. See
  // CONTEXT.md → Screens → Back behavior.
  useEffect(() => {
    return () => {
      imageStore.trigger.clear();
      chainStore.trigger.clear();
    };
  }, []);

  const selectedLayer: Layer | null = layers.find((l) => l.id === selectedLayerId) ?? null;
  const selectedSVs = selectedLayer ? svMap.get(selectedLayer.id) : undefined;

  const onCanvasLayout = (e: LayoutChangeEvent) => {
    setCanvasH(e.nativeEvent.layout.height);
  };

  const onAdd = (type: LayerType) => {
    // Generate the layer (and its id) up front so we can dispatch
    // SELECT_LAYER with the new id without a snapshot read-back.
    const layer = createLayer(type);
    chainStore.trigger.add({ layer });
    uiSend({ type: "SELECT_LAYER", id: layer.id });
  };

  const onSwitch = (next: PanelMode) => uiSend({ type: "SWITCH_TO", mode: next });

  const onSelect = (id: string) => uiSend({ type: "SELECT_LAYER", id });

  const onRemove = (id: string) => {
    chainStore.trigger.remove({ id });
    if (id === selectedLayerId) {
      uiSend({ type: "SELECT_LAYER", id: null });
    }
  };

  const onCommit = (id: string, patch: LayerPatch) => {
    chainStore.trigger.updateParams({ id, patch });
  };

  const onReorder = (from: number, to: number) => {
    chainStore.trigger.reorder({ from, to });
  };

  const onToggleVisible = (id: string) => {
    chainStore.trigger.toggleVisible({ id });
  };

  return (
    <View className="flex-1 bg-background">
      <BackButton onPress={() => router.back()} />
      <View className="flex-1 items-center justify-center" onLayout={onCanvasLayout}>
        {image && canvasH > 0 ? (
          <Pipeline
            layers={layers}
            svMap={svMap}
            image={image}
            width={screenW}
            height={canvasH}
          />
        ) : null}
      </View>
      <View style={{ height: PANEL_HEIGHT, backgroundColor: "#111" }}>
        <PanelTabs
          mode={mode}
          canEdit={selectedLayer !== null}
          canExport={originalUri !== null}
          onSwitch={onSwitch}
        />
        <View className="flex-1">
          {mode === "add" && <AddPanel onAdd={onAdd} />}
          {mode === "edit" &&
            (selectedLayer && selectedSVs ? (
              <EditPanel
                layer={selectedLayer}
                sv={selectedSVs}
                onCommit={onCommit}
                onRemove={onRemove}
              />
            ) : (
              <EmptyEdit />
            ))}
          {mode === "layers" && (
            <LayersPanel
              layers={layers}
              selectedId={selectedLayerId}
              onSelect={onSelect}
              onRemove={onRemove}
              onReorder={onReorder}
              onToggleVisible={onToggleVisible}
            />
          )}
          {mode === "export" && <ExportPanel layers={layers} svMap={svMap} />}
        </View>
      </View>
    </View>
  );
}
