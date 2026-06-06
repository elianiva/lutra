import { Pressable, Text, View } from "react-native";

import { type PanelMode } from "../state/ui-machine";

const TABS: { key: PanelMode; label: string }[] = [
	{ key: "add", label: "Add" },
	{ key: "edit", label: "Edit" },
	{ key: "layers", label: "Layers" },
];

export function PanelTabs({
	mode,
	canEdit,
	onSwitch,
}: {
	mode: PanelMode;
	canEdit: boolean;
	onSwitch: (mode: PanelMode) => void;
}) {
	return (
		<View className="flex-row border-b border-zinc-800">
			{TABS.map((t) => {
				const active = mode === t.key;
				const disabled = t.key === "edit" && !canEdit;
				return (
					<Pressable
						key={t.key}
						onPress={() => !disabled && onSwitch(t.key)}
						className={`flex-1 py-3 items-center ${active ? "border-b-2 border-white" : ""}`}
						disabled={disabled}
					>
						<Text
							className={
								disabled
									? "text-zinc-600 text-sm font-medium"
									: active
										? "text-white text-sm font-medium"
										: "text-zinc-400 text-sm"
							}
						>
							{t.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}
