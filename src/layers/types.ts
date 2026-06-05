export type LayerType = "exposure";

export type Layer = ExposureLayer;

export type ExposureLayer = {
  id: string;
  type: "exposure";
  stops: number;
};

export const isExposure = (l: Layer): l is ExposureLayer => l.type === "exposure";
