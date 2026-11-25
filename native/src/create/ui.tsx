// Shared pieces of the Create screens. Colours and type come from src/theme.ts.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { colors as C, radius, space, type } from "../theme";

export function Button(p: { label: string; onPress: () => void; disabled?: boolean; small?: boolean }) {
  return (
    <Pressable accessibilityRole="button" disabled={p.disabled} onPress={p.onPress} style={[p.small ? s.chip : s.btn, p.disabled && s.off]}>
      <Text style={p.small ? s.chipText : s.btnText}>{p.label}</Text>
    </Pressable>
  );
}

/** Shown when the free creations are used up. No prices: purchases come in Phase 3. */
export function Gate() {
  return (
    <View style={s.card}>
      <Text style={s.h3}>Keep this, in a voice you choose</Text>
      <Text style={s.muted}>A free account saves your manifestations and plays them back to back, on any device.</Text>
      <Link href="/account" style={s.link}>Create a free account</Link>
    </View>
  );
}

export const s = StyleSheet.create({
  h1: type.h1,
  h3: type.h2,
  p: type.body,
  muted: type.muted,
  card: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: radius.md, padding: space.lg, gap: space.md },
  input: { color: C.text, fontSize: 16, borderColor: C.line, borderWidth: 1, borderRadius: radius.sm, padding: space.md, backgroundColor: C.bg },
  area: { minHeight: 96, textAlignVertical: "top" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  btn: { backgroundColor: C.accent, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 20, alignItems: "center" },
  btnText: { color: C.accentInk, fontSize: 16, fontWeight: "600" },
  chip: { borderColor: C.line, borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  chipText: { color: C.text, fontSize: 14 },
  off: { opacity: 0.45 },
  link: { color: C.accentText, fontSize: 16 },
  line: { color: C.muted, fontSize: 17, lineHeight: 26 },
  now: { color: C.text, fontWeight: "600" },
  stage: { minHeight: 150, justifyContent: "center", alignItems: "center" },
  spoken: { color: C.text, fontSize: 22, lineHeight: 30, textAlign: "center" },
});
