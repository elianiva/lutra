import { RuntimeShader } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

import { type ContrastSVs } from "../types";
import { contrastEffect } from "./shader";

type Props = { sv: ContrastSVs };

export function ContrastFilter({ sv }: Props) {
	const amount = sv.amount;
	const uniforms = useDerivedValue(() => ({ amount: amount.value }));
	return <RuntimeShader source={contrastEffect} uniforms={uniforms} />;
}
