# Compare presents without re-rendering

The **Compare** feature (before/after viewing) keeps presentation separate from computation. The model holds the compare mode and **split position**; changes to them dispatch a blit-only present command instead of a render. The GPU backend splits the fused compute+histogram+blit `execute` into chain rendering and a separate presentation pass, and the frontend-owned blit samples the source texture (before) or the display texture (after) per mode.

Re-rendering on every presentation change was rejected: a full chain render per divider-drag pixel is wasteful on large images, and it animates the grain on the graded side during a drag (grain advances per render). A two-canvas side-by-side strip was rejected: when fitted to the stage both approaches render identically, the shared pan/zoom cannot zoom one side independently anyway, and Split already covers full-resolution detail inspection.
