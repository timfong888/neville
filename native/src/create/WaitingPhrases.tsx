import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, View } from "react-native";
import { emptyPhraseState, nextPhrase, waitLine, type PhraseState } from "@/lib/waitingPhrases";
import { colors as C, space, type } from "../theme";

/**
 * Indeterminate progress indicator with a Neville-voice phrase that fades in and out.
 * Phrases cycle every 3 s (4 s with reduced motion). After 45 s the phrase is replaced
 * by a patience note. Respects AccessibilityInfo.isReduceMotionEnabled — no fade on that path.
 */
export function WaitingPhrases() {
  const stateRef = useRef<PhraseState>(emptyPhraseState());
  const opacity = useRef(new Animated.Value(1)).current;
  const startRef = useRef(Date.now());
  const [phrase, setPhrase] = useState("");
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  // Pick and show the first phrase immediately on mount.
  useEffect(() => {
    const { phrase: p, nextState } = nextPhrase(stateRef.current, Math.random);
    stateRef.current = nextState;
    setPhrase(p);
  }, []);

  useEffect(() => {
    const intervalMs = reduceMotion ? 4000 : 3000;

    const id = setInterval(() => {
      const patience = waitLine(Date.now() - startRef.current);
      if (patience) {
        setPhrase(patience);
        clearInterval(id);
        return;
      }

      if (reduceMotion) {
        const { phrase: p, nextState } = nextPhrase(stateRef.current, Math.random);
        stateRef.current = nextState;
        setPhrase(p);
      } else {
        Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
          const { phrase: p, nextState } = nextPhrase(stateRef.current, Math.random);
          stateRef.current = nextState;
          setPhrase(p);
          Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        });
      }
    }, intervalMs);

    return () => clearInterval(id);
  }, [reduceMotion, opacity]);

  return (
    <View style={{ gap: space.md, alignItems: "center", paddingVertical: space.lg }}>
      <ActivityIndicator color={C.accentText} />
      <Animated.Text
        style={[type.muted, { textAlign: "center", opacity: reduceMotion ? 1 : opacity }]}
        accessibilityLiveRegion="polite"
      >
        {phrase}
      </Animated.Text>
    </View>
  );
}
