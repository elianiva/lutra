import { Canvas, Image, type SkImage } from "@shopify/react-native-skia";

import { LayerFilter } from "../layers/filter";
import { layerRegistry } from "../layers/registry";
import { type Layer } from "../layers/types";
import { type LayerSVMap } from "./use-layer-sv-map";

type PipelineProps = {
	layers: Layer[];
	svMap: LayerSVMap;
	image: SkImage;
	width: number;
	height: number;
};

export function Pipeline({ layers, svMap, image, width, height }: PipelineProps) {
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

	return (
		<Canvas style={{ width, height }}>
			<Image image={image} x={0} y={0} width={width} height={height} fit="contain">
				{filters}
			</Image>
		</Canvas>
	);
}
