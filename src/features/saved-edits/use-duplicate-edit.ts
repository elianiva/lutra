import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";

import { editKeys } from "./db";

export function useDuplicateEdit() {
  const db = useSQLiteContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (editId: number) => {
      await db.runAsync(
        "INSERT INTO saved_edits (source_path, preview_path, chain, thumbnail_path) SELECT source_path, preview_path, chain, thumbnail_path FROM saved_edits WHERE id = ?",
        editId,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: editKeys.all });
    },
  });
}
