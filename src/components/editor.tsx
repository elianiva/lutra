import { useImage } from "@shopify/react-native-skia";
import { useMachine } from "@xstate/react";
import { useSelector } from "@xstate/store-react";
import { useState, type ReactNode } from "react";
import { Text, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";

import { type LayerType, type Layer, type SVsFor, type LayerPatch } from "../layers/types";
import { chainStore } from "../state/chain-store";
import { uiMachine, type PanelMode } from "../state/ui-machine";
import { AddPanel } from "./add-panel";
import { EditPanel } from "./edit-panel";
import { EmptyEdit } from "./empty-edit";
import { LayersPanel } from "./layers/layers-panel";
import { PanelTabs } from "./panel-tabs";
import { Pipeline } from "./pipeline";
import { useLayerSVMap } from "./use-layer-sv-map";

const PANEL_HEIGHT = 360;

export function Editor(): ReactNode {
	const layers = useSelector(chainStore, (s) => s.context.layers);
	const [uiState, uiSend] = useMachine(uiMachine);
	const { mode, selectedLayerId } = uiState.context;
	const image = useImage(require("../../assets/images/sample.jpg"));
	const { width: screenW } = useWindowDimensions();
	const [canvasH, setCanvasH] = useState(0);

	const svMap = useLayerSVMap(layers);

	const selectedLayer: Layer | null = layers.find((l) => l.id === selectedLayerId) ?? null;
	const selectedSVs = selectedLayer ? svMap.get(selectedLayer.id) : null;

	const onCanvasLayout = (e: LayoutChangeEvent) => {
		setCanvasH(e.nativeEvent.layout.height);
	};

	const onAdd = (type: LayerType) => {
		chainStore.trigger.add({ layerType: type });
		const added = chainStore.getSnapshot().context.layers.at(-1);
		if (added) {
			uiSend({ type: "LAYER_ADDED", id: added.id });
		}
	};

	const onSwitch = (next: PanelMode) => {
		if (next === "add") uiSend({ type: "SWITCH_TO_ADD" });
		if (next === "edit") uiSend({ type: "SWITCH_TO_EDIT" });
		if (next === "layers") uiSend({ type: "SWITCH_TO_LAYERS" });
	};

	const onSelect = (id: string) => uiSend({ type: "SELECT_LAYER", id });

	const onRemove = (id: string) => {
		chainStore.trigger.remove({ id });
		if (id === selectedLayerId) {
			uiSend({ type: "LAYER_REMOVED" });
		}
	};

	const onCommit = (id: string, patch: LayerPatch) => {
		chainStore.trigger.updateParams({ id, patch });
	};

	const onReorder = (from: number, to: number) => {
		chainStore.trigger.reorder({ from, to });
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
						svMap={svMap}
						image={image}
						width={screenW}
						height={canvasH}
					/>
				) : null}
			</View>
			<View className="bg-zinc-900" style={{ height: PANEL_HEIGHT }}>
				<PanelTabs mode={mode} canEdit={selectedLayer !== null} onSwitch={onSwitch} />
				<View className="flex-1">
					{mode === "add" && <AddPanel onAdd={onAdd} />}
					{mode === "edit" &&
						(selectedLayer && selectedSVs ? (
							<EditPanel
								layer={selectedLayer}
								sv={selectedSVs as SVsFor<LayerType>}
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
						/>
					)}
				</View>
			</View>
		</View>
	);
}
