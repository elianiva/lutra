import { assign, setup } from "xstate";

type UiContext = {
  selectedLayerId: string | null;
};

type UiEvent = { type: "SELECT"; id: string | null };

// Minimal v0.1 FSM. The full mode-switched panel machine lands in v0.2 — for
// now we only need selectedLayerId so the Editor can hand a single active
// layer to the Edit panel.
export const uiMachine = setup({
  types: {
    context: {} as UiContext,
    events: {} as UiEvent,
  },
}).createMachine({
  id: "ui",
  context: { selectedLayerId: null },
  on: {
    SELECT: {
      actions: assign({
        selectedLayerId: ({ event }) => event.id,
      }),
    },
  },
});
