import { View } from "react-native";

import { ParamHeader } from "../../components/param-header";
import { Slider } from "../../components/slider";
import { type GrainLayer, type GrainPatch, type GrainSVs } from "../types";

type Props = {
	layer: GrainLayer;
	sv: GrainSVs;
	onCommit: (patch: GrainPatch) => void;
	onRemove: () => void;
};

const formatPercent = (v: number) => `${Math.round(v * 100)}%`;

export function GrainParams({ sv, onCommit, onRemove }: Props) {
	return (
		<View className="gap-3">
			<ParamHeader label="Grain" onRemove={onRemove} />
			<Slider
				value={sv.amount}
				min={0}
				max={1}
				step={0.01}
				label="Amount"
				formatValue={formatPercent}
				onCommit={(v) => onCommit({ amount: v })}
			/>
		</View>
	);
}
