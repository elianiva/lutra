import { Stack } from "expo-router";

import { Editor } from "../components/editor";

export default function Home() {
	return (
		<>
			<Stack.Screen options={{ headerShown: false }} />
			<Editor />
		</>
	);
}
