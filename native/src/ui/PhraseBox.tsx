import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Platform, StyleSheet, View } from "react-native";
import { PHRASE_BOX_MIN_HEIGHT } from "@/lib/phraseBox";
import { colors, radius, space } from "../theme";

export { PHRASE_BOX_MIN_HEIGHT };

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

type Props = { phrase: string };

/**
 * Fixed-size box that shows the current phrase (or line) being spoken.
 * Height is constant (PHRASE_BOX_MIN_HEIGHT) regardless of phrase length.
 * Fades between phrases unless reduce-motion is on.
 */
export function PhraseBox({ phrase }: Props) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const prevPhrase = useRef(phrase);

  useEffect(() => {
    if (reducedMotion || phrase === prevPhrase.current) {
      prevPhrase.current = phrase;
      return;
    }
    prevPhrase.current = phrase;
    Animated.sequence([
      Animated.timing(opacity, { toValue: 0.1, duration: 100, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== "web" }),
    ]).start();
  }, [phrase, reducedMotion, opacity]);

  return (
    <View
      style={s.box}
      accessibilityRole="text"
      accessibilityLabel={`Now speaking: ${phrase}`}
      accessibilityLiveRegion="polite"
    >
      <Animated.Text style={[s.text, { opacity }]} numberOfLines={3} accessible={false}>
        {phrase}
      </Animated.Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    minHeight: PHRASE_BOX_MIN_HEIGHT,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.accentText,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    justifyContent: "center",
  },
  text: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "500",
  },
});
