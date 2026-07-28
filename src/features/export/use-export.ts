import * as MediaLibrary from "expo-media-library";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { type Layer } from "../editor/chain/types";
import { type LayerSVMap } from "../editor/ui/use-layer-sv-map";
import { type ExportPhase, exportImage } from "./export-image";
import { imageStore } from "../saved-edits/image-store";

type PhaseLabel = "requesting_permission" | ExportPhase;

type Status =
  | { kind: "idle" }
  | { kind: "working"; phase: PhaseLabel }
  | { kind: "done" }
  | { kind: "error"; message: string };

export const STATUS_LABEL: Record<PhaseLabel, string> = {
  requesting_permission: "Requesting access to Photos…",
  loading_source: "Preparing full resolution…",
  rendering: "Rendering full resolution…",
  encoding: "Encoding JPEG…",
  saving: "Saving to Photos…",
};

export function useExport(layers: Layer[], svMap: LayerSVMap) {
  const [phase, setPhase] = useState<PhaseLabel | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const originalUri = imageStore.getSnapshot().context.originalUri;
      if (!originalUri) throw new Error("No image to export");

      setPhase("requesting_permission");
      const { status: perm } = await MediaLibrary.requestPermissionsAsync(true, ["photo"]);
      if (!perm) {
        throw new Error("Photos access denied. Enable it in Settings to export.");
      }

      await exportImage(originalUri, layers, svMap, (p) => setPhase(p));
    },
    onSettled: () => setPhase(null),
  });

  const status: Status = mutation.isPending
    ? { kind: "working", phase: phase! }
    : mutation.isError
      ? { kind: "error", message: (mutation.error as Error).message }
      : mutation.isSuccess
        ? { kind: "done" }
        : { kind: "idle" };

  return {
    status,
    exportToPhotos: mutation.mutate,
    reset: mutation.reset,
    STATUS_LABEL,
  };
}
