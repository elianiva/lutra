import { View } from "react-native";

import { ParamHeader } from "../../components/param-header";
import { Slider } from "../../components/slider";
import { type ContrastLayer, type ContrastPatch, type ContrastSVs } from "../types";

type Props = {
	layer: ContrastLayer;
	sv: ContrastSVs;
	onCommit: (patch: ContrastPatch) => void;
	onRemove: () => void;
};

const formatSigned = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

export function ContrastParams({ sv, onCommit, onRemove }: Props) {
	return (
		<View className="gap-3">
			<ParamHeader label="Contrast" onRemove={onRemove} />
			<Slider
				value={sv.amount}
				min={-1}
				max={1}
				step={0.01}
				label="Amount"
				formatValue={formatSigned}
				onCommit={(v) => onCommit({ amount: v })}
			/>
		</View>
	);
}
