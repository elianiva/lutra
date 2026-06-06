import { RuntimeShader } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

import { type ShadowsSVs } from "../types";
import { shadowsEffect } from "./shader";

type Props = { sv: ShadowsSVs };

export function ShadowsFilter({ sv }: Props) {
	const shadows = sv.shadows;
	const highlights = sv.highlights;
	const uniforms = useDerivedValue(() => ({
		shadows: shadows.value,
		highlights: highlights.value,
	}));
	return <RuntimeShader source={shadowsEffect} uniforms={uniforms} />;
}
