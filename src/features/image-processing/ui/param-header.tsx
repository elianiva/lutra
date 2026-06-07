import { Trash2 } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "../../../components/ui/icon";
import { Text } from "../../../components/ui/text";

export function ParamHeader({ label, onRemove }: { label: string; onRemove: () => void }) {
	return (
		<View className="flex-row items-center justify-between">
			<Text className="font-medium">{label}</Text>
			<Pressable onPress={onRemove} className="px-2 py-1 active:bg-accent rounded">
				<Icon as={Trash2} className="text-destructive size-4" />
			</Pressable>
		</View>
	);
}
