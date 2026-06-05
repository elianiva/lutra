import { Skia, type SkRuntimeEffect } from "@shopify/react-native-skia";
import type { Layer } from "../layers/types";
import { EXPOSURE_SHADER } from "./exposure";

type LayerShader = {
  effect: SkRuntimeEffect;
};

const cache = new Map<Layer["type"], LayerShader>();

function getShader(type: Layer["type"]): LayerShader {
  const existing = cache.get(type);
  if (existing) return existing;
  let source: string;

  switch (type) {
    case "exposure":
      source = EXPOSURE_SHADER;
      break;
  }

  const effect = Skia.RuntimeEffect.Make(source);
  if (!effect) throw new Error(`Failed to compile shader for layer type ${type}`);

  const entry: LayerShader = { effect };
  cache.set(type, entry);

  return entry;
}

export const shaders = { get: getShader };
