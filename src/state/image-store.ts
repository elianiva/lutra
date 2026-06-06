import { createStore } from "@xstate/store";

type ImageState = {
	uri: string | null;
};

export const imageStore = createStore({
	context: { uri: null } as ImageState,
	on: {
		setImage: (_ctx, event: { uri: string | null }) => ({
			uri: event.uri,
		}),
	},
});
