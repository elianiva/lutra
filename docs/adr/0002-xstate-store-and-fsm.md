# State is split: `@xstate/store` for the chain, `xstate` FSM for the UI flow

Two packages, deliberately. `@xstate/store` holds the **edit chain** as data (`Layer[]`) with event-based mutations (`add` / `remove` / `reorder` / `updateParams` / `toggleVisible`) and is persist-ready. `xstate` holds the **UI flow** (panel mode + `selectedLayerId`) as a finite state machine.

The current machine is intentionally **single-state** — every event just rewrites context. There are no real workflow transitions yet, so the value of the FSM is the schema (event types, typed context, the action log if we add dev tooling) and **forward-compatibility** for features we know are coming: a "saving" / "exporting" workflow with multiple steps and guards, modal overlays (e.g. confirm-discard), or a dedicated "history" mode for undo/redo. Those are genuinely FSM-shaped, and the package boundary gives us a clean place to add the states, guards, and parallel regions without restructuring the editor.

What the machine does **today**:
- one context: `{ mode, selectedLayerId }`
- two events: `SELECT_LAYER { id }` (with `id: null` to clear), `SWITCH_TO { mode }`
- one rule: selecting a layer (`id !== null`) also opens the edit panel

The "no-op when clearing" rule (deselecting leaves the mode untouched so the `EmptyEdit` placeholder can show) is expressed explicitly in the `SELECT_LAYER` action. Earlier revisions of this ADR claimed the machine enforced `mode === "edit" ⇒ selectedLayerId !== null"`. It doesn't, and the current rule is what we want: that invariant is upheld by the editor's `onRemove` (clears the selection and stays in the current mode) and by the UI (`<EmptyEdit />` is rendered when in `edit` mode with no selection).

_See also: [0004](./0004-registry-as-source-of-truth.md) — the chain store's `add` event takes a complete `Layer` (caller-generated, not a `{ layerType }` discriminated event) and the `updateParams` reducer trusts the type-checker at the call site. The store/FSM split is the topic of this ADR; the per-event contract is in that one._
