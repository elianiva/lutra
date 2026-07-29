import * as Haptics from "expo-haptics";
import { useCallback } from "react";
import { View } from "react-native";

import { BottomSheet } from "../../../components/ui/bottom-sheet";
import { Text } from "../../../components/ui/text";
import { type Layer } from "../chain/types";
import { LayersPanel } from "./layers-panel";

const SHEET_HEIGHT = 420;

type LayerDrawerProps = {
	visible: boolean;
	layers: Layer[];
	selectedId: string | null;
	onClose: () => void;
	onSelect: (id: string) => void;
	onRemove: (id: string) => void;
	onReorder: (from: number, to: number) => void;
	onToggleVisible: (id: string) => void;
};

export function LayerDrawer({
	visible,
	layers,
	selectedId,
	onClose,
	onSelect,
	onRemove,
	onReorder,
	onToggleVisible,
}: LayerDrawerProps) {
	const handleSelect = useCallback((id: string) => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
		onSelect(id);
		onClose();
	}, [onSelect, onClose]);

	return (
		<BottomSheet visible={visible} onClose={onClose} height={SHEET_HEIGHT}>
			<View className="pb-4 px-4 border-b border-white/10">
				<Text
					tracking="wider"
					className="text-white text-sm"
				>
					LAYERS
				</Text>
			</View>

			<View className="flex-1">
				<LayersPanel
					layers={layers}
					selectedId={selectedId}
					onSelect={handleSelect}
					onRemove={onRemove}
					onReorder={onReorder}
					onToggleVisible={onToggleVisible}
				/>
			</View>
		</BottomSheet>
	);
}
