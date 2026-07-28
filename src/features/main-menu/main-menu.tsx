import { router } from "expo-router";
import { Settings } from "lucide-react-native";
import { useCallback } from "react";
import {
	Alert,
	FlatList,
	Image,
	Pressable,
	RefreshControl,
	useWindowDimensions,
	View,
} from "react-native";

import { Icon } from "../../components/ui/icon";
import { Text } from "../../components/ui/text";
import { type SavedEdit } from "../saved-edits/db";
import { useCreateEdit } from "../saved-edits/use-create-edit";
import { useDeleteEdit } from "../saved-edits/use-delete-edit";
import { useDuplicateEdit } from "../saved-edits/use-duplicate-edit";
import { useEdits } from "../saved-edits/use-edits";
import { useImagePicker } from "./use-image-picker";

const GUTTER = 8;
const PADDING = 8;
const COLUMNS = 3;

export function MainMenu() {
	const { width } = useWindowDimensions();
	const pickMutation = useImagePicker();
	const createEdit = useCreateEdit();
	const { data: edits, isLoading, refetch } = useEdits();
	const deleteEdit = useDeleteEdit();
	const duplicateEdit = useDuplicateEdit();

	const onNewEdit = useCallback(async () => {
		try {
			const data = await pickMutation.mutateAsync();
			if (!data) return;
			const editId = await createEdit.mutateAsync(data);
			router.push({ pathname: "/editor", params: { editId: String(editId) } });
		} catch (err) {
			// Errors are already surfaced by each mutation's onError handler.
		}
	}, [pickMutation, createEdit]);

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
				onPress: () => duplicateEdit.mutate(edit.id),
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
							onPress: () => deleteEdit.mutate(edit.id),
						},
					]);
				},
			},
			{ text: "Cancel", style: "cancel" },
		]);
	};

	const onOptions = () => router.push("/options");

	const itemWidth = (width - PADDING * 2 - GUTTER * (COLUMNS - 1)) / COLUMNS;

	const renderItem = useCallback(
		({ item }: { item: SavedEdit }) => (
			<Pressable
				onPress={() => onEditPress(item)}
				onLongPress={() => onEditLongPress(item)}
				style={{ width: itemWidth, height: itemWidth }}
				className="rounded-md bg-secondary overflow-hidden"
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
		[itemWidth],
	);

	const keyExtractor = useCallback((item: SavedEdit) => String(item.id), []);

	const editList = edits ?? [];

	if (editList.length === 0 && !isLoading) {
		return (
			<View className="flex-1 bg-background">
				<View className="flex-row justify-between items-center px-4 pt-16">
					<Text className="text-xl tracking-tight font-sans">LUTRA</Text>
					<View className="flex-row gap-4">
						<Pressable onPress={onOptions} className="p-2">
							<Icon as={Settings} size={20} color="#fafafa" />
						</Pressable>
					</View>
				</View>
				<View className="flex-1 items-center justify-center px-8">
					<Pressable
						onPress={onNewEdit}
						disabled={pickMutation.isPending || createEdit.isPending}
						className="items-center rounded-md bg-primary px-6 py-4 active:opacity-70 disabled:opacity-50"
					>
						<Text className="text-primary-foreground text-lg">
							{pickMutation.isPending || createEdit.isPending ? "Preparing…" : "Start editing"}
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
					<Pressable onPress={onNewEdit} disabled={pickMutation.isPending || createEdit.isPending} className="p-2 disabled:opacity-30">
						<Text className="text-2xl">+</Text>
					</Pressable>
					<Pressable onPress={onOptions} className="p-2">
						<Icon as={Settings} size={20} className="fill-foreground" fill="#ffffff" />
					</Pressable>
				</View>
			</View>
			<FlatList
				data={editList}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				numColumns={3}
				contentContainerClassName="px-2 pb-8"
				columnWrapperClassName="gap-2 mb-2"
				refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
			/>
		</View>
	);
}
