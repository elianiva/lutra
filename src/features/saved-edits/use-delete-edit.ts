import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";
import { File } from "expo-file-system";

import { type SavedEditRow, editKeys } from "./db";

export function useDeleteEdit() {
  const db = useSQLiteContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (editId: number) => {
      const row = await db.getFirstAsync<Pick<SavedEditRow, "source_path" | "thumbnail_path">>(
        "SELECT source_path, thumbnail_path FROM saved_edits WHERE id = ?",
        editId,
      );
      if (row) {
        try { await new File(row.source_path).delete(); } catch {}
        try { await new File(row.thumbnail_path).delete(); } catch {}
      }
      await db.runAsync("DELETE FROM saved_edits WHERE id = ?", editId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: editKeys.all });
    },
  });
}
