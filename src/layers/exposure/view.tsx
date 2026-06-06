import { RuntimeShader } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

import { type ExposureSVs } from "../types";
import { exposureEffect } from "./shader";

type Props = { sv: ExposureSVs };

export function ExposureFilter({ sv }: Props) {
	const stops = sv.stops;
	const uniforms = useDerivedValue(() => ({ stops: stops.value }));
	return <RuntimeShader source={exposureEffect} uniforms={uniforms} />;
}
