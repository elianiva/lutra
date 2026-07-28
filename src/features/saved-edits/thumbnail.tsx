import { Canvas, Fill, ImageFormat, ImageShader, Shader, Skia, drawAsImage, loadData } from "@shopify/react-native-skia";
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { chainCache } from "../editor/chain/chain-cache";
import { layerRegistry } from "../editor/chain/registry";
import { type Layer } from "../editor/chain/types";
import { type LayerSVMap } from "../editor/ui/use-layer-sv-map";

const THUMB_SIZE = 200;
const thumbDir = new Directory(Paths.document, "thumbnails");

/**
 * Generate a thumbnail from the edited image using the shader pipeline.
 * Renders at THUMB_SIZE x THUMB_SIZE.
 */
export async function generateEditedThumbnail(
	sourceUri: string,
	layers: Layer[],
	svMap: LayerSVMap,
): Promise<string> {
	await thumbDir.create({ intermediates: true, idempotent: true });

	const filename = `thumb_${Date.now()}.jpg`;
	const dest = new File(thumbDir, filename);

	// Transcode to JPEG for Skia
	const ctx = ImageManipulator.manipulate(sourceUri);
	const ref = await ctx.renderAsync();
	const { uri: jpegUri } = await ref.saveAsync({
		format: SaveFormat.JPEG,
		compress: 1,
	});
	const skImage = await loadData(jpegUri, (d) => Skia.Image.MakeImageFromEncoded(d));
	if (!skImage) {
		throw new Error("Failed to decode source for thumbnail");
	}

	// Build uniforms from active layers
	const activeLayers = layers.filter((l) => l.visible);
	const { effect } = chainCache.get(activeLayers);
	const uniforms: Record<string, number> = {};
	activeLayers.forEach((layer, i) => {
		const sv = svMap.get(layer.id);
		const entry = layerRegistry[layer.type];
		for (const key of Object.keys(entry.fields)) {
			uniforms[`l${i}_${key}`] = sv ? sv[key].value : (entry.fields as Record<string, { default: number }>)[key].default;
		}
	});

	// Render at thumbnail size
	const rendered = await drawAsImage(
		<Canvas style={{ width: THUMB_SIZE, height: THUMB_SIZE }}>
			<Fill>
				<Shader source={effect} uniforms={uniforms}>
					<ImageShader
						image={skImage}
						fit="contain"
						rect={{ x: 0, y: 0, width: THUMB_SIZE, height: THUMB_SIZE }}
					/>
				</Shader>
			</Fill>
		</Canvas>,
		{ width: THUMB_SIZE, height: THUMB_SIZE },
	);
	if (!rendered) {
		throw new Error("Failed to render thumbnail");
	}

	// Encode and save
	const bytes = rendered.encodeToBytes(ImageFormat.JPEG, 80);
	dest.create({ overwrite: true });
	dest.write(bytes);

	return dest.uri;
}
