import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSQLiteContext } from "expo-sqlite";

import { editKeys } from "./db";

type CreateEditParams = {
  originalUri: string;
  previewUri: string;
};

/**
 * Immediately persist a new edit project before navigating to the editor.
 * Uses the preview image as the initial thumbnail — no shader rendering
 * needed since there are no layers yet. The editor's auto-save on exit
 * will update `chain` and `thumbnail_path` if the user added adjustments.
 */
export function useCreateEdit() {
  const db = useSQLiteContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ originalUri, previewUri }: CreateEditParams): Promise<number> => {
      const result = await db.runAsync(
        `INSERT INTO saved_edits (source_path, preview_path, chain, thumbnail_path)
         VALUES (?, ?, ?, ?)`,
        originalUri,
        previewUri,
        "[]",
        previewUri, // initial thumbnail = unedited preview
      );
      return result.lastInsertRowId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: editKeys.all });
    },
    onError: (err) => {
      console.error("Failed to create edit:", err);
    },
  });
}
