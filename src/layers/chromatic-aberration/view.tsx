import { RuntimeShader } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

import { type ChromaticAberrationSVs } from "../types";
import { chromaticAberrationEffect } from "./shader";

type Props = { sv: ChromaticAberrationSVs };

export function ChromaticAberrationFilter({ sv }: Props) {
	const amount = sv.amount;
	const uniforms = useDerivedValue(() => ({ amount: amount.value }));
	return <RuntimeShader source={chromaticAberrationEffect} uniforms={uniforms} />;
}
