import { useMemo } from "react";
import { Canvas, Fill, ImageShader, Shader, type SkImage } from "@shopify/react-native-skia";

import { chainCache } from "../chain/chain-cache";
import { layerRegistry } from "../chain/registry";
import { type Layer } from "../chain/types";
import { type LayerSVMap } from "./use-layer-sv-map";

type PipelineProps = {
	layers: Layer[];
	svMap: LayerSVMap;
	image: SkImage;
	width: number;
	height: number;
};

// Build a plain uniform record from the committed layer values. The
// C++ Uniforms parser (getPropertyValue<Uniforms> in Convertor.h)
// correctly enumerates plain object properties but fails to enumerate
// the inner Record when it's wrapped in a SharedValue HostObject on
// the worklet thread (the mapper's applyUpdates path). Passing a
// plain object avoids that issue entirely.
//
// Real-time preview during slider drag is deferred: committed values
// are read on the JS thread via sv[key].value and the component
// re-renders when layers change (on slider commit). A follow-up can
// restore real-time updates by switching to a worklet-based approach
// that builds the uniform float array directly instead of going
// through the C++ Uniforms parser.
function buildUniforms(layers: Layer[], svMap: LayerSVMap): Record<string, number> {
	const u: Record<string, number> = {};
	let i = 0;
	for (const layer of layers) {
		const sv = svMap.get(layer.id);
		const entry = layerRegistry[layer.type];
		for (const key of Object.keys(entry.fields)) {
			const def = (entry.fields as Record<string, { default: number }>)[key].default;
			u[`l${i}_${key}`] = sv ? sv[key].value : def;
		}
		i++;
	}
	return u;
}

// One shader for the whole chain. The active (visible) layer list is
// compiled to a single SkRuntimeEffect by chainCache, then the
// committed values are bound to the namespaced uniforms (l0_stops,
// l1_amount, ...). Reorder / add / remove / visibility-toggle
// invalidates the cache key and triggers a regen; slider drags do not
// update the preview until commit (see buildUniforms comment above).
export function Pipeline({ layers, svMap, image, width, height }: PipelineProps) {
	const activeLayers = layers.filter((l) => l.visible);
	const { effect } = chainCache.get(activeLayers);
	const uniforms = useMemo(() => buildUniforms(activeLayers, svMap), [activeLayers, svMap]);

	return (
		<Canvas style={{ width, height }}>
			<Fill>
				<Shader source={effect} uniforms={uniforms}>
					<ImageShader image={image} fit="contain" rect={{ x: 0, y: 0, width, height }} />
				</Shader>
			</Fill>
		</Canvas>
	);
}
