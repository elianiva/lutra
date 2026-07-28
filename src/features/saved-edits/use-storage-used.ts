import { useQuery } from "@tanstack/react-query";
import { File } from "expo-file-system";

import { type SavedEdit } from "./db";

export function useStorageUsed(edits: SavedEdit[] | undefined) {
  return useQuery({
    queryKey: ["edits", "storage-used", edits?.length],
    queryFn: async (): Promise<number> => {
      if (!edits) return 0;
      let total = 0;
      for (const edit of edits) {
        try {
          const sourceInfo = await new File(edit.source_path).info();
          if (sourceInfo.exists && sourceInfo.size) total += sourceInfo.size;
          const thumbInfo = await new File(edit.thumbnail_path).info();
          if (thumbInfo.exists && thumbInfo.size) total += thumbInfo.size;
        } catch {
          // File may have been cleaned up by the OS
        }
      }
      return total;
    },
    enabled: !!edits,
  });
}
