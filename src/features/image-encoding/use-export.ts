import * as MediaLibrary from "expo-media-library";
import { useState } from "react";

import { type Layer } from "../image-processing/chain/types";
import { type LayerSVMap } from "../image-processing/ui/use-layer-sv-map";
import { type ExportPhase, exportImage } from "./export-image";
import { imageStore } from "./image-store";

type Status =
	| { kind: "idle" }
	| { kind: "working"; phase: "requesting_permission" | ExportPhase }
	| { kind: "done" }
	| { kind: "error"; message: string };

export const STATUS_LABEL: Record<"requesting_permission" | ExportPhase, string> = {
	requesting_permission: "Requesting access to Photos…",
	loading_source: "Preparing full resolution…",
	rendering: "Rendering full resolution…",
	encoding: "Encoding JPEG…",
	saving: "Saving to Photos…",
};

export function useExport(layers: Layer[], svMap: LayerSVMap) {
	const [status, setStatus] = useState<Status>({ kind: "idle" });

	const exportToPhotos = async () => {
		const originalUri = imageStore.getSnapshot().context.originalUri;
		if (!originalUri) return;

		try {
			setStatus({ kind: "working", phase: "requesting_permission" });
			const { status: perm } = await MediaLibrary.requestPermissionsAsync(true, ["photo"]);
			if (!perm) {
				setStatus({
					kind: "error",
					message: "Photos access denied. Enable it in Settings to export.",
				});
				return;
			}
			await exportImage(originalUri, layers, svMap, (phase) => {
				setStatus({ kind: "working", phase });
			});
			setStatus({ kind: "done" });
		} catch (err) {
			const message = (err as Error).message;
			setStatus({ kind: "error", message });
		}
	};

	const reset = () => setStatus({ kind: "idle" });

	return { status, exportToPhotos, reset, STATUS_LABEL };
}
