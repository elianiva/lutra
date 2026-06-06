import { View } from "react-native";

import { ParamHeader } from "../../components/param-header";
import { Slider } from "../../components/slider";
import { type VignetteLayer, type VignettePatch, type VignetteSVs } from "../types";

type Props = {
	layer: VignetteLayer;
	sv: VignetteSVs;
	onCommit: (patch: VignettePatch) => void;
	onRemove: () => void;
};

const formatSigned = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
const formatSize = (v: number) => `${Math.round(v * 100)}%`;

export function VignetteParams({ sv, onCommit, onRemove }: Props) {
	return (
		<View className="gap-3">
			<ParamHeader label="Vignette" onRemove={onRemove} />
			<Slider
				value={sv.amount}
				min={-1}
				max={1}
				step={0.01}
				label="Amount"
				formatValue={formatSigned}
				onCommit={(v) => onCommit({ amount: v })}
			/>
			<Slider
				value={sv.size}
				min={0.2}
				max={1}
				step={0.01}
				label="Size"
				formatValue={formatSize}
				onCommit={(v) => onCommit({ size: v })}
			/>
		</View>
	);
}
