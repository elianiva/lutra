import { RuntimeShader } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

import { type VignetteSVs } from "../types";
import { vignetteEffect } from "./shader";

type Props = { sv: VignetteSVs };

export function VignetteFilter({ sv }: Props) {
	const amount = sv.amount;
	const size = sv.size;
	const uniforms = useDerivedValue(() => ({
		amount: amount.value,
		size: size.value,
	}));
	return <RuntimeShader source={vignetteEffect} uniforms={uniforms} />;
}
