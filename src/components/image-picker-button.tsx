import * as ImagePicker from "expo-image-picker";
import { Image as ImageIcon } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable } from "react-native";

import { resampleForPreview } from "../lib/resample-image";
import { imageStore } from "../state/image-store";
import { Text } from "./ui/text";

export function ImagePickerButton() {
	const [loading, setLoading] = useState(false);

	const pickImage = async () => {
		const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (status !== "granted") {
			Alert.alert(
				"Permission needed",
				"Access to your photo library is required to pick images.",
			);
			return;
		}

		// No `allowsEditing` / `aspect` — the picker would otherwise crop
		// to a fixed shape and discard parts of the photo. We keep the
		// full original frame and resample to a preview size ourselves
		// in `resampleForPreview`.
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ["images"],
			quality: 1,
		});

		if (result.canceled) return;
		const asset = result.assets[0];

		setLoading(true);
		try {
			const previewUri = await resampleForPreview(asset.uri, asset.width, asset.height);
			imageStore.trigger.setImage({ originalUri: asset.uri, previewUri });
		} catch (err) {
			Alert.alert("Could not load image", (err as Error).message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Pressable
			onPress={pickImage}
			disabled={loading}
			className="flex-row items-center gap-2 rounded-xl bg-muted px-4 py-3 active:opacity-70"
		>
			{loading ? (
				<ActivityIndicator size="small" />
			) : (
				<ImageIcon size={20} className="text-muted-foreground" />
			)}
			<Text variant="muted">{loading ? "Preparing preview…" : "Pick Image"}</Text>
		</Pressable>
	);
}
