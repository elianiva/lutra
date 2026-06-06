import { createStore } from "@xstate/store";

// Two URIs because they serve different purposes:
// - `originalUri`: full-resolution file from the picker, kept around
//   for the export pipeline to re-decode at full res. The editor
//   never reads from this URI; the export loads it on demand.
// - `previewUri`: 960px / JPEG 80% resample of the original, the
//   only thing the editor renders. Keeps per-frame GPU work cheap
//   regardless of the source's native size.
type ImageState = {
	originalUri: string | null;
	previewUri: string | null;
};

export const imageStore = createStore({
	context: { originalUri: null, previewUri: null } as ImageState,
	on: {
		setImage: (_ctx, event: { originalUri: string; previewUri: string }) => ({
			originalUri: event.originalUri,
			previewUri: event.previewUri,
		}),
		clear: () => ({ originalUri: null, previewUri: null }),
	},
});
