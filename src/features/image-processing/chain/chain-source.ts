import { SRGB_TO_LINEAR } from "./colorspace";
import { layerRegistry } from "./registry";
import { type Layer } from "./types";

// Stable, deterministic signature for a chain composition. The ordered
// type list is enough \u2014 layer ids are an internal detail, field shapes
// are static per type, and SV values are uniforms (not part of the
// effect). Same key for the same chain shape, regardless of how the
// user dragged the sliders.
export function chainKey(layers: Layer[]): string {
  return layers.map((l) => l.type).join("|");
}

// Concatenate the per-layer body templates into one SkSL source. The
// chain's main() linearizes the source, runs the bodies in order on
// the `color` variable, clamps, and delinearizes. The whole pipeline
// pays one sRGB<->linear round-trip per pixel, regardless of layer
// count \u2014 the cost is dominated by the body math, not the conversion.
//
// The bodies share a single `half3 color` variable so each layer is a
// statement block, not a function. SkSL handles the inlining; local
// scopes use { } blocks to keep temporaries from leaking between
// bodies. Uniforms are namespaced with the layer index in the chain
// (l0_stops, l1_amount, ...) so two layers of the same type never
// collide.
export function generateChainSource(layers: Layer[]): string {
  console.log("[chain-source] generateChainSource called with", layers.length, "layers");
  layers.forEach((l, i) => console.log(`  [${i}] type=${l.type} visible=${l.visible}`));

  if (layers.length === 0) {
    return `
uniform shader image;

half4 main(vec2 coord) {
  return image.eval(coord);
}
`;
  }

  const uniforms: string[] = ["uniform shader image;", "uniform float2 u_resolution;"];
  const bodies: string[] = [];

  layers.forEach((layer, i) => {
    const entry = layerRegistry[layer.type];
    for (const key of Object.keys(entry.fields)) {
      const uniformName = `l${i}_${key}`;
      console.log("  [chain-source] declaring uniform:", uniformName);
      uniforms.push(`uniform half ${uniformName};`);
    }
    bodies.push(entry.body(i));
  });

  const source = `
${uniforms.join("\n")}

${SRGB_TO_LINEAR}

half4 main(vec2 coord) {
  half4 src = image.eval(coord);
  half3 color = srgbToLinear(src.rgb);
  half alpha = src.a;

${bodies.join("\n")}

  return half4(linearToSrgb(clamp(color, half3(0.0), half3(1.0))), alpha);
}
`;

  console.log("[chain-source] generated source:", source.substring(0, 500));
  return source;
}
