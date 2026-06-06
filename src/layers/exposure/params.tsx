import { View } from "react-native";

import { ParamHeader } from "../../components/param-header";
import { Slider } from "../../components/slider";
import { type ExposureLayer, type ExposurePatch, type ExposureSVs } from "../types";

type Props = {
	layer: ExposureLayer;
	sv: ExposureSVs;
	onCommit: (patch: ExposurePatch) => void;
	onRemove: () => void;
};

const formatEV = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} EV`;

export function ExposureParams({ sv, onCommit, onRemove }: Props) {
	return (
		<View className="gap-3">
			<ParamHeader label="Exposure" onRemove={onRemove} />
			<Slider
				value={sv.stops}
				min={-3}
				max={3}
				step={0.01}
				label="EV"
				formatValue={formatEV}
				onCommit={(v) => onCommit({ stops: v })}
			/>
		</View>
	);
}
