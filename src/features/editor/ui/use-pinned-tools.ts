import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { type LayerType } from "../chain/registry";

const STORAGE_KEY = "lutra:pinned-tools";

const DEFAULT_PINNED: LayerType[] = [
  "exposure",
  "whiteBalance",
  "saturation",
  "contrast",
  "vignette",
];

export const pinnedToolsKeys = {
  all: ["pinned-tools"] as const,
};

async function loadPinnedTools(): Promise<LayerType[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.length <= 5) {
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_PINNED;
}

export function usePinnedTools() {
  return useQuery({
    queryKey: pinnedToolsKeys.all,
    queryFn: loadPinnedTools,
    staleTime: Infinity,
  });
}

export function useSavePinnedTools() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tools: LayerType[]) => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
    },
    onSuccess: (_data, tools) => {
      queryClient.setQueryData(pinnedToolsKeys.all, tools);
    },
  });
}
