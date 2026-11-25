import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "../src/theme";

// The root stack. The four tabs live in (tabs); Player and Library detail push on top of them.
export default function Layout() {
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
        <Stack.Screen name="phase0" options={{ title: "Phase 0" }} />
        <Stack.Screen name="spike" options={{ title: "Audio spike" }} />
      </Stack>
    </>
  );
}
