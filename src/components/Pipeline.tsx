import { type ReactNode } from "react";
import { Canvas, Image, RuntimeShader, type SkImage } from "@shopify/react-native-skia";
import type { SharedValue } from "react-native-reanimated";
import { type Layer } from "../layers/types";
import { shaders } from "../shaders";

type PipelineProps = {
  layers: Layer[];
  image: SkImage;
  // v0.1: one shared value for the only supported layer. v0.2 will replace
  // this with a per-layer map.
  stopsSV: SharedValue<number>;
  width: number;
  height: number;
};

export function Pipeline({ layers, image, stopsSV, width, height }: PipelineProps) {
  const wrapped = layers.reduceRight<ReactNode>(
    (child, layer) => {
      switch (layer.type) {
        case "exposure":
          return (
            <RuntimeShader
              key={layer.id}
              source={shaders.get("exposure").effect}
              uniforms={{ stops: stopsSV }}
            >
              {child}
            </RuntimeShader>
          );
      }
    },
    <Image
      image={image}
      x={0}
      y={0}
      width={width}
      height={height}
      fit="contain"
    />,
  );

  return <Canvas style={{ width, height }}>{wrapped}</Canvas>;
}
