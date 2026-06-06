import { Image, ImageFormat, Skia, drawAsImage, loadData } from "@shopify/react-native-skia";
import { File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Asset } from "expo-media-library";

import { type LayerSVMap } from "../components/use-layer-sv-map";
import { LayerFilter } from "../layers/filter";
import { layerRegistry } from "../layers/registry";
import { type Layer } from "../layers/types";

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
	const filters = layers
		.filter((l) => l.visible)
		.map((layer) => {
			const sv = svMap.get(layer.id);
			if (!sv) return null;
			const entry = layerRegistry[layer.type];
			return (
				<LayerFilter
					key={layer.id}
					sv={sv}
					effect={entry.effect}
					keys={Object.keys(entry.fields)}
				/>
			);
		});
	const rendered = await drawAsImage(
		<Image image={skImage} x={0} y={0} width={width} height={height} fit="contain">
			{filters}
		</Image>,
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
