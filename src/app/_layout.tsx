import "../global.css";
import { Electrolize_400Regular, useFonts } from "@expo-google-fonts/electrolize";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Uniwind } from "uniwind";

// Lock to dark mode — no light theme, no system-follow.
Uniwind.setTheme("dark");

// Hide the native splash only after fonts are loaded so the wordmark
// renders in Electrolize from the first frame, not after a swap.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
	const [loaded, error] = useFonts({
		Electrolize_400Regular,
	});

	useEffect(() => {
		if (loaded || error) SplashScreen.hideAsync();
	}, [loaded, error]);

	if (!loaded && !error) return null;

	return (
		<GestureHandlerRootView className="flex-1">
			<Stack screenOptions={{ headerShown: false }} />
		</GestureHandlerRootView>
	);
}
