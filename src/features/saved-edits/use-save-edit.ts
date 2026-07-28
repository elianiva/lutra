import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useSQLiteContext } from "expo-sqlite";

import { chainStore } from "../editor/state/chain-store";
import { imageStore } from "./image-store";
import { generateEditedThumbnail } from "./thumbnail";
import { type LayerSVMap } from "../editor/ui/use-layer-sv-map";
import { editKeys } from "./db";

type SaveEditParams = {
  editId?: number;
  svMap: LayerSVMap;
};

export function useSaveEdit() {
  const db = useSQLiteContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ editId, svMap }: SaveEditParams) => {
      const layers = chainStore.getSnapshot().context.layers;
      const image = imageStore.getSnapshot().context;
      if (!image.originalUri || !image.previewUri) return;

      const chainJson = JSON.stringify(layers);
      const thumbnailUri = await generateEditedThumbnail(image.previewUri, layers, svMap);

      if (editId) {
        await db.runAsync(
          "UPDATE saved_edits SET chain = ?, thumbnail_path = ? WHERE id = ?",
          chainJson,
          thumbnailUri,
          editId,
        );
      } else {
        await db.runAsync(
          "INSERT INTO saved_edits (source_path, preview_path, chain, thumbnail_path) VALUES (?, ?, ?, ?)",
          image.originalUri,
          image.previewUri,
          chainJson,
          thumbnailUri,
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: editKeys.all });
    },
    onError: (err) => {
      console.error("Failed to save edit:", err);
      Alert.alert("Save failed", (err as Error).message);
    },
  });
}
