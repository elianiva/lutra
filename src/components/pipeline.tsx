import { Canvas, Image, RuntimeShader, type SkImage } from "@shopify/react-native-skia";
import { type ReactNode } from "react";

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
	// `reduce` (left-to-right) makes index 0 the innermost (closest to the
	// source Image) — i.e. the first array element is the first shader to
	// see the raw pixels, matching the Layers panel's "top = first" mental
	// model.
	const wrapped = layers.reduce<ReactNode>(
		(child, layer) => {
			const sv = svMap.get(layer.id);
			if (!sv) return child;
			const View = layerRegistry[layer.type].view;
			return <View sv={sv as never}>{child}</View>;
		},
		<Image image={image} x={0} y={0} width={width} height={height} fit="contain" />,
	);

	return <Canvas style={{ width, height }}>{wrapped}</Canvas>;
}
