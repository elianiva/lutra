import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";
import { File } from "expo-file-system";

import { SAVED_EDITS_KEY } from "./use-saved-edits";

export function useDeleteEdit() {
	const db = useSQLiteContext();
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (editId: number) => {
			const row = await db.getFirstAsync<{
				source_path: string;
				thumbnail_path: string;
			}>("SELECT source_path, thumbnail_path FROM saved_edits WHERE id = ?", editId);

			if (row) {
				try {
					await new File(row.source_path).delete();
				} catch {}
				try {
					await new File(row.thumbnail_path).delete();
				} catch {}
			}

			await db.runAsync("DELETE FROM saved_edits WHERE id = ?", editId);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: SAVED_EDITS_KEY });
		},
	});
}
