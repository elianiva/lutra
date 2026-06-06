import { ScrollView, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";

import { type Layer } from "../../layers/types";
import { Text } from "../ui/text";
import { LayerRow } from "./layer-row";

export function LayersPanel({
	layers,
	selectedId,
	onSelect,
	onRemove,
	onReorder,
	onToggleVisible,
}: {
	layers: Layer[];
	selectedId: string | null;
	onSelect: (id: string) => void;
	onRemove: (id: string) => void;
	onReorder: (from: number, to: number) => void;
	onToggleVisible: (id: string) => void;
}) {
	const draggedIndex = useSharedValue<number | null>(null);
	const dragOffset = useSharedValue(0);

	if (layers.length === 0) {
		return (
			<View className="flex-1 items-center justify-center p-4">
				<Text variant="muted" className="text-center">
					No layers yet. Switch to Add to add one.
				</Text>
			</View>
		);
	}

	return (
		<ScrollView contentContainerClassName="p-4 gap-2" showsVerticalScrollIndicator={false}>
			{layers.map((layer, i) => (
				<LayerRow
					key={layer.id}
					layer={layer}
					index={i}
					total={layers.length}
					isSelected={layer.id === selectedId}
					onSelect={onSelect}
					onRemove={onRemove}
					onReorder={onReorder}
					onToggleVisible={onToggleVisible}
					draggedIndex={draggedIndex}
					dragOffset={dragOffset}
				/>
			))}
		</ScrollView>
	);
}
