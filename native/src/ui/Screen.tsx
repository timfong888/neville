import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, space, type } from "../theme";

/** The page frame every screen uses: safe area, scroll, one column capped for wide browsers. */
export function Screen({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <View style={s.col}>
          {title ? <Text accessibilityRole="header" style={type.h1}>{title}</Text> : null}
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** An empty screen that names its route. Each Phase 1 screen replaces one of these. */
export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <Screen title={title}>
      <Text style={type.muted}>{note}</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  page: { flexGrow: 1, padding: space.xl },
  col: { width: "100%", maxWidth: 640, alignSelf: "center", gap: space.lg },
});
