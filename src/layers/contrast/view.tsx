import { RuntimeShader } from "@shopify/react-native-skia";
import { type ReactNode } from "react";
import { useDerivedValue } from "react-native-reanimated";

import { type ContrastSVs } from "../types";
import { contrastEffect } from "./shader";

type Props = { sv: ContrastSVs; children: ReactNode };

export function ContrastLayerView({ sv, children }: Props) {
	const uniforms = useDerivedValue(() => ({ amount: sv.amount.value }));
	return (
		<RuntimeShader source={contrastEffect} uniforms={uniforms}>
			{children}
		</RuntimeShader>
	);
}
