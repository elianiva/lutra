import * as ImagePicker from "expo-image-picker";
import { Image as ImageIcon } from "lucide-react-native";
import { Alert, Pressable } from "react-native";

import { imageStore } from "../state/image-store";
import { Text } from "./ui/text";

export function ImagePickerButton() {
	const pickImage = async () => {
		const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (status !== "granted") {
			Alert.alert("Permission needed", "Access to your photo library is required to pick images.");
			return;
		}

		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ["images"],
			allowsEditing: true,
			aspect: [4, 3],
			quality: 1,
		});

		if (!result.canceled) {
			imageStore.trigger.setImage({ uri: result.assets[0].uri });
		}
	};

	return (
		<Pressable
			onPress={pickImage}
			className="flex-row items-center gap-2 rounded-xl bg-muted px-4 py-3 active:opacity-70"
		>
			<ImageIcon size={20} className="text-muted-foreground" />
			<Text variant="muted">Pick Image</Text>
		</Pressable>
	);
}
