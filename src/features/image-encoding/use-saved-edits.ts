import { useQuery } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";

import { type SavedEdit, parseSavedEdit } from "./db";

export const SAVED_EDITS_KEY = ["saved-edits"] as const;

export function useSavedEdits() {
	const db = useSQLiteContext();

	return useQuery({
		queryKey: SAVED_EDITS_KEY,
		queryFn: async (): Promise<SavedEdit[]> => {
			const rows = await db.getAllAsync<{
				id: number;
				source_path: string;
				preview_path: string;
				chain: string;
				thumbnail_path: string;
				created_at: string;
			}>("SELECT * FROM saved_edits ORDER BY created_at DESC");

			return rows.map(parseSavedEdit);
		},
	});
}
