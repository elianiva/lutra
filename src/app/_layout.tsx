import "../global.css";
import { Electrolize_400Regular, useFonts } from "@expo-google-fonts/electrolize";
import { SQLiteProvider } from "expo-sqlite";
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

const DB_VERSION = 1;

async function initDb(db: import("expo-sqlite").SQLiteDatabase) {
	await db.execAsync(`PRAGMA journal_mode = WAL;`);

	const row = await db.getFirstAsync<{ user_version: number }>(
		"PRAGMA user_version",
	);
	const current = row?.user_version ?? 0;
	if (current >= DB_VERSION) return;

	if (current === 0) {
		await db.execAsync(`
			CREATE TABLE IF NOT EXISTS saved_edits (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				source_path TEXT NOT NULL,
				preview_path TEXT NOT NULL,
				chain TEXT NOT NULL,
				thumbnail_path TEXT NOT NULL,
				created_at TEXT NOT NULL DEFAULT (datetime('now'))
			);
		`);
	}

	// if (current === 1) {
	//   Migration for version 2 goes here
	// }

	await db.execAsync(`PRAGMA user_version = ${DB_VERSION};`);
}

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
			<SQLiteProvider databaseName="lutra.db" onInit={initDb}>
				<Stack screenOptions={{ headerShown: false }} />
			</SQLiteProvider>
		</GestureHandlerRootView>
	);
}
