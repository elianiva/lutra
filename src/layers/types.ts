import { type SharedValue } from "react-native-reanimated";

export type LayerType = "exposure" | "contrast" | "shadows" | "whiteBalance" | "saturation";

export type ExposureLayer = {
	type: "exposure";
	id: string;
	stops: number;
	visible: boolean;
};

export type ContrastLayer = {
	type: "contrast";
	id: string;
	amount: number;
	visible: boolean;
};

export type ShadowsLayer = {
	type: "shadows";
	id: string;
	shadows: number;
	highlights: number;
	visible: boolean;
};

export type WhiteBalanceLayer = {
	type: "whiteBalance";
	id: string;
	temp: number;
	tint: number;
	visible: boolean;
};

export type SaturationLayer = {
	type: "saturation";
	id: string;
	amount: number;
	visible: boolean;
};

export type Layer =
	| ExposureLayer
	| ContrastLayer
	| ShadowsLayer
	| WhiteBalanceLayer
	| SaturationLayer;

// Per-type param patches (Partial<Pick<...>>).
export type ExposurePatch = Partial<Pick<ExposureLayer, "stops">>;
export type ContrastPatch = Partial<Pick<ContrastLayer, "amount">>;
export type ShadowsPatch = Partial<Pick<ShadowsLayer, "shadows" | "highlights">>;
export type WhiteBalancePatch = Partial<Pick<WhiteBalanceLayer, "temp" | "tint">>;
export type SaturationPatch = Partial<Pick<SaturationLayer, "amount">>;

// Discriminated patch for the chain store's updateParams event. The store
// reducer checks `event.patch.type === layer.type` before merging.
export type LayerPatch =
	| { type: "exposure"; patch: ExposurePatch }
	| { type: "contrast"; patch: ContrastPatch }
	| { type: "shadows"; patch: ShadowsPatch }
	| { type: "whiteBalance"; patch: WhiteBalancePatch }
	| { type: "saturation"; patch: SaturationPatch };

// Per-type live shared values. Used by both the renderer (Pipeline view) and
// the editor (Slider). One map, one source of truth.
export type ExposureSVs = { stops: SharedValue<number> };
export type ContrastSVs = { amount: SharedValue<number> };
export type ShadowsSVs = {
	shadows: SharedValue<number>;
	highlights: SharedValue<number>;
};
export type WhiteBalanceSVs = {
	temp: SharedValue<number>;
	tint: SharedValue<number>;
};
export type SaturationSVs = { amount: SharedValue<number> };

// Type helpers. SVsFor<K> resolves to the bare shape (no discriminator) so
// view/params components don't see a phantom `type` field.
export type LayerFor<K extends LayerType> = Extract<Layer, { type: K }>;
export type PatchFor<K extends LayerType> = Extract<LayerPatch, { type: K }>["patch"];
export type SVsFor<K extends LayerType> = K extends "exposure"
	? ExposureSVs
	: K extends "contrast"
		? ContrastSVs
		: K extends "shadows"
			? ShadowsSVs
			: K extends "whiteBalance"
				? WhiteBalanceSVs
				: K extends "saturation"
					? SaturationSVs
					: never;

export const isExposure = (l: Layer): l is ExposureLayer => l.type === "exposure";
export const isContrast = (l: Layer): l is ContrastLayer => l.type === "contrast";
export const isShadows = (l: Layer): l is ShadowsLayer => l.type === "shadows";
export const isWhiteBalance = (l: Layer): l is WhiteBalanceLayer => l.type === "whiteBalance";
export const isSaturation = (l: Layer): l is SaturationLayer => l.type === "saturation";
