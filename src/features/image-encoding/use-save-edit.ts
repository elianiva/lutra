import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";

import { chainStore } from "../image-processing/state/chain-store";
import { imageStore } from "./image-store";
import { generateEditedThumbnail } from "./thumbnail";
import { SAVED_EDITS_KEY } from "./use-saved-edits";
import { type LayerSVMap } from "../image-processing/ui/use-layer-sv-map";

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
			const thumbnailUri = await generateEditedThumbnail(
				image.previewUri,
				layers,
				svMap,
			);

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
			queryClient.invalidateQueries({ queryKey: SAVED_EDITS_KEY });
		},
	});
}
