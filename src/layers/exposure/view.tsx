import { RuntimeShader } from "@shopify/react-native-skia";
import { type ReactNode } from "react";
import { useDerivedValue } from "react-native-reanimated";

import { type ExposureSVs } from "../types";
import { exposureEffect } from "./shader";

type Props = { sv: ExposureSVs; children: ReactNode };

export function ExposureLayerView({ sv, children }: Props) {
	const uniforms = useDerivedValue(() => ({ stops: sv.stops.value }));
	return (
		<RuntimeShader source={exposureEffect} uniforms={uniforms}>
			{children}
		</RuntimeShader>
	);
}
