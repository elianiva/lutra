import { Editor } from "../components/Editor";
import { Stack } from "expo-router";

export default function Home() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Editor />
    </>
  );
}
