import { router } from "expo-router";
import { ActivityIndicator, Pressable, View } from "react-native";

import { useImagePicker } from "../lib/use-image-picker";
import { Text } from "./ui/text";

export function MainMenu() {
  const { pick, isPicking } = useImagePicker();

  const onEdit = async () => {
    await pick();
    // Only push if pick() actually set an image. Permission denial
    // and picker cancel both return without touching the store.
    // Read the store after the await rather than relying on a
    // return value so the hook stays free of navigation knowledge.
    router.push("/editor");
  };

  return (
    <View className="flex-1 bg-background px-8">
      <View className="flex-1 items-center justify-center">
        <Text variant="h1" className="text-6xl tracking-tight">
          LUTRA
        </Text>

        <View className="mt-16 w-full max-w-xs gap-4">
          <Pressable
            onPress={onEdit}
            disabled={isPicking}
            className="items-center rounded-xl bg-primary px-6 py-4 active:opacity-70 disabled:opacity-50"
          >
            {isPicking ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator
                  size="small"
                  className="text-primary-foreground"
                />
                <Text className="text-primary-foreground">Preparing preview…</Text>
              </View>
            ) : (
              <Text className="text-primary-foreground">Edit Image</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.push("/options")}
            disabled={isPicking}
            className="items-center py-2 active:opacity-60"
          >
            <Text className="text-muted-foreground">Options</Text>
          </Pressable>
        </View>
      </View>

      <View className="items-center pb-8">
        <Text variant="muted">v1.0.0</Text>
      </View>
    </View>
  );
}
