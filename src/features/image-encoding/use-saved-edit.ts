import { useQuery } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";

import { type SavedEdit, parseSavedEdit } from "./db";

export const SAVED_EDIT_KEY = ["saved-edit"] as const;

export function useSavedEdit(editId: number | undefined) {
	const db = useSQLiteContext();

	return useQuery({
		queryKey: [...SAVED_EDIT_KEY, editId],
		queryFn: async (): Promise<SavedEdit | null> => {
			if (!editId) return null;

			const row = await db.getFirstAsync<{
				id: number;
				source_path: string;
				preview_path: string;
				chain: string;
				thumbnail_path: string;
				created_at: string;
			}>("SELECT * FROM saved_edits WHERE id = ?", editId);

			return row ? parseSavedEdit(row) : null;
		},
		enabled: !!editId,
	});
}
