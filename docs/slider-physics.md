# Slider Physics

The ruler slider emulates a mechanical lens adjustment ring. The physical feel comes from three layers, described from bottom to top.

## 1. Gesture thread model

The slider uses RNGH v3's `usePanGesture()` hook API (not the legacy builder `Gesture.Pan()`). This is critical: `usePanGesture()` callbacks execute as **worklets on the UI thread** at native frame rate. The deprecated `Gesture.Pan()` builder API runs on the JS thread, crossing the RN bridge on every frame — that bridge overhead is what causes the "sticky" or "jumpy" feel.

```ts
// ✅ UI thread, no bridge
const gesture = usePanGesture({
  onUpdate: (e) => { /* e.changeX is available here */ },
  onFinalize: () => { /* ... */ },
});
```

The `onUpdate` callback fires continuously during the drag, providing `e.changeX` (delta in points since the last event) at 60–120 fps on the UI thread. The SharedValue `value.value` is mutated directly inside the worklet; Reanimated propagates the change to the display label and the Skia shader uniforms without a React re-render.

## 2. Transfer function (piecewise-linear acceleration)

The core physics: `e.changeX` is not mapped 1:1 to the slider value. Instead it passes through a **piecewise-linear transfer function** that modulates sensitivity based on drag speed.

This design is modelled after libinput's [linear pointer acceleration profile](https://wayland.freedesktop.org/libinput/doc/latest/pointer-acceleration.html) and the X server's classic pointer acceleration. Both use the same three-zone structure:

```
effective_delta = delta × BASE_SENSITIVITY × factor(speed)

                    ┌──────────────────────────────┐
                    │         capped zone          │
    factor          │  (constant max acceleration) │
                    │                              │
    ACCEL_MAX ──────┤······························┤
                    │          ╱                   │
                    │        ╱                     │
                    │      ╱  ramp zone            │
                    │    ╱    (linear interpolation)│
    1.0 ────────────┤··╱···························│
                    │ ╱                             │
                    │╱                              │
    DECEL_FACTOR ───┤                               │
                    │  precision zone (constant)    │
                    └──────┬───────────┬────────────┘
                          LOW         HIGH
                              speed (px/frame)
```

| Zone | Speed range | Factor | What it does |
|---|---|---|---|
| **Precision** | 0 – LOW_VEL px/frame | DECEL_FACTOR (0.4) | Sub-1:1 mapping. A 1px nudge moves the value less than 1px-worth. Enables micro-adjustments without overshoot. |
| **Ramp** | LOW_VEL – HIGH_VEL | Linear from DECEL → ACCEL_MAX | Smooth transition from precision to assisted range. No sudden jumps. |
| **Capped** | > HIGH_VEL | ACCEL_MAX (1.6) | Fast swipes cover the full value range, but acceleration is bounded — no runaway. |

### Why this beats a power curve

A power curve (`|x|^p`) has no deceleration zone — it always amplifies (`|x|^1.4 > |x|` for `|x| > 1`). There's no way to be *more* precise than 1:1. The piecewise function explicitly decelerates slow movements, giving sub-pixel precision that a power curve cannot express.

The capped maximum also prevents the "slingshot" problem: a power curve grows unbounded, so a fast enough swipe will skip the entire range. The piecewise cap means fast swipes are assisted but never wildly disproportionate.

### Tuning knobs

All constants are in `src/features/image-processing/ui/slider.tsx`:

| Constant | Default | Effect of increasing |
|---|---|---|
| `BASE_SENSITIVITY` | 0.015 | Overall speed of all zones |
| `DECEL_FACTOR` | 0.4 | Precision at slow speeds (0 = frozen, 1 = no deceleration) |
| `ACCEL_MAX` | 1.6 | Top speed for fast swipes |
| `LOW_VEL` | 2 | Width of precision zone (px/frame) |
| `HIGH_VEL` | 16 | Point where acceleration caps out |

## 3. Tick ruler (visual only)

The tick marks are **purely decorative** — they scroll smoothly based on the continuous value and do not influence gesture handling. There is no snapping, no detent logic, and no haptic feedback tied to tick position.

The tick positions are computed by `getValueTickPosition()`, which maps the current value to a fractional index in the tick array via linear interpolation. This fractional index drives the horizontal scroll of the ruler. The value itself is never quantized.

Earlier versions snapped the value to tick boundaries during and after the drag. This was removed because:
- Snapping fights the smooth tracking, creating a "stutter" feel.
- The tick ruler provides visual reference without constraining input.
- Mechanical lenses have click detents, but we're not building a physical simulator — the ticks are a UI affordance, not a constraint.

## References

- [libinput pointer acceleration](https://wayland.freedesktop.org/libinput/doc/latest/pointer-acceleration.html) — the three-zone piecewise model
- [X server pointer acceleration analysis](https://who-t.blogspot.com/2018/05/x-server-pointer-acceleration-analysis-part1.html) — classic profile behavior, deceleration zone rationale
- [Gesture Guide — Physics Feel](https://interactionguide.cn/physics/) — momentum, friction, springs, and rubber-banding in gesture-driven UIs
- [RNGH v3 Pan Gesture](https://docs.swmansion.com/react-native-gesture-handler/docs/gestures/use-pan-gesture) — `usePanGesture()` hook API vs legacy builder `Gesture.Pan()`
