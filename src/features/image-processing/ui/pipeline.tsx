import { Canvas, Fill, ImageShader, Shader, type SkImage } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";

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

type UniformBinding = { uniform: string; sv: SharedValue<number> };

// One shader for the whole chain. The active (visible) layer list is
// compiled to a single SkRuntimeEffect by chainCache, then the live
// SVs are bound to the namespaced uniforms (l0_stops, l1_amount, ...).
// Reorder / add / remove / visibility-toggle invalidates the cache
// key and triggers a regen; slider drags only touch uniforms.
export function Pipeline({ layers, svMap, image, width, height }: PipelineProps) {
	const activeLayers = layers.filter((l) => l.visible);
	const { effect } = chainCache.get(activeLayers);

	// Pre-compute the uniform bindings on the JS thread as a flat list
	// of (uniform name, SV) pairs. The Reanimated worklet then iterates
	// only primitives + SV references — no Layer objects (which carry
	// formatValue functions), no Map, no registry const. Capturing
	// those directly inside useDerivedValue's closure crashes at worklet
	// setup; this shape serializes cleanly.
	const bindings = useMemo<UniformBinding[]>(() => {
		const out: UniformBinding[] = [];
		let i = 0;
		for (const layer of activeLayers) {
			const sv = svMap.get(layer.id);
			if (sv) {
				const entry = layerRegistry[layer.type];
				for (const key of Object.keys(entry.fields)) {
					out.push({ uniform: `l${i}_${key}`, sv: sv[key] });
				}
			}
			i++;
		}
		return out;
	}, [activeLayers, svMap]);

	const uniforms = useDerivedValue(() => {
		const u: Record<string, number> = {};
		for (const { uniform, sv } of bindings) {
			u[uniform] = sv.value;
		}
		return u;
	});

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
