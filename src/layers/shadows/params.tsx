import { View } from "react-native";

import { ParamHeader } from "../../components/param-header";
import { Slider } from "../../components/slider";
import { type ShadowsLayer, type ShadowsPatch, type ShadowsSVs } from "../types";

type Props = {
	layer: ShadowsLayer;
	sv: ShadowsSVs;
	onCommit: (patch: ShadowsPatch) => void;
	onRemove: () => void;
};

const formatSigned = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

export function ShadowsParams({ sv, onCommit, onRemove }: Props) {
	return (
		<View className="gap-3">
			<ParamHeader label="Shadows & Highlights" onRemove={onRemove} />
			<Slider
				value={sv.shadows}
				min={-1}
				max={1}
				step={0.01}
				label="Shadows"
				formatValue={formatSigned}
				onCommit={(v) => onCommit({ shadows: v })}
			/>
			<Slider
				value={sv.highlights}
				min={-1}
				max={1}
				step={0.01}
				label="Highlights"
				formatValue={formatSigned}
				onCommit={(v) => onCommit({ highlights: v })}
			/>
		</View>
	);
}
