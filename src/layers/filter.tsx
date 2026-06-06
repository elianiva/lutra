import { RuntimeShader, type SkRuntimeEffect } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";
import { type SharedValue } from "react-native-reanimated";

// One filter component for every layer. The per-layer wiring (which SVs
// map to which uniforms) lives in the registry's `fields`; the runtime
// shape is uniform across layers, so the component is too.
type LayerFilterProps = {
	sv: { [F: string]: SharedValue<number> };
	effect: SkRuntimeEffect;
	keys: readonly string[];
};

export function LayerFilter({ sv, effect, keys }: LayerFilterProps) {
	const uniforms = useDerivedValue(() => {
		const u: Record<string, number> = {};
		for (const key of keys) u[key] = sv[key].value;
		return u;
	});
	return <RuntimeShader source={effect} uniforms={uniforms} />;
}
