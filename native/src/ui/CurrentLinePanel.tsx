import { StyleSheet, Text, View } from "react-native";
import { colors, radius, space } from "../theme";

type Props = { line: string };

/** Enlarged panel showing the script line currently being spoken. */
export function CurrentLinePanel({ line }: Props) {
  return (
    <View style={s.card} accessibilityLiveRegion="polite" accessibilityLabel={`Now speaking: ${line}`}>
      <Text style={s.line} adjustsFontSizeToFit numberOfLines={3}>{line}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { padding: space.lg, borderWidth: 1, borderColor: colors.accentText, borderRadius: radius.md, backgroundColor: colors.card },
  line: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: "500" },
});
