import { useMemo } from "react";
import { useDerivedValue, type SharedValue } from "react-native-reanimated";
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

type UniformEntry = {
	name: string;
	sv: SharedValue<number>;
};

// Build a flat array of (uniform name, SharedValue) pairs. Iterating this
// on the UI thread via useDerivedValue avoids any C++ Uniforms-parser
// issue — each SharedValue is accessed directly by reference, not wrapped
// in a HostObject record. Re-computed only when layer composition changes.
function buildUniformEntries(layers: Layer[], svMap: LayerSVMap): UniformEntry[] {
	const entries: UniformEntry[] = [];
	let i = 0;
	for (const layer of layers) {
		const sv = svMap.get(layer.id)!;
		const entry = layerRegistry[layer.type];
		for (const key of Object.keys(entry.fields)) {
			entries.push({ name: `l${i}_${key}`, sv: sv[key] });
		}
		i++;
	}
	return entries;
}

// One shader for the whole chain. The active (visible) layer list is
// compiled to a single SkRuntimeEffect by chainCache, then the live
// shared values are bound to the namespaced uniforms (l0_stops,
// l1_amount, ...) via useDerivedValue on the UI thread. Every slider
// drag updates the SharedValues → the derived value recomputes → Skia
// re-renders. No JS-thread round-trip during scrubbing.
export function Pipeline({ layers, svMap, image, width, height }: PipelineProps) {
	const activeLayers = layers.filter((l) => l.visible);
	const { effect } = chainCache.get(activeLayers);
	const uniformEntries = useMemo(() => buildUniformEntries(activeLayers, svMap), [activeLayers, svMap]);
	const uniforms = useDerivedValue(() => {
		const u: Record<string, number> = {};
		for (const { name, sv } of uniformEntries) {
			u[name] = sv.value;
		}
		return u;
	}, [uniformEntries]);

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
