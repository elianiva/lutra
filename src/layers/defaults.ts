import { type Layer, type LayerType } from "./types";

let counter = 0;
export const nextLayerId = (): string => `layer-${++counter}`;

export function createLayer(type: LayerType): Layer {
	const id = nextLayerId();
	switch (type) {
		case "exposure":
			return { type, id, stops: 0, visible: true };
		case "contrast":
			return { type, id, amount: 0, visible: true };
		case "shadows":
			return { type, id, shadows: 0, highlights: 0, visible: true };
		case "whiteBalance":
			return { type, id, temp: 0, tint: 0, visible: true };
		case "saturation":
			return { type, id, amount: 0, visible: true };
		case "grain":
			return { type, id, amount: 0, visible: true };
		case "vignette":
			return { type, id, amount: 0, size: 0.6, visible: true };
		case "chromaticAberration":
			return { type, id, amount: 0, visible: true };
		case "clarity":
			return { type, id, amount: 0, visible: true };
	}
}
