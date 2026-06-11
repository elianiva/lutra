import Constants from "expo-constants";
import { File } from "expo-file-system";
import { useSQLiteContext } from "expo-sqlite";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, View } from "react-native";

import { BackButton } from "../../components/back-button";
import { Text } from "../../components/ui/text";

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function OptionsScreen() {
	const version = Constants.expoConfig?.version ?? "1.0.0";
	const db = useSQLiteContext();
	const [editCount, setEditCount] = useState(0);
	const [storageUsed, setStorageUsed] = useState(0);

	const loadStats = useCallback(async () => {
		try {
			const countRow = await db.getFirstAsync<{ count: number }>(
				"SELECT COUNT(*) as count FROM saved_edits",
			);
			setEditCount(countRow?.count ?? 0);

			// Calculate storage from file system
			const edits = await db.getAllAsync<{
				source_path: string;
				thumbnail_path: string;
			}>("SELECT source_path, thumbnail_path FROM saved_edits");

			let total = 0;
			for (const edit of edits) {
				try {
					const sourceFile = new File(edit.source_path);
					const sourceInfo = await sourceFile.info();
					if (sourceInfo.exists && sourceInfo.size) total += sourceInfo.size;

					const thumbFile = new File(edit.thumbnail_path);
					const thumbInfo = await thumbFile.info();
					if (thumbInfo.exists && thumbInfo.size) total += thumbInfo.size;
				} catch {
					// File might not exist, skip
				}
			}
			setStorageUsed(total);
		} catch (err) {
			console.error("Failed to load stats:", err);
		}
	}, [db]);

	useEffect(() => {
		loadStats();
	}, [loadStats]);

	const onClearAll = () => {
		Alert.alert(
			"Clear all edits",
			`This will delete ${editCount} edit${editCount !== 1 ? "s" : ""} and free ${formatBytes(storageUsed)}. This cannot be undone.`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Clear all",
					style: "destructive",
					onPress: async () => {
						// Delete all files
						const edits = await db.getAllAsync<{
							source_path: string;
							thumbnail_path: string;
						}>("SELECT source_path, thumbnail_path FROM saved_edits");

						for (const edit of edits) {
							try {
								const sourceFile = new File(edit.source_path);
								await sourceFile.delete();
							} catch {
								// File might not exist, skip
							}
							try {
								const thumbFile = new File(edit.thumbnail_path);
								await thumbFile.delete();
							} catch {
								// File might not exist, skip
							}
						}

						await db.runAsync("DELETE FROM saved_edits");
						await loadStats();
					},
				},
			],
		);
	};

	return (
		<View className="flex-1 bg-background">
			<BackButton onPress={() => router.back()} />
			<ScrollView
				contentContainerClassName="px-6 pt-32 pb-12"
				showsVerticalScrollIndicator={false}
			>
				<Text variant="h1" className="text-left">
					lutra
				</Text>
				<Text variant="muted" className="mt-3">
					A small, focused editor for film looks.
				</Text>

				<View className="mt-12 gap-6">
					<Row label="Version" value={version} />

					<View className="gap-1">
						<Text variant="small" className="text-muted-foreground">
							Source
						</Text>
						<Pressable
							onPress={() =>
								Linking.openURL("https://github.com/elianiva/lutra")
							}
						>
							<Text className="text-primary">
								github.com/elianiva/lutra
							</Text>
						</Pressable>
					</View>

					<Row label="License" value="MIT" />
				</View>

				{editCount > 0 && (
					<View className="mt-12 gap-4">
						<Text variant="h4">Storage</Text>
						<Row label="Saved edits" value={String(editCount)} />
						<Row label="Storage used" value={formatBytes(storageUsed)} />

						<Pressable
							onPress={onClearAll}
							className="mt-4 items-center rounded-md bg-destructive px-6 py-3 active:opacity-70"
						>
							<Text className="text-destructive-foreground">
								Clear all edits
							</Text>
						</Pressable>
					</View>
				)}
			</ScrollView>
		</View>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<View className="gap-1">
			<Text variant="small" className="text-muted-foreground">
				{label}
			</Text>
			<Text>{value}</Text>
		</View>
	);
}
