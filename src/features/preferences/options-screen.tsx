import Constants from "expo-constants";
import { router } from "expo-router";
import { Linking, Pressable, ScrollView, View } from "react-native";

import { BackButton } from "../../components/back-button";
import { Text } from "../../components/ui/text";

// v1 surface is intentionally about-style: real content (version,
// repo, license) instead of fake settings rows that would age into
// misleading placeholders. The shape is the "About" page Snapseed /
// Halide use; real settings get added as a second section later.
export function OptionsScreen() {
	const version = Constants.expoConfig?.version ?? "1.0.0";

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
							onPress={() => Linking.openURL("https://github.com/elianiva/lutra")}
						>
							<Text className="text-primary">github.com/elianiva/lutra</Text>
						</Pressable>
					</View>

					<Row label="License" value="MIT" />
				</View>
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
