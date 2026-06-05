# Render chain is a nested tree of per-adjustment RuntimeShaders

The **edit chain** renders as a nested JSX tree where each **adjustment layer** is a `RuntimeShader` whose child is the previous layer's output. Considered the alternative of one big composite shader that always runs all 5 adjustments. Picked the nested form so only the adjustments the user actually added execute; the alternative would have always paid for absent stages. The nesting is hidden behind a single `<Pipeline>` component so consumers never see it.
