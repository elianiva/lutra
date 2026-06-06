import { RuntimeShader } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

import { type GrainSVs } from "../types";
import { grainEffect } from "./shader";

type Props = { sv: GrainSVs };

export function GrainFilter({ sv }: Props) {
	const amount = sv.amount;
	const uniforms = useDerivedValue(() => ({ amount: amount.value }));
	return <RuntimeShader source={grainEffect} uniforms={uniforms} />;
}
