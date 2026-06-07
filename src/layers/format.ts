import { type ComponentType } from "react";
import { type SharedValue } from "react-native-reanimated";

// A body renderer emits the SkSL statements for one layer, inlined
// into the chain shader at the layer's index. The body operates on a
// `half3 color` variable in linear light; uniforms are namespaced with
// the index (l0_stops, l1_amount, ...).
export type BodyRenderer = (layerIndex: number) => string;

export const formatSigned = (v: number): string =>
	`${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

export const formatEV = (v: number): string => `${formatSigned(v)} EV`;

export const formatPercent = (v: number): string => `${Math.round(v * 100)}%`;

export type Formatter = (v: number) => string;

export type FormatPreset = "signed" | "ev" | "percent";

const PRESETS: Record<FormatPreset, Formatter> = {
	signed: formatSigned,
	ev: formatEV,
	percent: formatPercent,
};

export function resolveFormat(format: FormatPreset | Formatter): Formatter {
	return typeof format === "function" ? format : PRESETS[format];
}

// Per-field configuration. The registry is the source of truth; the rest of
// the codebase reads field shape from this. Adding a new field on a layer
// means adding one entry here.
export type FieldDef = {
	default: number;
	min: number;
	max: number;
	step?: number;
	label: string;
	format: FormatPreset | Formatter;
};

// Per-layer entry. The keys (body, field map, label, formatValue) are
// enough to derive the layer type, the patch type, the SVs type, and
// the params component. Per-layer components that don't fit the
// default (none today) can override `params`.
export type LayerEntry = {
	body: BodyRenderer;
	fields: { readonly [F: string]: FieldDef };
	label: string;
	// The per-entry function is typed against its own narrow shape
	// (e.g. `({ type: "exposure", stops: number }) => string`). The
	// union-typed `LayerEntry` widens the param so the registry can hold
	// a heterogeneous map; the per-entry body is type-checked against
	// its narrow shape, the call site is type-checked against the
	// concrete layer. Standard pattern for polymorphic dispatch.
	formatValue: (layer: any) => string;
	params?: ComponentType<LayerParamsProps>;
};

// Default per-layer params props. `params` is currently unused (the
// generic Params component handles every layer), but the slot exists for
// layers that need a custom UI in the future.
export type LayerParamsProps = {
	layer: { type: string; id: string; visible: boolean } & { [F: string]: number };
	sv: { [F: string]: SharedValue<number> };
	onCommit: (patch: { [F: string]: number }) => void;
	onRemove: () => void;
};
