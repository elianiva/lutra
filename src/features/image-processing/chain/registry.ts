import { renderChromaticAberration } from "./bodies/chromatic-aberration";
import { renderClarity } from "./bodies/clarity";
import { renderContrast } from "./bodies/contrast";
import { renderExposure } from "./bodies/exposure";
import { renderGrain } from "./bodies/grain";
import { renderSaturation } from "./bodies/saturation";
import { renderShadows } from "./bodies/shadows";
import { renderVignette } from "./bodies/vignette";
import { renderWhiteBalance } from "./bodies/white-balance";
import { formatEV, formatPercent, formatSigned, type LayerEntry } from "./format";

// Adding a new adjustment layer = adding one entry below. The Layer / Patch /
// SVs types, the params UI, the createLayer/createSVs factories, and the
// Add panel grid all derive from this map. `as const satisfies` gives us
// narrow literal types so the derived unions keep their per-entry
// precision. The body renderer emits the SkSL for that layer; the chain
// source generator inlines all active bodies into one RuntimeEffect.
export const layerRegistry = {
	exposure: {
		body: renderExposure,
		label: "Exposure",
		fields: {
			stops: { default: 0, min: -3, max: 3, label: "EV", format: "ev" },
		},
		formatValue: (l) => formatEV(l.stops),
	},
	contrast: {
		body: renderContrast,
		label: "Contrast",
		fields: {
			amount: { default: 0, min: -1, max: 1, label: "Amount", format: "signed" },
		},
		formatValue: (l) => formatSigned(l.amount),
	},
	shadows: {
		body: renderShadows,
		label: "Shadows & Highlights",
		fields: {
			shadows: { default: 0, min: -1, max: 1, label: "Shadows", format: "signed" },
			highlights: { default: 0, min: -1, max: 1, label: "Highlights", format: "signed" },
		},
		formatValue: (l) => `S ${formatSigned(l.shadows)} · H ${formatSigned(l.highlights)}`,
	},
	whiteBalance: {
		body: renderWhiteBalance,
		label: "White Balance",
		fields: {
			temp: {
				default: 0,
				min: -1,
				max: 1,
				label: "Temp",
				format: (v) => {
					const k =
						v < 0 ? Math.round(6500 - (1 + v) * 4500) : Math.round(6500 + v * 5500);
					return `${k} K`;
				},
			},
			tint: { default: 0, min: -1, max: 1, label: "Tint", format: "signed" },
		},
		formatValue: (l) => {
			const k =
				l.temp < 0
					? Math.round(6500 - (1 + l.temp) * 4500)
					: Math.round(6500 + l.temp * 5500);
			return `${k} K · ${formatSigned(l.tint)}`;
		},
	},
	saturation: {
		body: renderSaturation,
		label: "Saturation",
		fields: {
			amount: { default: 0, min: -1, max: 1, label: "Amount", format: "signed" },
		},
		formatValue: (l) => formatSigned(l.amount),
	},
	grain: {
		body: renderGrain,
		label: "Grain",
		fields: {
			amount: { default: 0, min: 0, max: 1, label: "Amount", format: "percent" },
		},
		formatValue: (l) => formatPercent(l.amount),
	},
	vignette: {
		body: renderVignette,
		label: "Vignette",
		fields: {
			amount: { default: 0, min: -1, max: 1, label: "Amount", format: "signed" },
			size: { default: 0.6, min: 0.2, max: 1, label: "Size", format: "percent" },
		},
		formatValue: (l) => `A ${formatSigned(l.amount)} · ${formatPercent(l.size)}`,
	},
	chromaticAberration: {
		body: renderChromaticAberration,
		label: "Chromatic Aberration",
		fields: {
			amount: { default: 0, min: -1, max: 1, label: "Amount", format: "signed" },
		},
		formatValue: (l) => formatSigned(l.amount),
	},
	clarity: {
		body: renderClarity,
		label: "Clarity",
		fields: {
			amount: { default: 0, min: -1, max: 1, label: "Amount", format: "signed" },
		},
		formatValue: (l) => formatSigned(l.amount),
	},
} as const satisfies Record<string, LayerEntry>;

export type LayerRegistry = typeof layerRegistry;
export type LayerType = keyof LayerRegistry;
