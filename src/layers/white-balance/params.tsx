import { View } from "react-native";

import { ParamHeader } from "../../components/param-header";
import { Slider } from "../../components/slider";
import { type WhiteBalanceLayer, type WhiteBalancePatch, type WhiteBalanceSVs } from "../types";

type Props = {
	layer: WhiteBalanceLayer;
	sv: WhiteBalanceSVs;
	onCommit: (patch: WhiteBalancePatch) => void;
	onRemove: () => void;
};

const formatTemp = (v: number) => {
	const k = v < 0 ? Math.round(6500 - (1 + v) * 4500) : Math.round(6500 + v * 5500);
	return `${k} K`;
};
const formatSigned = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

export function WhiteBalanceParams({ sv, onCommit, onRemove }: Props) {
	return (
		<View className="gap-3">
			<ParamHeader label="White Balance" onRemove={onRemove} />
			<Slider
				value={sv.temp}
				min={-1}
				max={1}
				step={0.01}
				label="Temp"
				formatValue={formatTemp}
				onCommit={(v) => onCommit({ temp: v })}
			/>
			<Slider
				value={sv.tint}
				min={-1}
				max={1}
				step={0.01}
				label="Tint"
				formatValue={formatSigned}
				onCommit={(v) => onCommit({ tint: v })}
			/>
		</View>
	);
}
