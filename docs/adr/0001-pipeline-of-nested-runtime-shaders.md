# Render chain is a single chain-compiled RuntimeEffect (superseded)

> **Superseded by [0006](./0006-single-dispatch-chain-compilation.md).** The nested per-layer `RuntimeShader` model is replaced by a single `RuntimeEffect` generated from the active layer bodies. The chain-compilation model gets us one GPU pass regardless of layer count and a single sRGB<->linear round-trip for the whole chain.

The original ADR (kept below for history) described the nested per-layer shape. The pipeline now uses a single `<Shader>` whose source is generated from the ordered layer bodies. The chain-config cache keeps the regen cost off the slider drag path. See 0006 for the current model.
