import { useEffect, useMemo, useRef } from "react";
import { type SharedValue, makeMutable, startMapper, stopMapper } from "react-native-reanimated";
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

// Build a flat array of (uniform name, SharedValue) pairs. Re-computed only
// when layer composition changes.
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

// Compute the uniform record from uniform entries — runs on either thread.
function buildUniforms(entries: UniformEntry[]): Record<string, number> {
	const u: Record<string, number> = {};
	for (const { name, sv } of entries) {
		u[name] = sv.value;
	}
	return u;
}

// One shader for the whole chain. The active (visible) layer list is
// compiled to a single SkRuntimeEffect by chainCache, then the live
// shared values are bound to the namespaced uniforms (l0_stops,
// l1_amount, ...). Every slider drag updates the SharedValues → the mapper
// re-runs → Skia re-renders. No JS-thread round-trip during scrubbing.
export function Pipeline({ layers, svMap, image, width, height }: PipelineProps) {
	const activeLayers = layers.filter((l) => l.visible);
	const { effect } = chainCache.get(activeLayers);
	const uniformEntries = useMemo(() => buildUniformEntries(activeLayers, svMap), [activeLayers, svMap]);

	// useDerivedValue only evaluates its callback synchronously once (on
	// first mount). On subsequent dep changes it schedules the update via
	// startMapper which runs async on the UI thread. By the time Skia reads
	// uniforms.value during commit the stale value is still in place → missing
	// uniform error. We side-step this by building the SharedValue ourselves
	// and synchronously setting .value during render so it's correct *before*
	// Skia's picture is played.
	const uniformsRef = useRef<SharedValue<Record<string, number>> | null>(null);
	if (uniformsRef.current === null) {
		uniformsRef.current = makeMutable<Record<string, number>>({});
	}
	const uniforms = uniformsRef.current;
	uniforms.value = buildUniforms(uniformEntries);

	// Reactive updates on the UI thread for slider drags (individual SVs
	// change → mapper re-runs → uniforms.value updated).
	useEffect(() => {
		const fun = () => {
			"worklet";
			const u: Record<string, number> = {};
			for (const { name, sv } of uniformEntries) {
				u[name] = sv.value;
			}
			uniforms.value = u;
		};
		const mapperId = startMapper(fun, uniformEntries.map((e) => e.sv) as unknown[], [uniforms as SharedValue<unknown>]);
		return () => stopMapper(mapperId);
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
