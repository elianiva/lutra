import { useImage } from "@shopify/react-native-skia";
import { useMachine } from "@xstate/react";
import { useSelector } from "@xstate/store-react";
import { useSQLiteContext } from "expo-sqlite";
import { router } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, useWindowDimensions, type LayoutChangeEvent } from "react-native";

import { BackButton } from "../../components/back-button";
import { ExportPanel } from "../image-encoding/export-panel";
import { imageStore } from "../image-encoding/image-store";
import { generateThumbnail } from "../image-encoding/thumbnail";
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

type EditorProps = {
	editId?: number;
};

export function Editor({ editId }: EditorProps): ReactNode {
	const layers = useSelector(chainStore, (s) => s.context.layers);
	const previewUri = useSelector(imageStore, (s) => s.context.previewUri);
	const originalUri = useSelector(imageStore, (s) => s.context.originalUri);
	const [uiState, uiSend] = useMachine(uiMachine);
	const { mode, selectedLayerId } = uiState.context;
	const image = useImage(previewUri);
	const { width: screenW } = useWindowDimensions();
	const [canvasH, setCanvasH] = useState(0);
	const db = useSQLiteContext();
	const savedEditId = useRef(editId);
	const chainSnapshot = useRef<string>("");

	const svMap = useLayerSVMap(layers);

	// Load saved edit on mount if editId is provided
	useEffect(() => {
		if (!editId) return;

		const loadSavedEdit = async () => {
			const row = await db.getFirstAsync<{
				id: number;
				source_path: string;
				preview_path: string;
				chain: string;
				thumbnail_path: string;
			}>("SELECT * FROM saved_edits WHERE id = ?", editId);

			if (!row) return;

			const chain = JSON.parse(row.chain) as Layer[];
			chainSnapshot.current = JSON.stringify(chain);

			imageStore.trigger.setImage({
				originalUri: row.source_path,
				previewUri: row.preview_path,
			});

			// Load chain layers
			for (const layer of chain) {
				chainStore.trigger.add({ layer });
			}
		};

		loadSavedEdit();
	}, [editId, db]);

	// Auto-save on exit
	useEffect(() => {
		return () => {
			const currentLayers = chainStore.getSnapshot().context.layers;
			const currentImage = imageStore.getSnapshot().context;

			// Only save if we have an image and layers changed
			if (currentImage.originalUri && currentImage.previewUri) {
				const currentSnapshot = JSON.stringify(currentLayers);
				const hasChanges = currentSnapshot !== chainSnapshot.current;

				if (hasChanges || !savedEditId.current) {
					// Generate thumbnail
					generateThumbnail(currentImage.previewUri).then(
						async (thumbnailUri) => {
							if (savedEditId.current) {
								// Update existing edit
								await db.runAsync(
									"UPDATE saved_edits SET chain = ?, thumbnail_path = ? WHERE id = ?",
									currentSnapshot,
									thumbnailUri,
									savedEditId.current,
								);
							} else {
								// Create new edit
								await db.runAsync(
									"INSERT INTO saved_edits (source_path, preview_path, chain, thumbnail_path) VALUES (?, ?, ?, ?)",
									currentImage.originalUri,
									currentImage.previewUri,
									currentSnapshot,
									thumbnailUri,
								);
							}
						},
					);
				}
			}

			imageStore.trigger.clear();
			chainStore.trigger.clear();
		};
	}, [db]);

	const selectedLayer: Layer | null =
		layers.find((l) => l.id === selectedLayerId) ?? null;
	const selectedSVs = selectedLayer ? svMap.get(selectedLayer.id) : undefined;

	const onCanvasLayout = (e: LayoutChangeEvent) => {
		setCanvasH(e.nativeEvent.layout.height);
	};

	const onAdd = (type: LayerType) => {
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
			<View
				className="flex-1 items-center justify-center"
				onLayout={onCanvasLayout}
			>
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
