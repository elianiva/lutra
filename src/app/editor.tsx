import { useLocalSearchParams } from "expo-router";

import { Editor } from "../features/image-processing/editor";

export default function EditorRoute() {
	const { editId } = useLocalSearchParams<{ editId?: string }>();
	return <Editor editId={editId ? Number(editId) : undefined} />;
}
