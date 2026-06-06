import * as ImagePicker from "expo-image-picker";
import { useCallback, useState } from "react";
import { Alert } from "react-native";

import { resampleForPreview } from "./resample-image";
import { imageStore } from "../state/image-store";

// `isPicking` covers the resample step only. Permission prompt and
// picker sheet are system modals that already block the user, so the
// hook doesn't need to expose a "true" state during those.
export function useImagePicker() {
	const [isPicking, setIsPicking] = useState(false);

	const pick = useCallback(async () => {
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

		setIsPicking(true);
		try {
			const previewUri = await resampleForPreview(asset.uri, asset.width, asset.height);
			imageStore.trigger.setImage({ originalUri: asset.uri, previewUri });
		} catch (err) {
			Alert.alert("Could not load image", (err as Error).message);
		} finally {
			setIsPicking(false);
		}
	}, []);

	return { pick, isPicking };
}
