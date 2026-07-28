import { type BodyRenderer } from "../format";

// DEFERRED. CA samples the source at three offset positions to split
// the R and B channels radially. In F the body would need to call
// image.eval(coord + offset) directly (the chain operates on the
// accumulated `color`, not the source), which breaks the linear
// accumulation model. Reworking CA in F is a separate task; the body
// emits nothing for now so a CA layer in the chain is a visible
// no-op rather than a compile error.
export const renderChromaticAberration: BodyRenderer = (_i) => `
// chromatic aberration (deferred to F rework)
`;
