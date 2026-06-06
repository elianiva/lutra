import { RuntimeShader } from "@shopify/react-native-skia";
import { type ReactNode } from "react";
import { useDerivedValue } from "react-native-reanimated";

import { type ShadowsSVs } from "../types";
import { shadowsEffect } from "./shader";

type Props = { sv: ShadowsSVs; children: ReactNode };

export function ShadowsLayerView({ sv, children }: Props) {
	const uniforms = useDerivedValue(() => ({
		shadows: sv.shadows.value,
		highlights: sv.highlights.value,
	}));
	return (
		<RuntimeShader source={shadowsEffect} uniforms={uniforms}>
			{children}
		</RuntimeShader>
	);
}
