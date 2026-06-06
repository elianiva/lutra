import { View } from "react-native";

import { ParamHeader } from "../../components/param-header";
import { Slider } from "../../components/slider";
import {
	type ChromaticAberrationLayer,
	type ChromaticAberrationPatch,
	type ChromaticAberrationSVs,
} from "../types";

type Props = {
	layer: ChromaticAberrationLayer;
	sv: ChromaticAberrationSVs;
	onCommit: (patch: ChromaticAberrationPatch) => void;
	onRemove: () => void;
};

const formatSigned = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

export function ChromaticAberrationParams({ sv, onCommit, onRemove }: Props) {
	return (
		<View className="gap-3">
			<ParamHeader label="Chromatic Aberration" onRemove={onRemove} />
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
