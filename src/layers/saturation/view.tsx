import { RuntimeShader } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

import { type SaturationSVs } from "../types";
import { saturationEffect } from "./shader";

type Props = { sv: SaturationSVs };

export function SaturationFilter({ sv }: Props) {
	const amount = sv.amount;
	const uniforms = useDerivedValue(() => ({ amount: amount.value }));
	return <RuntimeShader source={saturationEffect} uniforms={uniforms} />;
}
