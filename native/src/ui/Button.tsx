import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, space } from "../theme";

/** The app's button. `primary` is the one main action on a screen; `danger` is for deleting. */
export function Button({ label, onPress, kind = "plain", disabled }: { label: string; onPress: () => void; kind?: "primary" | "plain" | "danger"; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} aria-disabled={!!disabled} disabled={disabled} onPress={onPress} style={[s.btn, s[kind], disabled && s.off]}>
      <Text style={[s.text, kind === "danger" && { color: colors.warn }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.sm, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  plain: { borderColor: colors.line },
  danger: { borderColor: colors.warn },
  off: { opacity: 0.5 },
  text: { color: colors.text, fontSize: 16, fontWeight: "600" },
});
