import { type ComponentType } from "react";

import { ContrastParams } from "./contrast/params";
import { ContrastFilter } from "./contrast/view";
import { ExposureParams } from "./exposure/params";
import { ExposureFilter } from "./exposure/view";
import { SaturationParams } from "./saturation/params";
import { SaturationFilter } from "./saturation/view";
import { ShadowsParams } from "./shadows/params";
import { ShadowsFilter } from "./shadows/view";
import { type Layer, type LayerType, type LayerFor, type PatchFor, type SVsFor } from "./types";
import { WhiteBalanceParams } from "./white-balance/params";
import { WhiteBalanceFilter } from "./white-balance/view";

type FilterComponent<K extends LayerType> = ComponentType<{ sv: SVsFor<K> }>;

type ParamsComponent<K extends LayerType> = ComponentType<{
	layer: LayerFor<K>;
	sv: SVsFor<K>;
	onCommit: (patch: PatchFor<K>) => void;
	onRemove: () => void;
}>;

type LayerMeta<K extends LayerType> = {
	label: string;
	formatValue: (layer: LayerFor<K>) => string;
};

type Entry<K extends LayerType> = {
	filter: FilterComponent<K>;
	params: ParamsComponent<K>;
	meta: LayerMeta<K>;
};

export const layerRegistry: { [K in LayerType]: Entry<K> } = {
	exposure: {
		filter: ExposureFilter,
		params: ExposureParams,
		meta: {
			label: "Exposure",
			formatValue: (l) => `${l.stops >= 0 ? "+" : ""}${l.stops.toFixed(2)} EV`,
		},
	},
	contrast: {
		filter: ContrastFilter,
		params: ContrastParams,
		meta: {
			label: "Contrast",
			formatValue: (l) => `${l.amount >= 0 ? "+" : ""}${l.amount.toFixed(2)}`,
		},
	},
	shadows: {
		filter: ShadowsFilter,
		params: ShadowsParams,
		meta: {
			label: "Shadows & Highlights",
			formatValue: (l) =>
				`S ${l.shadows >= 0 ? "+" : ""}${l.shadows.toFixed(2)} · H ${l.highlights >= 0 ? "+" : ""}${l.highlights.toFixed(2)}`,
		},
	},
	whiteBalance: {
		filter: WhiteBalanceFilter,
		params: WhiteBalanceParams,
		meta: {
			label: "White Balance",
			formatValue: (l) => {
				const k =
					l.temp < 0
						? Math.round(6500 - (1 + l.temp) * 4500)
						: Math.round(6500 + l.temp * 5500);
				return `${k} K · T ${l.tint >= 0 ? "+" : ""}${l.tint.toFixed(2)}`;
			},
		},
	},
	saturation: {
		filter: SaturationFilter,
		params: SaturationParams,
		meta: {
			label: "Saturation",
			formatValue: (l) => `${l.amount >= 0 ? "+" : ""}${l.amount.toFixed(2)}`,
		},
	},
};

// Helper: format a layer's current value, dispatching to its meta.
// Switches on `layer.type` so each call site has the narrowed type.
export function formatLayerValue(layer: Layer): string {
	switch (layer.type) {
		case "exposure":
			return layerRegistry.exposure.meta.formatValue(layer);
		case "contrast":
			return layerRegistry.contrast.meta.formatValue(layer);
		case "shadows":
			return layerRegistry.shadows.meta.formatValue(layer);
		case "whiteBalance":
			return layerRegistry.whiteBalance.meta.formatValue(layer);
		case "saturation":
			return layerRegistry.saturation.meta.formatValue(layer);
	}
}
