# Slider scrubbing writes to Reanimated shared values; the store commits on release

Slider drag updates a per-param `useSharedValue` on the UI thread; the shader reads it via a `useDerivedValue` uniform. The **`@xstate/store` chain** holds only the _initial_ (committed) value and is updated on slider release. Considered React `useState` for both the live and canonical state — rejected because it forces the whole `<Pipeline>` tree to re-render on every tick, jank under fast scrubbing or with many layers. The dual source of truth is deliberate: shared value is the live render source, store is the canonical/replayable source. Persistence (when added) reads `.value` from the shared values at save time.

_See also: [0004](./0004-registry-as-source-of-truth.md) — the per-field `SharedValue<number>` map is built by iterating `entry.fields` in `useLayerSVMap`; the chain store then commits on release. This ADR captures the dual-source rationale; that one captures where the SVs are created._
