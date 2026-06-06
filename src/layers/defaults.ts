import { type Layer, type LayerType } from "./types";

let counter = 0;
export const nextLayerId = (): string => `layer-${++counter}`;

export function createLayer(type: LayerType): Layer {
	const id = nextLayerId();
	switch (type) {
		case "exposure":
			return { type, id, stops: 0 };
		case "contrast":
			return { type, id, amount: 0 };
		case "shadows":
			return { type, id, shadows: 0, highlights: 0 };
		case "whiteBalance":
			return { type, id, temp: 0, tint: 0 };
		case "saturation":
			return { type, id, amount: 0 };
	}
}
