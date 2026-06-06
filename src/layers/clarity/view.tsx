import { RuntimeShader } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

import { type ClaritySVs } from "../types";
import { clarityEffect } from "./shader";

type Props = { sv: ClaritySVs };

export function ClarityFilter({ sv }: Props) {
	const amount = sv.amount;
	const uniforms = useDerivedValue(() => ({ amount: amount.value }));
	return <RuntimeShader source={clarityEffect} uniforms={uniforms} />;
}
