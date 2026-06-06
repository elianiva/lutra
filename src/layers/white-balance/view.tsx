import { RuntimeShader } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

import { type WhiteBalanceSVs } from "../types";
import { whiteBalanceEffect } from "./shader";

type Props = { sv: WhiteBalanceSVs };

export function WhiteBalanceFilter({ sv }: Props) {
	const temp = sv.temp;
	const tint = sv.tint;
	const uniforms = useDerivedValue(() => ({
		temp: temp.value,
		tint: tint.value,
	}));
	return <RuntimeShader source={whiteBalanceEffect} uniforms={uniforms} />;
}
