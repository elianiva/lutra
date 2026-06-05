import type { Layer, LayerType } from "./types";

let counter = 0;
export const nextLayerId = (): string => `layer-${++counter}`;

export function createLayer(type: LayerType): Layer {
  switch (type) {
    case "exposure":
      return { id: nextLayerId(), type: "exposure", stops: 0 };
  }
}
