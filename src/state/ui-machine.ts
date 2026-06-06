import { assign, setup } from "xstate";

export type PanelMode = "add" | "edit" | "layers";

type UiContext = {
	mode: PanelMode;
	selectedLayerId: string | null;
};

type UiEvent =
	| { type: "SWITCH_TO_ADD" }
	| { type: "SWITCH_TO_EDIT" }
	| { type: "SWITCH_TO_LAYERS" }
	| { type: "SELECT_LAYER"; id: string | null }
	| { type: "LAYER_ADDED"; id: string }
	| { type: "LAYER_REMOVED" };

// Single-state FSM. The "states" are really modes held in context, since
// there are no real workflow transitions — every event just rewrites
// context. Keeps the editor's mode-switched panel authoritative without
// turning every tab change into a state machine transition.
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
		SWITCH_TO_ADD: {
			actions: assign({ mode: "add" }),
		},
		SWITCH_TO_EDIT: {
			actions: assign({ mode: "edit" }),
		},
		SWITCH_TO_LAYERS: {
			actions: assign({ mode: "layers" }),
		},
		SELECT_LAYER: {
			actions: assign({
				selectedLayerId: ({ event }) => event.id,
				mode: "edit",
			}),
		},
		LAYER_ADDED: {
			actions: assign({
				selectedLayerId: ({ event }) => event.id,
				mode: "edit",
			}),
		},
		LAYER_REMOVED: {
			actions: assign({ selectedLayerId: null }),
		},
	},
});
