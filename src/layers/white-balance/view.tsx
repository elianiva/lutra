import { RuntimeShader } from "@shopify/react-native-skia";
import { type ReactNode } from "react";
import { useDerivedValue } from "react-native-reanimated";

import { type WhiteBalanceSVs } from "../types";
import { whiteBalanceEffect } from "./shader";

type Props = { sv: WhiteBalanceSVs; children: ReactNode };

export function WhiteBalanceLayerView({ sv, children }: Props) {
	const uniforms = useDerivedValue(() => ({
		temp: sv.temp.value,
		tint: sv.tint.value,
	}));
	return (
		<RuntimeShader source={whiteBalanceEffect} uniforms={uniforms}>
			{children}
		</RuntimeShader>
	);
}
