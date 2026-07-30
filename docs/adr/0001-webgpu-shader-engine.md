# WebGPU shader engine for adjustment layer processing

Lutra's mobile version uses React Native Skia for GPU-accelerated image processing. For the web version, we're using WebGPU compute shaders instead of Canvas 2D or WASM-based alternatives. WebGPU provides GPU-accelerated pixel processing that matches Skia's performance profile — critical for applying 10+ sequential adjustment layers to high-resolution images at interactive frame rates (slider scrubbing). Canvas 2D was rejected because per-pixel operations on a 12MP image would drop below 30fps with multiple layers; WASM (e.g., libvips) was rejected because it adds a multi-MB binary and can't leverage the GPU for compute shaders.

**Status**: accepted

**Considered Options**:

- **Canvas 2D** — `getImageData`/`putImageData` per layer. Simplest API, 100% browser support. Rejected: too slow for 10+ sequential layers on high-res images; each layer requires a full CPU-side pixel buffer round-trip.
- **WASM (libvips, etc.)** — battle-tested image processing in a WASM binary. Rejected: large binary size, CPU-bound, no GPU acceleration, complex build tooling.
- **WebGL** — fragment shaders via WebGL. Viable but API is dated, stateful, and harder to compose compute passes. Rejected in favor of WebGPU's modern, stateless API.
- **WebGPU** — compute shaders with bind groups, suitable for chained image processing passes. ~92% browser support as of mid-2025. Accepted: matches Skia's GPU performance, modern API, zero binary overhead.

**Consequences**:

- ~8% of browsers (Safari < 17, older devices) won't render the editor. We'll need a feature-detection gate and a fallback message.
- Each adjustment layer maps to a WGSL compute shader. The engine compiles a single merged shader from the ordered chain to minimize GPU passes (per ADR-0006 from lutra-mobile, which this inherits).
