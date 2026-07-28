import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";
import { File } from "expo-file-system";

import { type SavedEditRow, editKeys } from "./db";

export function useClearEdits() {
  const db = useSQLiteContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const rows = await db.getAllAsync<Pick<SavedEditRow, "source_path" | "thumbnail_path">>(
        "SELECT source_path, thumbnail_path FROM saved_edits",
      );
      for (const row of rows) {
        try { await new File(row.source_path).delete(); } catch {}
        try { await new File(row.thumbnail_path).delete(); } catch {}
      }
      await db.runAsync("DELETE FROM saved_edits");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: editKeys.all });
    },
  });
}
