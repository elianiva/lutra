import { RuntimeShader } from "@shopify/react-native-skia";
import { type ReactNode } from "react";
import { useDerivedValue } from "react-native-reanimated";

import { type SaturationSVs } from "../types";
import { saturationEffect } from "./shader";

type Props = { sv: SaturationSVs; children: ReactNode };

export function SaturationLayerView({ sv, children }: Props) {
	const uniforms = useDerivedValue(() => ({ amount: sv.amount.value }));
	return (
		<RuntimeShader source={saturationEffect} uniforms={uniforms}>
			{children}
		</RuntimeShader>
	);
}
