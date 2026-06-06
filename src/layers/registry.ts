import { exposureEffect } from "./exposure/shader";
import { contrastEffect } from "./contrast/shader";
import { shadowsEffect } from "./shadows/shader";
import { whiteBalanceEffect } from "./white-balance/shader";
import { saturationEffect } from "./saturation/shader";
import { grainEffect } from "./grain/shader";
import { vignetteEffect } from "./vignette/shader";
import { chromaticAberrationEffect } from "./chromatic-aberration/shader";
import { clarityEffect } from "./clarity/shader";
import { formatEV, formatPercent, formatSigned, type LayerEntry } from "./format";
import { type Layer } from "./types";

// Adding a new adjustment layer = adding one entry below. The Layer / Patch /
// SVs types, the filter, the params UI, the createLayer/createSVs
// factories, and the Add panel grid all derive from this map. `as const
// satisfies` gives us narrow literal types so the derived unions keep their
// per-entry precision.
export const layerRegistry = {
	exposure: {
		effect: exposureEffect,
		label: "Exposure",
		fields: {
			stops: { default: 0, min: -3, max: 3, label: "EV", format: "ev" },
		},
		formatValue: (l) => formatEV(l.stops),
	},
	contrast: {
		effect: contrastEffect,
		label: "Contrast",
		fields: {
			amount: { default: 0, min: -1, max: 1, label: "Amount", format: "signed" },
		},
		formatValue: (l) => formatSigned(l.amount),
	},
	shadows: {
		effect: shadowsEffect,
		label: "Shadows & Highlights",
		fields: {
			shadows: { default: 0, min: -1, max: 1, label: "Shadows", format: "signed" },
			highlights: { default: 0, min: -1, max: 1, label: "Highlights", format: "signed" },
		},
		formatValue: (l) => `S ${formatSigned(l.shadows)} · H ${formatSigned(l.highlights)}`,
	},
	whiteBalance: {
		effect: whiteBalanceEffect,
		label: "White Balance",
		fields: {
			temp: {
				default: 0,
				min: -1,
				max: 1,
				label: "Temp",
				format: (v) => {
					const k =
						v < 0
							? Math.round(6500 - (1 + v) * 4500)
							: Math.round(6500 + v * 5500);
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
		effect: saturationEffect,
		label: "Saturation",
		fields: {
			amount: { default: 0, min: -1, max: 1, label: "Amount", format: "signed" },
		},
		formatValue: (l) => formatSigned(l.amount),
	},
	grain: {
		effect: grainEffect,
		label: "Grain",
		fields: {
			amount: { default: 0, min: 0, max: 1, label: "Amount", format: "percent" },
		},
		formatValue: (l) => formatPercent(l.amount),
	},
	vignette: {
		effect: vignetteEffect,
		label: "Vignette",
		fields: {
			amount: { default: 0, min: -1, max: 1, label: "Amount", format: "signed" },
			size: { default: 0.6, min: 0.2, max: 1, label: "Size", format: "percent" },
		},
		formatValue: (l) => `A ${formatSigned(l.amount)} · ${formatPercent(l.size)}`,
	},
	chromaticAberration: {
		effect: chromaticAberrationEffect,
		label: "Chromatic Aberration",
		fields: {
			amount: { default: 0, min: -1, max: 1, label: "Amount", format: "signed" },
		},
		formatValue: (l) => formatSigned(l.amount),
	},
	clarity: {
		effect: clarityEffect,
		label: "Clarity",
		fields: {
			amount: { default: 0, min: -1, max: 1, label: "Amount", format: "signed" },
		},
		formatValue: (l) => formatSigned(l.amount),
	},
} as const satisfies Record<string, LayerEntry>;

export type LayerRegistry = typeof layerRegistry;
export type LayerType = keyof LayerRegistry;

// Format a layer's current value for the Layers panel. Dispatches to the
// entry's per-layer `formatValue`; each entry composes its field formatters
// into the panel's one-line summary. The cast is one place; per-entry
// functions are still type-safe against their narrow field shapes.
export function formatLayerValue(layer: Layer): string {
	const fn = layerRegistry[layer.type].formatValue as (
		l: Layer,
	) => string;
	return fn(layer);
}
