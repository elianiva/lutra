import { useImage } from "@shopify/react-native-skia";
import { useMachine } from "@xstate/react";
import { useSelector } from "@xstate/store-react";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Check, ChevronUp, Layers, Menu, X } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated, { type SharedValue, makeMutable } from "react-native-reanimated";

import { BackButton } from "../../components/back-button";
import { Icon } from "../../components/ui/icon";
import { useExport } from "../export/use-export";
import { imageStore } from "../saved-edits/image-store";
import { useEdit } from "../saved-edits/use-edit";
import { useSaveEdit } from "../saved-edits/use-save-edit";
import { createLayer } from "./chain/defaults";
import { layerRegistry, type LayerType } from "./chain/registry";
import { type Layer, type LayerPatch } from "./chain/types";
import { chainStore } from "./state/chain-store";
import { uiMachine } from "./state/ui-machine";
import { DraftEditPanel } from "./ui/draft-edit-panel";
import { EditPanel } from "./ui/edit-panel";
import { ExportMenu } from "./ui/export-menu";
import { LayerDrawer } from "./ui/layer-drawer";
import { PinnedTools } from "./ui/pinned-tools";
import { Pipeline } from "./ui/pipeline";
import { ToolOverlay } from "./ui/tool-overlay";
import { useLayerSVMap } from "./ui/use-layer-sv-map";
import { usePanZoom } from "./ui/use-pan-zoom";

type EditorProps = {
	editId?: number;
};

