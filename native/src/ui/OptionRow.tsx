import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, space, type } from "../theme";

/** One choice in a single-choice list: a radio dot, a label, a note, and an optional button on the right. */
export function OptionRow(p: { label: string; note?: string; selected: boolean; disabled?: boolean; isDefault?: boolean; onPress: () => void; right?: ReactNode }) {
  return (
    <View style={[s.row, p.selected && s.on]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={p.label}
        aria-checked={p.selected}
        aria-disabled={!!p.disabled}
        disabled={p.disabled}
        onPress={p.onPress}
        style={s.main}
      >
        <View style={[s.dot, p.selected && s.dotOn, p.disabled && s.dim]} />
        <View style={s.text}>
          <Text style={[type.body, p.disabled && s.dim]}>
            {p.label}
            {p.isDefault ? <Text style={s.pill}>  Default</Text> : null}
          </Text>
          {p.note ? <Text style={type.muted}>{p.note}</Text> : null}
        </View>
      </Pressable>
      {p.right}
    </View>
  );
}

/** A small outlined button, for actions inside a row. */
export function SmallButton({ label, a11y, onPress }: { label: string; a11y?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} onPress={onPress} style={s.btn} hitSlop={6}>
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.card },
  on: { borderColor: colors.accent },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md },
  text: { flex: 1, gap: 2 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.muted },
  dotOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  dim: { opacity: 0.5 },
  pill: { color: colors.accentText, fontSize: 12 },
  btn: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: space.md, minWidth: 56, alignItems: "center" },
  btnText: { color: colors.text, fontSize: 14 },
});
