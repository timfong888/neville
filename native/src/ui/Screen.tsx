import { type ReactNode, useContext } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from "react-native";
import { HeaderHeightContext } from "expo-router/react-navigation";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, space, type } from "../theme";

/**
 * The page frame every screen uses: safe area, scroll, one column capped for wide browsers.
 * `footer` stays in sight below the scroll area and rides above the keyboard (#149).
 * `scrollRef` exposes the inner ScrollView for programmatic scrolling.
 * `onScrollBeginDrag` / `onScrollEndDrag` let callers suppress auto-scroll while the user drags.
 */
export function Screen({ title, children, footer, scrollRef, onScrollBeginDrag, onScrollEndDrag }: {
  title?: string;
  children?: ReactNode;
  footer?: ReactNode;
  scrollRef?: React.RefObject<ScrollViewInstance | null>;
  onScrollBeginDrag?: () => void;
  onScrollEndDrag?: () => void;
}) {
  // The view measures the keyboard overlap from its parent's top, so a navigation header above it
  // must be added back. It is 0 on the tabs, which show no header.
  const header = useContext(HeaderHeightContext) ?? 0;
  return (
    <KeyboardAvoidingView style={s.safe} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={header}>
      <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
        {/* Dragging the page puts the keyboard away; a tap on a button works first time. */}
        <ScrollView ref={scrollRef} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} onScrollBeginDrag={onScrollBeginDrag} onScrollEndDrag={onScrollEndDrag}>
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
