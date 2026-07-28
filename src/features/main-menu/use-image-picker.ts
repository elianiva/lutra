import * as ImagePicker from "expo-image-picker";
import { useMutation } from "@tanstack/react-query";
import { Alert } from "react-native";

import { imageStore } from "../saved-edits/image-store";
import { resampleForPreview } from "./resample-image";

type PickResult = {
  originalUri: string;
  previewUri: string;
};

// `isPending` covers the resample step only. Permission prompt and
// picker sheet are system modals that already block the user, so the
// hook doesn't need to expose a "true" state during those.
export function useImagePicker(onSuccess?: () => void) {
  return useMutation({
    mutationFn: async (): Promise<PickResult | null> => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Access to your photo library is required to pick images.",
        );
        return null;
      }

      // No `allowsEditing` / `aspect` — the picker would otherwise crop
      // to a fixed shape and discard parts of the photo. We keep the
      // full original frame and resample to a preview size ourselves
      // in `resampleForPreview`.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
      });

      if (result.canceled) return null;
      const asset = result.assets[0];

      const previewUri = await resampleForPreview(asset.uri, asset.width, asset.height);
      return { originalUri: asset.uri, previewUri };
    },
    onSuccess: (data) => {
      if (data) {
        imageStore.trigger.setImage(data);
        onSuccess?.();
      }
    },
    onError: (err) => {
      Alert.alert("Could not load image", (err as Error).message);
    },
  });
}
