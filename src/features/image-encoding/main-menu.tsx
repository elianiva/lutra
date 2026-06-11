import { useSQLiteContext } from "expo-sqlite";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
	Alert,
	FlatList,
	Image,
	Pressable,
	RefreshControl,
	View,
} from "react-native";
import { Settings } from "lucide-react-native";

import { Text } from "../../components/ui/text";
import { useImagePicker } from "./use-image-picker";

type SavedEdit = {
	id: number;
	source_path: string;
	chain: unknown[];
	thumbnail_path: string;
	created_at: string;
};

export function MainMenu() {
	const { pick, isPicking } = useImagePicker();
	const [edits, setEdits] = useState<SavedEdit[]>([]);
	const [refreshing, setRefreshing] = useState(false);
	const db = useSQLiteContext();

	const loadEdits = useCallback(async () => {
		try {
			const rows = await db.getAllAsync<{
				id: number;
				source_path: string;
				chain: string;
				thumbnail_path: string;
				created_at: string;
			}>("SELECT * FROM saved_edits ORDER BY created_at DESC");

			setEdits(
				rows.map((row) => ({
					...row,
					chain: JSON.parse(row.chain),
				})),
			);
		} catch (err) {
			console.error("Failed to load edits:", err);
		}
	}, [db]);

	// Reload when screen comes into focus
	useFocusEffect(
		useCallback(() => {
			loadEdits();
		}, [loadEdits]),
	);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await loadEdits();
		setRefreshing(false);
	}, [loadEdits]);

	const onNewEdit = async () => {
		await pick();
		router.push("/editor");
	};

	const onEditPress = (edit: SavedEdit) => {
		router.push({
			pathname: "/editor",
			params: { editId: String(edit.id) },
		});
	};

	const onEditLongPress = (edit: SavedEdit) => {
		Alert.alert("Edit", "What would you like to do?", [
			{
				text: "Duplicate",
				onPress: async () => {
					await db.runAsync(
						"INSERT INTO saved_edits (source_path, chain, thumbnail_path) SELECT source_path, chain, thumbnail_path FROM saved_edits WHERE id = ?",
						edit.id,
					);
					await loadEdits();
				},
			},
			{
				text: "Delete",
				style: "destructive",
				onPress: () => {
					Alert.alert("Delete", "Are you sure?", [
						{ text: "Cancel", style: "cancel" },
						{
							text: "Delete",
							style: "destructive",
							onPress: async () => {
								await db.runAsync(
									"DELETE FROM saved_edits WHERE id = ?",
									edit.id,
								);
								await loadEdits();
							},
						},
					]);
				},
			},
			{ text: "Cancel", style: "cancel" },
		]);
	};

	const onOptions = () => router.push("/options");

	const renderItem = useCallback(
		({ item }: { item: SavedEdit }) => (
			<Pressable
				onPress={() => onEditPress(item)}
				onLongPress={() => onEditLongPress(item)}
				className="flex-1 aspect-square rounded-md bg-secondary overflow-hidden"
			>
				{item.thumbnail_path ? (
					<Image
						source={{ uri: item.thumbnail_path }}
						className="w-full h-full"
						resizeMode="cover"
					/>
				) : (
					<View className="flex-1 items-center justify-center">
						<Text variant="muted">No preview</Text>
					</View>
				)}
			</Pressable>
		),
		[loadEdits],
	);

	const keyExtractor = useCallback((item: SavedEdit) => String(item.id), []);

	if (edits.length === 0) {
		return (
			<View className="flex-1 bg-background">
				<View className="flex-row justify-between items-center px-4 pt-16">
					<Text className="text-xl tracking-tight font-sans">LUTRA</Text>
					<View className="flex-row gap-4">
						<Pressable onPress={onOptions} className="p-2">
							<Settings size={20} className="text-foreground" />
						</Pressable>
					</View>
				</View>
				<View className="flex-1 items-center justify-center px-8">
					<Pressable
						onPress={onNewEdit}
						disabled={isPicking}
						className="items-center rounded-md bg-primary px-6 py-4 active:opacity-70 disabled:opacity-50"
					>
						<Text className="text-primary-foreground text-lg">
							{isPicking ? "Preparing…" : "Start editing"}
						</Text>
					</Pressable>
					<Text variant="muted" className="mt-4">
						Your edits will appear here
					</Text>
				</View>
			</View>
		);
	}

	return (
		<View className="flex-1 bg-background">
			<View className="flex-row justify-between items-center px-4 pt-16 pb-2">
				<Text className="text-xl tracking-tight font-sans">LUTRA</Text>
				<View className="flex-row gap-4">
					<Pressable onPress={onNewEdit} disabled={isPicking} className="p-2">
						<Text className="text-2xl">+</Text>
					</Pressable>
					<Pressable onPress={onOptions} className="p-2">
						<Settings size={20} className="text-foreground" />
					</Pressable>
				</View>
			</View>
			<FlatList
				data={edits}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				numColumns={3}
				contentContainerClassName="px-2 pb-8"
				columnWrapperClassName="gap-2 mb-2"
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			/>
		</View>
	);
}
