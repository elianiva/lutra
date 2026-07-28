import { useQuery } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";

import { type SavedEdit, type SavedEditRow, editKeys, parseSavedEdit } from "./db";

export function useEdit(editId: number | undefined) {
  const db = useSQLiteContext();

  return useQuery({
    queryKey: editKeys.detail(editId ?? -1),
    queryFn: async (): Promise<SavedEdit | null> => {
      if (!editId) return null;
      const row = await db.getFirstAsync<SavedEditRow>(
        "SELECT * FROM saved_edits WHERE id = ?",
        editId,
      );
      return row ? parseSavedEdit(row) : null;
    },
    enabled: !!editId,
  });
}
