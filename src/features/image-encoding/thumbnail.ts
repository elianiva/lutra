import { File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

const THUMB_SIZE = 200;
const thumbDir = new File(Paths.document, "thumbnails");

/**
 * Generate a square-cropped thumbnail for the grid.
 * Uses center-crop for accurate aspect ratio handling.
 */
export async function generateThumbnail(
	sourceUri: string,
	sourceWidth?: number,
	sourceHeight?: number,
): Promise<string> {
	// Ensure thumbnail directory exists
	await thumbDir.create({ intermediates: true });

	const filename = `thumb_${Date.now()}.jpg`;
	const dest = new File(thumbDir, filename);

	const ctx = ImageManipulator.manipulate(sourceUri);

	// If we have dimensions, do a proper center-crop
	if (sourceWidth && sourceHeight) {
		const minDim = Math.min(sourceWidth, sourceHeight);
		const cropX = (sourceWidth - minDim) / 2;
		const cropY = (sourceHeight - minDim) / 2;
		ctx.crop({ originX: cropX, originY: cropY, width: minDim, height: minDim });
	}

	ctx.resize({ width: THUMB_SIZE, height: THUMB_SIZE });
	const rendered = await ctx.renderAsync();
	const result = await rendered.saveAsync({
		compress: 0.8,
		format: SaveFormat.JPEG,
	});

	// Move to our destination
	const resultFile = new File(result.uri);
	await resultFile.move(dest);
	return dest.uri;
}
