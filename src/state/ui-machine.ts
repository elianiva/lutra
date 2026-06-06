import { assign, setup } from "xstate";

export type PanelMode = "add" | "edit" | "layers";

type UiContext = {
	mode: PanelMode;
	selectedLayerId: string | null;
};

// Two events: select a layer (or clear with null), and switch the panel
// mode. Mode + selection transitions that would otherwise need their own
// event (e.g. "add then auto-select the new one") are expressed by the
// editor sending SELECT_LAYER { id } after SWITCH_TO / chain mutations.
type UiEvent =
	| { type: "SELECT_LAYER"; id: string | null }
	| { type: "SWITCH_TO"; mode: PanelMode };

// Single-state FSM. The "states" are really modes held in context. We
// keep xstate for: (a) a clean place to express the model + transitions
// as the editor grows, (b) action logging / inspection if we add dev
// tooling, (c) the future workflow when we add things like "saving",
// "exporting", or "modal layers panel" that genuinely are FSM-shaped
// (multiple states, guards, history). Today the guards are just default
// transitions; the value of the machine is the schema, not the
// enforcement.
export const uiMachine = setup({
	types: {
		context: {} as UiContext,
		events: {} as UiEvent,
	},
}).createMachine({
	id: "ui",
	context: {
		mode: "add",
		selectedLayerId: null,
	},
	on: {
		SELECT_LAYER: {
			actions: assign(({ context, event }) => ({
				selectedLayerId: event.id,
				// Selecting a layer opens the edit panel. Deselecting
				// (id === null, e.g. after removal) leaves the mode
				// untouched; the EmptyEdit placeholder handles
				// "edit mode with no selection".
				mode: event.id !== null ? ("edit" as const) : context.mode,
			})),
		},
		SWITCH_TO: {
			actions: assign({ mode: ({ event }) => event.mode }),
		},
	},
});
