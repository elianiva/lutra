import { type SharedValue } from "react-native-reanimated";

export type LayerType =
	| "exposure"
	| "contrast"
	| "shadows"
	| "whiteBalance"
	| "saturation"
	| "grain"
	| "vignette"
	| "chromaticAberration"
	| "clarity";

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

export type GrainLayer = {
	type: "grain";
	id: string;
	amount: number;
	visible: boolean;
};

export type VignetteLayer = {
	type: "vignette";
	id: string;
	amount: number;
	size: number;
	visible: boolean;
};

export type ChromaticAberrationLayer = {
	type: "chromaticAberration";
	id: string;
	amount: number;
	visible: boolean;
};

export type ClarityLayer = {
	type: "clarity";
	id: string;
	amount: number;
	visible: boolean;
};

export type Layer =
	| ExposureLayer
	| ContrastLayer
	| ShadowsLayer
	| WhiteBalanceLayer
	| SaturationLayer
	| GrainLayer
	| VignetteLayer
	| ChromaticAberrationLayer
	| ClarityLayer;

// Per-type param patches (Partial<Pick<...>>).
export type ExposurePatch = Partial<Pick<ExposureLayer, "stops">>;
export type ContrastPatch = Partial<Pick<ContrastLayer, "amount">>;
export type ShadowsPatch = Partial<Pick<ShadowsLayer, "shadows" | "highlights">>;
export type WhiteBalancePatch = Partial<Pick<WhiteBalanceLayer, "temp" | "tint">>;
export type SaturationPatch = Partial<Pick<SaturationLayer, "amount">>;
export type GrainPatch = Partial<Pick<GrainLayer, "amount">>;
export type VignettePatch = Partial<Pick<VignetteLayer, "amount" | "size">>;
export type ChromaticAberrationPatch = Partial<Pick<ChromaticAberrationLayer, "amount">>;
export type ClarityPatch = Partial<Pick<ClarityLayer, "amount">>;

// Discriminated patch for the chain store's updateParams event. The store
// reducer checks `event.patch.type === layer.type` before merging.
export type LayerPatch =
	| { type: "exposure"; patch: ExposurePatch }
	| { type: "contrast"; patch: ContrastPatch }
	| { type: "shadows"; patch: ShadowsPatch }
	| { type: "whiteBalance"; patch: WhiteBalancePatch }
	| { type: "saturation"; patch: SaturationPatch }
	| { type: "grain"; patch: GrainPatch }
	| { type: "vignette"; patch: VignettePatch }
	| { type: "chromaticAberration"; patch: ChromaticAberrationPatch }
	| { type: "clarity"; patch: ClarityPatch };

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
export type GrainSVs = { amount: SharedValue<number> };
export type VignetteSVs = {
	amount: SharedValue<number>;
	size: SharedValue<number>;
};
export type ChromaticAberrationSVs = { amount: SharedValue<number> };
export type ClaritySVs = { amount: SharedValue<number> };

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
					: K extends "grain"
						? GrainSVs
						: K extends "vignette"
							? VignetteSVs
							: K extends "chromaticAberration"
								? ChromaticAberrationSVs
								: K extends "clarity"
									? ClaritySVs
									: never;

export const isExposure = (l: Layer): l is ExposureLayer => l.type === "exposure";
export const isContrast = (l: Layer): l is ContrastLayer => l.type === "contrast";
export const isShadows = (l: Layer): l is ShadowsLayer => l.type === "shadows";
export const isWhiteBalance = (l: Layer): l is WhiteBalanceLayer => l.type === "whiteBalance";
export const isSaturation = (l: Layer): l is SaturationLayer => l.type === "saturation";
export const isGrain = (l: Layer): l is GrainLayer => l.type === "grain";
export const isVignette = (l: Layer): l is VignetteLayer => l.type === "vignette";
export const isChromaticAberration = (l: Layer): l is ChromaticAberrationLayer =>
	l.type === "chromaticAberration";
export const isClarity = (l: Layer): l is ClarityLayer => l.type === "clarity";
