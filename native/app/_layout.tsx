import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "../src/player/musicStore"; // The music player follows the stored choice from launch (#184).
import { audio } from "../src/seams/audio";
import { colors } from "../src/theme";

// A screen opened cold (a deep link, a browser refresh) still gets the tabs underneath, so Back works.
export const unstable_settings = { initialRouteName: "(tabs)" };

// The root stack. The four tabs live in (tabs); Player and Library detail push on top of them.
export default function Layout() {
  // The background and lock-screen audio mode is set once at launch, before any screen plays (#153).
  useEffect(() => {
    audio.configure().catch(() => {});
  }, []);
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="player/[id]" options={{ title: "Player" }} />
        <Stack.Screen name="library/[id]" options={{ title: "Library" }} />
        <Stack.Screen name="spike" options={{ title: "Audio spike" }} />
      </Stack>
    </>
  );
}
