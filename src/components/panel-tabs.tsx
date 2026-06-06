import { Pressable, View } from "react-native";

import { type PanelMode } from "../state/ui-machine";
import { Separator } from "./ui/separator";
import { Text } from "./ui/text";

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
		<View>
			<View className="flex-row">
				{TABS.map((t) => {
					const active = mode === t.key;
					const disabled = t.key === "edit" && !canEdit;
					return (
						<Pressable
							key={t.key}
							onPress={() => !disabled && onSwitch(t.key)}
							className={`flex-1 py-3 items-center ${active ? "border-b-2 border-primary" : ""}`}
							disabled={disabled}>
							<Text
								variant="small"
								className={
									disabled
										? "text-muted-foreground"
										: active
											? "text-primary font-medium"
											: "text-muted-foreground"
								}>
								{t.label}
							</Text>
						</Pressable>
					);
				})}
			</View>
			<Separator />
		</View>
	);
}
