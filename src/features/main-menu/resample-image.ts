import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

// Preview sizing. Decouples editor per-frame GPU work from the source
// image's native resolution — see ANALYSIS_SUMMARY.md §9 / Tier 3 #10.
export const PREVIEW_MAX_DIM = 960;
export const PREVIEW_JPEG_QUALITY = 0.8;

// Resample a source image so its longer edge is at most `PREVIEW_MAX_DIM`
// pixels, preserving aspect ratio, and encode as JPEG at the preview
// quality. Used immediately after the picker hands us a possibly-HUGE
// native file. Picker never crops (we keep the original aspect ratio)
// and we keep the original URI around separately for export.
export async function resampleForPreview(
	sourceUri: string,
	sourceWidth: number,
	sourceHeight: number,
): Promise<string> {
	const longest = Math.max(sourceWidth, sourceHeight);
	const scale = Math.min(1, PREVIEW_MAX_DIM / longest);
	const targetW = Math.max(1, Math.round(sourceWidth * scale));
	const targetH = Math.max(1, Math.round(sourceHeight * scale));

	const ctx = ImageManipulator.manipulate(sourceUri);
	ctx.resize({ width: targetW, height: targetH });
	const rendered = await ctx.renderAsync();
	const result = await rendered.saveAsync({
		compress: PREVIEW_JPEG_QUALITY,
		format: SaveFormat.JPEG,
	});
	return result.uri;
}