export function Editor({ editId }: EditorProps): ReactNode {
	const layers = useSelector(chainStore, (s) => s.context.layers);
	const previewUri = useSelector(imageStore, (s) => s.context.previewUri);
	const [uiState, uiSend] = useMachine(uiMachine);
	const { selectedLayerId } = uiState.context;
	const image = useImage(previewUri);
	const { width: screenW } = useWindowDimensions();
	const [canvasH, setCanvasH] = useState(0);
	const savedEditId = useRef(editId);
	const { mutate: saveEditMutate } = useSaveEdit();
	const { data: savedEdit } = useEdit(editId);

	const [toolOverlayVisible, setToolOverlayVisible] = useState(false);
	const [layerDrawerVisible, setLayerDrawerVisible] = useState(false);
	const [exportMenuVisible, setExportMenuVisible] = useState(false);
	const [draftLayer, setDraftLayer] = useState<Layer | null>(null);

	const svMap = useLayerSVMap(layers);

	const draftSVs = useMemo(() => {
		if (!draftLayer) return null;
		const svs: Record<string, SharedValue<number>> = {};
		const entry = layerRegistry[draftLayer.type];
		for (const [key] of Object.entries(entry.fields)) {
			const val = (draftLayer as unknown as Record<string, number>)[key];
			svs[key] = makeMutable(val);
		}
		return svs;
	}, [draftLayer?.id]);

	const svMapWithDraft = useMemo(() => {
		if (!draftLayer || !draftSVs) return svMap;
		const merged = new Map(svMap);
		merged.set(draftLayer.id, draftSVs);
		return merged;
	}, [svMap, draftLayer, draftSVs]);

	const { gesture: panZoomGesture, animatedStyle: imageAnimatedStyle } = usePanZoom({
		image,
		canvasWidth: screenW,
		canvasHeight: canvasH,
	});

	const { exportToPhotos } = useExport(layers, svMap);

	const hasHydrated = useRef(false);
	useEffect(() => {
		if (!savedEdit || !Array.isArray(savedEdit.chain) || hasHydrated.current) return;
		hasHydrated.current = true;

		imageStore.trigger.setImage({
			originalUri: savedEdit.source_path,
			previewUri: savedEdit.preview_path,
		});

		for (const layer of savedEdit.chain) {
			chainStore.trigger.add({ layer });
		}
	}, [savedEdit]);

	// Auto-save on exit
	useEffect(() => {
		return () => {
			const currentImage = imageStore.getSnapshot().context;
			if (currentImage.originalUri && currentImage.previewUri) {
				saveEditMutate({ editId: savedEditId.current, svMap });
			}
			imageStore.trigger.clear();
			chainStore.trigger.clear();
		};
	}, [saveEditMutate]);

	const selectedLayer: Layer | null =
		draftLayer ?? layers.find((l) => l.id === selectedLayerId) ?? null;
	const selectedSVs = draftLayer
		? draftSVs
		: selectedLayer
			? svMap.get(selectedLayer.id)
			: undefined;

	const onToolSelect = (type: LayerType) => {
		const layer = createLayer(type);
		setDraftLayer(layer);
		setToolOverlayVisible(false);
	};

	const onConfirmDraft = () => {
		if (!draftLayer) return;
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		chainStore.trigger.add({ layer: draftLayer });
		uiSend({ type: "SELECT_LAYER", id: draftLayer.id });
		setDraftLayer(null);
	};

	const onCancelDraft = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		setDraftLayer(null);
	};

	const onSelect = (id: string) => uiSend({ type: "SELECT_LAYER", id });
	const onRemove = (id: string) => {
		chainStore.trigger.remove({ id });
		if (id === selectedLayerId) uiSend({ type: "SELECT_LAYER", id: null });
	};
	const onCommit = (id: string, patch: LayerPatch) =>
		chainStore.trigger.updateParams({ id, patch });
	const onReorder = (from: number, to: number) => chainStore.trigger.reorder({ from, to });
	const onToggleVisible = (id: string) => chainStore.trigger.toggleVisible({ id });

	const onCanvasLayout = (e: LayoutChangeEvent) => setCanvasH(e.nativeEvent.layout.height);

	const isDraftActive = draftLayer !== null;

	return (
		<View className="flex-1 bg-black">
			<BackButton onPress={() => (isDraftActive ? onCancelDraft() : router.back())} />

			<View className="absolute top-12 right-4 z-50 flex-row items-center gap-2">
				<Pressable
					onPress={() => {
						if (!isDraftActive) setLayerDrawerVisible((v) => !v);
					}}
					disabled={isDraftActive}
					hitSlop={8}
					className="h-11 w-11 items-center justify-center active:opacity-60"
				>
					<Icon as={Layers} className={isDraftActive ? "text-white/30" : "text-white"} />
				</Pressable>
				<Pressable
					onPress={() => {
						if (!isDraftActive) setExportMenuVisible((v) => !v);
					}}
					disabled={isDraftActive}
					hitSlop={8}
					className="h-11 w-11 items-center justify-center active:opacity-60"
				>
					<Icon as={Menu} className={isDraftActive ? "text-white/30" : "text-white"} />
				</Pressable>
			</View>

			{isDraftActive && (
				<View className="absolute top-12 right-4 z-50 flex-row items-center gap-4">
					<Pressable onPress={onCancelDraft} hitSlop={8} className="active:opacity-60">
						<Icon as={X} className="text-white" size={28} />
					</Pressable>
					<Pressable onPress={onConfirmDraft} hitSlop={8} className="active:opacity-60">
						<View className="h-10 w-10 rounded-full bg-white items-center justify-center">
							<Icon as={Check} className="text-black" size={20} />
						</View>
					</Pressable>
				</View>
			)}

			<View
				className="flex-1 items-center justify-center overflow-hidden"
				onLayout={onCanvasLayout}
			>
				{image && canvasH > 0 ? (
					<GestureDetector gesture={panZoomGesture}>
						<Animated.View style={imageAnimatedStyle}>
							<Pipeline
								layers={isDraftActive ? [...layers, draftLayer!] : layers}
								svMap={svMapWithDraft}
								image={image}
								width={screenW}
								height={canvasH}
							/>
						</Animated.View>
					</GestureDetector>
				) : null}
			</View>

			{isDraftActive ? (
				<View style={{ height: 240, backgroundColor: "#111" }}>
					<DraftEditPanel
						layer={draftLayer!}
						sv={draftSVs!}
						onUpdate={(patch) =>
							setDraftLayer((prev) =>
								prev ? ({ ...prev, ...patch } as Layer) : prev,
							)
						}
						onDiscard={onCancelDraft}
					/>
				</View>
			) : selectedLayer && selectedSVs ? (
				<View style={{ height: 240, backgroundColor: "#111" }}>
					<EditPanel
						layer={selectedLayer}
						sv={selectedSVs}
						onCommit={onCommit}
						onRemove={onRemove}
					/>
				</View>
			) : (
				<View style={{ height: 120, backgroundColor: "#111" }}>
					<PinnedTools onToolPress={onToolSelect} />
					<Pressable
						onPress={() => setToolOverlayVisible(true)}
						className="flex justify-center items-center"
						style={{ height: 40 }}
					>
						<Icon as={ChevronUp} className="text-white/60" size={24} />
					</Pressable>
				</View>
			)}

			<ToolOverlay
				visible={toolOverlayVisible}
				onClose={() => setToolOverlayVisible(false)}
				onSelect={onToolSelect}
			/>
			<LayerDrawer
				visible={layerDrawerVisible}
				layers={layers}
				selectedId={selectedLayerId}
				onClose={() => setLayerDrawerVisible(false)}
				onSelect={onSelect}
				onRemove={onRemove}
				onReorder={onReorder}
				onToggleVisible={onToggleVisible}
			/>
			<ExportMenu
				visible={exportMenuVisible}
				onClose={() => setExportMenuVisible(false)}
				onExport={exportToPhotos}
			/>
		</View>
	);
}
