import { QueryClient, focusManager } from "@tanstack/react-query";
import { AppState, type AppStateStatus, Platform } from "react-native";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: true,
			staleTime: 0,
		},
	},
});

// React Native: use AppState for focus detection instead of window focus
focusManager.setEventListener((handleFocus) => {
	const subscription = AppState.addEventListener(
		"change",
		(status: AppStateStatus) => {
			if (Platform.OS !== "web") {
				handleFocus(status === "active");
			}
		},
	);
	return () => subscription.remove();
});
