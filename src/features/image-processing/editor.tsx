import { useImage } from "@shopify/react-native-skia";
import { useMachine } from "@xstate/react";
import { useSelector } from "@xstate/store-react";
import { Check, ChevronUp, Layers, Menu, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	type SharedValue,
	makeMutable,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";

import { BackButton } from "../../components/back-button";
import { Icon } from "../../components/ui/icon";
import { imageStore } from "../image-encoding/image-store";
import { useExport } from "../image-encoding/use-export";
import { useSaveEdit } from "../image-encoding/use-save-edit";
import { useSavedEdit } from "../image-encoding/use-saved-edit";
import { createLayer } from "./chain/defaults";
import { layerRegistry, type LayerType } from "./chain/registry";
import { type Layer, type LayerPatch } from "./chain/types";
import { chainStore } from "./state/chain-store";
import { uiMachine, type PanelMode } from "./state/ui-machine";
import { CustomizePinned, loadPinnedTools } from "./ui/customize-pinned";
import { DraftEditPanel } from "./ui/draft-edit-panel";
import { EditPanel } from "./ui/edit-panel";
import { EmptyEdit } from "./ui/empty-edit";
import { ExportMenu } from "./ui/export-menu";
import { LayerDrawer } from "./ui/layer-drawer";
import { PinnedTools } from "./ui/pinned-tools";
import { Pipeline } from "./ui/pipeline";
import { ToolOverlay } from "./ui/tool-overlay";
import { useLayerSVMap } from "./ui/use-layer-sv-map";

// Default pinned tools — user can customize via long-press
const DEFAULT_PINNED: LayerType[] = ["exposure", "whiteBalance", "saturation", "contrast", "vignette"];

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
	const savedEditId = useRef(editId);
	const { mutate: saveEditMutate } = useSaveEdit();
	const { data: savedEdit } = useSavedEdit(editId);

	// UI state
	const [pinnedTools, setPinnedTools] = useState<LayerType[]>(DEFAULT_PINNED);
	const [toolOverlayVisible, setToolOverlayVisible] = useState(false);
	const [layerDrawerVisible, setLayerDrawerVisible] = useState(false);
	const [exportMenuVisible, setExportMenuVisible] = useState(false);
	const [customizeVisible, setCustomizeVisible] = useState(false);
	const [draftLayer, setDraftLayer] = useState<Layer | null>(null);

	const svMap = useLayerSVMap(layers);

	// Create SVs for draft layer
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

	// Merge draft SVs into map for Pipeline
	const svMapWithDraft = useMemo(() => {
		if (!draftLayer || !draftSVs) return svMap;
		const merged = new Map(svMap);
		merged.set(draftLayer.id, draftSVs);
		return merged;
	}, [svMap, draftLayer, draftSVs]);

	// Export
	const { status: exportStatus, exportToPhotos } = useExport(layers, svMap);

	// Load pinned tools from storage on mount
	useEffect(() => {
		loadPinnedTools().then(setPinnedTools);
	}, []);

	// Hydrate stores when saved edit data arrives (once)
	const hasHydrated = useRef(false);
	useEffect(() => {
		if (!savedEdit || hasHydrated.current) return;
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

	const selectedLayer: Layer | null = draftLayer
		? draftLayer
		: layers.find((l) => l.id === selectedLayerId) ?? null;
	const selectedSVs = draftLayer
		? draftSVs
		: selectedLayer
			? svMap.get(selectedLayer.id)
			: undefined;

	const onCanvasLayout = (e: LayoutChangeEvent) => {
		setCanvasH(e.nativeEvent.layout.height);
	};

	// --- Tool selection (creates draft) ---
	const onToolSelect = (type: LayerType) => {
		const layer = createLayer(type);
		setDraftLayer(layer);
		setToolOverlayVisible(false);
	};

	// --- Confirm draft ---
	const onConfirmDraft = () => {
		if (!draftLayer) return;
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
		chainStore.trigger.add({ layer: draftLayer });
		uiSend({ type: "SELECT_LAYER", id: draftLayer.id });
		setDraftLayer(null);
	};

	// --- Cancel/discard draft ---
	const onCancelDraft = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		setDraftLayer(null);
	};

	// --- Existing layer editing ---
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

	// --- Pan / Zoom ---
	const scale = useSharedValue(1);
	const translateX = useSharedValue(0);
	const translateY = useSharedValue(0);
	const savedScale = useSharedValue(1);
	const savedTranslateX = useSharedValue(0);
	const savedTranslateY = useSharedValue(0);

	const pinchGesture = Gesture.Pinch()
		.onUpdate((e) => {
			"worklet";
			scale.value = Math.max(0.5, Math.min(savedScale.value * e.scale, 5));
		})
		.onEnd(() => {
			"worklet";
			if (scale.value < 1) {
				scale.value = withSpring(1);
				translateX.value = withSpring(0);
				translateY.value = withSpring(0);
			} else if (scale.value > 5) {
				scale.value = withSpring(5);
			}
			savedScale.value = scale.value;
			savedTranslateX.value = translateX.value;
			savedTranslateY.value = translateY.value;
		});

	const panGesture = Gesture.Pan()
		.minPointers(1)
		.onUpdate((e) => {
			"worklet";
			if (savedScale.value <= 1) return;
			translateX.value = savedTranslateX.value + e.translationX;
			translateY.value = savedTranslateY.value + e.translationY;
		})
		.onEnd(() => {
			"worklet";
			savedTranslateX.value = translateX.value;
			savedTranslateY.value = translateY.value;
		});

	const doubleTapGesture = Gesture.Tap()
		.numberOfTaps(2)
		.onEnd(() => {
			"worklet";
			if (scale.value > 1) {
				scale.value = withSpring(1);
				translateX.value = withSpring(0);
				translateY.value = withSpring(0);
				savedScale.value = 1;
				savedTranslateX.value = 0;
				savedTranslateY.value = 0;
			} else {
				scale.value = withSpring(2);
				savedScale.value = 2;
			}
		});

	const composedGestures = Gesture.Simultaneous(
		pinchGesture,
		panGesture,
		doubleTapGesture,
	);

	const imageAnimatedStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: translateX.value },
			{ translateY: translateY.value },
			{ scale: scale.value },
		],
	}));

	const isDraftActive = draftLayer !== null;

	return (
		<View className="flex-1 bg-black">
			{/* Back button */}
			<BackButton onPress={() => isDraftActive ? onCancelDraft() : router.back()} />

			{/* Top-right icons */}
			<View className="absolute top-12 right-4 z-50 flex-row items-center gap-2">
				<Pressable
					onPress={() => {
						if (!isDraftActive) setLayerDrawerVisible(true);
					}}
					disabled={isDraftActive}
					hitSlop={8}
					className="h-11 w-11 items-center justify-center active:opacity-60"
				>
					<Icon as={Layers} className={isDraftActive ? "text-white/30" : "text-white"} />
				</Pressable>
				<Pressable
					onPress={() => {
						if (!isDraftActive) setExportMenuVisible(true);
					}}
					disabled={isDraftActive}
					hitSlop={8}
					className="h-11 w-11 items-center justify-center active:opacity-60"
				>
					<Icon as={Menu} className={isDraftActive ? "text-white/30" : "text-white"} />
				</Pressable>
			</View>

			{/* Confirm/Cancel for draft mode — replaces top icons */}
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

			{/* Image area */}
			<View
				className="flex-1 items-center justify-center overflow-hidden"
				onLayout={onCanvasLayout}
			>
				{image && canvasH > 0 ? (
					<GestureDetector gesture={composedGestures}>
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

			{/* Bottom area */}
			{isDraftActive ? (
				// Draft mode: slider takes over
				<View style={{ height: 240, backgroundColor: "#111" }}>
					<DraftEditPanel
						layer={draftLayer!}
						sv={draftSVs!}
						onUpdate={(patch) => {
							// Update draft layer fields
							setDraftLayer((prev) => {
								if (!prev) return prev;
								return { ...prev, ...patch } as Layer;
							});
						}}
						onDiscard={onCancelDraft}
					/>
				</View>
			) : selectedLayer && selectedSVs ? (
				// Editing existing layer
				<View style={{ height: 240, backgroundColor: "#111" }}>
					<EditPanel
						layer={selectedLayer}
						sv={selectedSVs}
						onCommit={(id, patch) => onCommit(id, patch)}
						onRemove={(id) => onRemove(id)}
					/>
				</View>
			) : (
				// Normal mode: pinned tools + chevron
				<View style={{ backgroundColor: "#111" }}>
					<View className="py-3">
						<PinnedTools
							tools={pinnedTools}
							onToolPress={onToolSelect}
							onToolLongPress={(type) => {
								setCustomizeVisible(true);
							}}
						/>
					</View>
					<Pressable
						onPress={() => setToolOverlayVisible(true)}
						className="items-center pb-4 pt-1"
					>
						<Icon as={ChevronUp} className="text-white/60" size={24} />
					</Pressable>
				</View>
			)}

			{/* Tool overlay */}
			<ToolOverlay
				visible={toolOverlayVisible}
				onClose={() => setToolOverlayVisible(false)}
				onSelect={onToolSelect}
			/>

			{/* Layer drawer */}
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

			{/* Export menu */}
			<ExportMenu
				visible={exportMenuVisible}
				onClose={() => setExportMenuVisible(false)}
				onExport={exportToPhotos}
			/>

			{/* Customize pinned tools */}
			<CustomizePinned
				visible={customizeVisible}
				currentPinned={pinnedTools}
				onClose={(newPinned) => {
					setPinnedTools(newPinned);
					setCustomizeVisible(false);
				}}
			/>
		</View>
	);
}
