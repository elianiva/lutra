import { View } from "react-native";

import { layerRegistry } from "../layers/registry";
import { type Layer, type LayerType, type SVsFor, type LayerPatch } from "../layers/types";

type Props = {
	layer: Layer;
	sv: SVsFor<LayerType>;
	onCommit: (id: string, patch: LayerPatch) => void;
	onRemove: (id: string) => void;
};

export function EditPanel({ layer, sv, onCommit, onRemove }: Props) {
	return (
		<View className="p-4 flex-1">
			{(() => {
				switch (layer.type) {
					case "exposure": {
						const P = layerRegistry.exposure.params;
						return (
							<P
								layer={layer}
								sv={sv as SVsFor<"exposure">}
								onCommit={(p) => onCommit(layer.id, { type: "exposure", patch: p })}
								onRemove={() => onRemove(layer.id)}
							/>
						);
					}
					case "contrast": {
						const P = layerRegistry.contrast.params;
						return (
							<P
								layer={layer}
								sv={sv as SVsFor<"contrast">}
								onCommit={(p) => onCommit(layer.id, { type: "contrast", patch: p })}
								onRemove={() => onRemove(layer.id)}
							/>
						);
					}
					case "shadows": {
						const P = layerRegistry.shadows.params;
						return (
							<P
								layer={layer}
								sv={sv as SVsFor<"shadows">}
								onCommit={(p) => onCommit(layer.id, { type: "shadows", patch: p })}
								onRemove={() => onRemove(layer.id)}
							/>
						);
					}
					case "whiteBalance": {
						const P = layerRegistry.whiteBalance.params;
						return (
							<P
								layer={layer}
								sv={sv as SVsFor<"whiteBalance">}
								onCommit={(p) =>
									onCommit(layer.id, { type: "whiteBalance", patch: p })
								}
								onRemove={() => onRemove(layer.id)}
							/>
						);
					}
					case "saturation": {
						const P = layerRegistry.saturation.params;
						return (
							<P
								layer={layer}
								sv={sv as SVsFor<"saturation">}
								onCommit={(p) =>
									onCommit(layer.id, { type: "saturation", patch: p })
								}
								onRemove={() => onRemove(layer.id)}
							/>
						);
					}
					case "grain": {
						const P = layerRegistry.grain.params;
						return (
							<P
								layer={layer}
								sv={sv as SVsFor<"grain">}
								onCommit={(p) => onCommit(layer.id, { type: "grain", patch: p })}
								onRemove={() => onRemove(layer.id)}
							/>
						);
					}
					case "vignette": {
						const P = layerRegistry.vignette.params;
						return (
							<P
								layer={layer}
								sv={sv as SVsFor<"vignette">}
								onCommit={(p) =>
									onCommit(layer.id, { type: "vignette", patch: p })
								}
								onRemove={() => onRemove(layer.id)}
							/>
						);
					}
					case "chromaticAberration": {
						const P = layerRegistry.chromaticAberration.params;
						return (
							<P
								layer={layer}
								sv={sv as SVsFor<"chromaticAberration">}
								onCommit={(p) =>
									onCommit(layer.id, { type: "chromaticAberration", patch: p })
								}
								onRemove={() => onRemove(layer.id)}
							/>
						);
					}
					case "clarity": {
						const P = layerRegistry.clarity.params;
						return (
							<P
								layer={layer}
								sv={sv as SVsFor<"clarity">}
								onCommit={(p) =>
									onCommit(layer.id, { type: "clarity", patch: p })
								}
								onRemove={() => onRemove(layer.id)}
							/>
						);
					}
				}
			})()}
		</View>
	);
}
