# Export post-scales the rendered frame

Export does not re-render the edit chain at the target size: the displayed frame is read back from the GPU and downscaled in the encode worker (Lanczos), capped at 100%. Re-rendering at export resolution would scale pixel-space effects (grain cell size, clarity radius) with the output — technically the "correct" film-emulation behavior — but it requires an off-screen, canvas-less GPU session, a second full chain render, and the exported frame would not match the frame the user saw (grain is animated per frame). Post-scale keeps export honest ("what you see, at this size"), reuses the existing snapshot path untouched, and folds the one new cost — high-quality downscale — into the worker the encoder needs anyway.

**Status**: accepted

**Considered Options**:

- **Re-render the chain at export resolution** — scales grain and other pixel-space effects with the output, but adds an off-screen session to the GPU backend, doubles the render cost of an export, and the result diverges from the displayed frame.
- **Post-scale with canvas `drawImage`** — no worker needed, but bilinear downscaling is visibly worse than Lanczos at 25–50%, and we are already paying for the worker for AVIF.

**Consequences**:

- Grain and other pixel-space effects do not scale with export size: a 50% export shows grain at half its on-screen size. If true output-scaled grain ever becomes a goal, this ADR is the place to revisit.
- Export size is bounded by the source resolution — no upscaling.
- The snapshot readback feeds the encode worker directly as `ImageData` (transferable buffer); no intermediate `ImageBitmap` round-trip.
