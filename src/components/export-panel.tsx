import { useSelector } from "@xstate/store-react";
import * as MediaLibrary from "expo-media-library";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";

import { type Layer } from "../layers/types";
import { type ExportPhase, exportImage } from "../lib/export-image";
import { imageStore } from "../state/image-store";
import { Text } from "./ui/text";
import { type LayerSVMap } from "./use-layer-sv-map";

// Coarse-grained status. The user only needs to know "preparing",
// "rendering", "done", or "something went wrong". The `working` state
// carries a sub-phase so the spinner label can update as the export
// walks through transcode → render → encode → save.
type Status =
	| { kind: "idle" }
	| { kind: "working"; phase: "requesting_permission" | ExportPhase }
	| { kind: "done" }
	| { kind: "error"; message: string };

const STATUS_LABEL: Record<"requesting_permission" | ExportPhase, string> = {
	requesting_permission: "Requesting access to Photos…",
	loading_source: "Preparing full resolution…",
	rendering: "Rendering full resolution…",
	encoding: "Encoding JPEG…",
	saving: "Saving to Photos…",
};

type Props = {
	layers: Layer[];
	svMap: LayerSVMap;
};

export function ExportPanel({ layers, svMap }: Props) {
	const originalUri = useSelector(imageStore, (s) => s.context.originalUri);
	const [status, setStatus] = useState<Status>({ kind: "idle" });

	const onExport = async () => {
		if (!originalUri) return;
		try {
			setStatus({ kind: "working", phase: "requesting_permission" });
			// writeOnly: true — we never read from the library, only save.
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
			Alert.alert("Export failed", message);
			setStatus({ kind: "error", message });
		}
	};

	return (
		<View className="p-4 flex-1">
			<View className="flex-1 items-center justify-center gap-4">
				{status.kind === "idle" || status.kind === "done" || status.kind === "error" ? (
					<Pressable
						onPress={onExport}
						className="rounded-xl bg-primary px-6 py-3 active:opacity-70"
					>
						<Text className="text-primary-foreground font-medium">Save to Photos</Text>
					</Pressable>
				) : (
					<View className="flex-row items-center gap-2">
						<ActivityIndicator />
						<Text variant="muted">{STATUS_LABEL[status.phase]}</Text>
					</View>
				)}

				{status.kind === "done" && <Text variant="muted">Saved to Photos.</Text>}
				{status.kind === "error" && (
					<Text variant="muted" className="text-destructive text-center">
						{status.message}
					</Text>
				)}
			</View>
		</View>
	);
}
