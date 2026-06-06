import { Pressable, View } from "react-native";

import { type PanelMode } from "../state/ui-machine";
import { Separator } from "./ui/separator";
import { Text } from "./ui/text";

const TABS: { key: PanelMode; label: string }[] = [
	{ key: "add", label: "Add" },
	{ key: "edit", label: "Edit" },
	{ key: "layers", label: "Layers" },
	{ key: "export", label: "Export" },
];

type Props = {
	mode: PanelMode;
	canEdit: boolean;
	canExport: boolean;
	onSwitch: (mode: PanelMode) => void;
};

export function PanelTabs({ mode, canEdit, canExport, onSwitch }: Props) {
	return (
		<View>
			<View className="flex-row">
				{TABS.map((t) => {
					const active = mode === t.key;
					const disabled =
						(t.key === "edit" && !canEdit) || (t.key === "export" && !canExport);
					return (
						<Pressable
							key={t.key}
							onPress={() => !disabled && onSwitch(t.key)}
							className={`flex-1 py-3 items-center ${active ? "border-b-2 border-primary" : ""}`}
							disabled={disabled}
						>
							<Text
								variant="small"
								className={
									disabled
										? "text-muted-foreground"
										: active
											? "text-primary font-medium"
											: "text-muted-foreground"
								}
							>
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
