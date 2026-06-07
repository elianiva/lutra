import {
	Canvas,
	Fill,
	ImageFormat,
	ImageShader,
	Shader,
	Skia,
	drawAsImage,
	loadData,
} from "@shopify/react-native-skia";
import { File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Asset } from "expo-media-library";

import { chainCache } from "../image-processing/chain/chain-cache";
import { layerRegistry } from "../image-processing/chain/registry";
import { type Layer } from "../image-processing/chain/types";
import { type LayerSVMap } from "../image-processing/ui/use-layer-sv-map";

// Fixed for v1: full source resolution, JPEG, no quality slider. The
// deliberate simplification is documented in ADR 0005.
export const EXPORT_JPEG_QUALITY = 100;

// Phases the export walks through. The UI surface is a single spinner
// whose label changes as we report progress — there's no percentage,
// because none of the underlying APIs expose one. Real progress would
// require splitting each phase into its own observable (e.g. a worker
// thread for the render, a progress pipe for the encode), which is out
// of scope for v1.
export type ExportPhase = "loading_source" | "rendering" | "encoding" | "saving";

export async function exportImage(
	originalUri: string,
	layers: Layer[],
	svMap: LayerSVMap,
	onProgress: (phase: ExportPhase) => void,
): Promise<void> {
	// Transcode the source (could be HEIC, PNG, DNG, ...) to JPEG at
	// full resolution before handing it to Skia. Skia's built-in
	// decoder doesn't speak HEIC, and reading the source as a
	// `Uint8Array` to pass to `Skia.Data.fromBytes` would force us to
	// load the entire multi-megapixel file into JS memory.
	onProgress("loading_source");
	const ctx = ImageManipulator.manipulate(originalUri);
	const ref = await ctx.renderAsync();
	const {
		uri: jpegUri,
		width,
		height,
	} = await ref.saveAsync({
		format: SaveFormat.JPEG,
		compress: 1,
	});
	const skImage = await loadData(jpegUri, (d) => Skia.Image.MakeImageFromEncoded(d));
	if (!skImage) {
		throw new Error("Failed to decode source image");
	}

	onProgress("rendering");
	const activeLayers = layers.filter((l) => l.visible);
	const { effect } = chainCache.get(activeLayers);
	const uniforms: Record<string, number> = {};
	activeLayers.forEach((layer, i) => {
		const sv = svMap.get(layer.id);
		if (!sv) return;
		const entry = layerRegistry[layer.type];
		for (const key of Object.keys(entry.fields)) {
			uniforms[`l${i}_${key}`] = sv[key].value;
		}
	});
	const rendered = await drawAsImage(
		<Canvas style={{ width, height }}>
			<Fill>
				<Shader source={effect} uniforms={uniforms}>
					<ImageShader
						image={skImage}
						fit="contain"
						rect={{ x: 0, y: 0, width, height }}
					/>
				</Shader>
			</Fill>
		</Canvas>,
		{ width, height },
	);
	if (!rendered) {
		throw new Error("Failed to render export");
	}

	onProgress("encoding");
	const bytes = rendered.encodeToBytes(ImageFormat.JPEG, EXPORT_JPEG_QUALITY);

	onProgress("saving");
	// `Asset.create` reads from a file path, so we have to land the
	// bytes on disk first. Cache is fine — we hand ownership to the
	// library immediately after, and the OS reclaims the cache on its
	// own schedule.
	const file = new File(Paths.cache, `lutra-${Date.now()}.jpg`);
	file.create({ overwrite: true });
	file.write(bytes);
	await Asset.create(file.uri);
}
