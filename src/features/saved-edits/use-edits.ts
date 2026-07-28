import { useQuery } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";

import { type SavedEdit, type SavedEditRow, editKeys, parseSavedEdit } from "./db";

export function useEdits() {
  const db = useSQLiteContext();

  return useQuery({
    queryKey: editKeys.all,
    queryFn: async (): Promise<SavedEdit[]> => {
      const rows = await db.getAllAsync<SavedEditRow>(
        "SELECT * FROM saved_edits ORDER BY created_at DESC",
      );
      return rows.map(parseSavedEdit);
    },
  });
}
