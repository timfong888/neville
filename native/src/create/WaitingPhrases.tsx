import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, Text, View } from "react-native";
import { emptyQuoteState, nextQuote, waitLine, type Quote, type QuoteState } from "@/lib/waitingQuotes";
import { colors as C, space, type } from "../theme";

const REDUCED_MOTION_MS = 4000;

/**
 * Indeterminate progress indicator with a Neville Goddard quote that fades in and out.
 * Each quote is shown for its own duration (4 s or 6 s for longer quotes). After 45 s a
 * patience note replaces the cycle. Respects AccessibilityInfo.isReduceMotionEnabled —
 * no fade on that path; duration is still honoured for readability.
 */
export function WaitingPhrases() {
  const stateRef = useRef<QuoteState>(emptyQuoteState());
  const opacity = useRef(new Animated.Value(1)).current;
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  // Conservative default: cap at REDUCED_MOTION_MS until the async isReduceMotionEnabled() resolves.
  const reduceMotionRef = useRef(true);
  const currentQuoteRef = useRef<Quote | null>(null);
  const [currentQuote, setCurrentQuote] = useState<Quote | null>(null);
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
    if (reduceMotion) opacity.setValue(1);
  }, [reduceMotion, opacity]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { setReduceMotion(v); reduceMotionRef.current = v; })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => {
      setReduceMotion(v);
      reduceMotionRef.current = v;
    });
    return () => sub.remove();
  }, []);

  const advance = useCallback(() => {
    const patience = waitLine(Date.now() - startRef.current);
    const rm = reduceMotionRef.current;

    const show = (q: Quote) => {
      if (!mountedRef.current) return;
      setCurrentQuote(q);
      currentQuoteRef.current = q;
      if (q.durationMs > 0) {
        // Reduced-motion: fixed 4 s for every quote regardless of length.
        timerRef.current = setTimeout(advance, rm ? REDUCED_MOTION_MS : q.durationMs);
      }
    };

    if (patience) {
      show({ text: patience, source: "", durationMs: 0 });
      return;
    }

    const { quote: q, nextState } = nextQuote(stateRef.current, Math.random);
    stateRef.current = nextState;

    if (rm) {
      show(q);
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        show(q);
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      });
    }
  }, [opacity]);

  // When reduce-motion preference changes mid-cycle, reschedule the pending timer.
  useEffect(() => {
    const q = currentQuoteRef.current;
    if (!q || q.durationMs === 0 || timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(advance, reduceMotion ? REDUCED_MOTION_MS : q.durationMs);
  }, [reduceMotion, advance]);

  // Pick and show the first quote immediately on mount, then start the cycle.
  useEffect(() => {
    const { quote: q, nextState } = nextQuote(stateRef.current, Math.random);
    stateRef.current = nextState;
    setCurrentQuote(q);
    currentQuoteRef.current = q;
    timerRef.current = setTimeout(advance, reduceMotionRef.current ? REDUCED_MOTION_MS : q.durationMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [advance]);

  if (!currentQuote) return null;

  return (
    <View style={{ gap: space.md, alignItems: "center", paddingVertical: space.lg }}>
      <ActivityIndicator color={C.accentText} />
      <Animated.View style={{ gap: space.xs, alignItems: "center", opacity }}>
        <Text
          style={[type.muted, { textAlign: "center" }]}
          accessibilityLiveRegion="polite"
        >
          {currentQuote.text}
        </Text>
        {currentQuote.source ? (
          <Text style={[type.muted, { fontSize: 11, opacity: 0.65 }]}>
            Neville Goddard
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
}
