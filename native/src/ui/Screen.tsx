import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, space, type } from "../theme";

/**
 * The page frame every screen uses: safe area, scroll, one column capped for wide browsers.
 * `footer` stays in sight below the scroll area and rides above the keyboard (#149).
 */
export function Screen({ title, children, footer }: { title?: string; children?: ReactNode; footer?: ReactNode }) {
  return (
    // Outermost, so its frame starts at the top of the window and the keyboard overlap is measured right.
    <KeyboardAvoidingView style={s.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
        {/* Dragging the page puts the keyboard away; a tap on a button works first time. */}
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
          <View style={s.col}>
            {title ? <Text accessibilityRole="header" style={type.h1}>{title}</Text> : null}
            {children}
          </View>
        </ScrollView>
        {footer ? (
          <View style={s.footer}>
            <View style={s.col}>{footer}</View>
          </View>
        ) : null}
      </SafeAreaView>
    </KeyboardAvoidingView>
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
  footer: { paddingHorizontal: space.xl, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  col: { width: "100%", maxWidth: 640, alignSelf: "center", gap: space.lg },
});
