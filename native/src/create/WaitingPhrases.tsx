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
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
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
        // Read ref fresh — rm may be stale if reduce-motion changed during the fade.
        timerRef.current = setTimeout(advance, reduceMotionRef.current ? REDUCED_MOTION_MS : q.durationMs);
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
      const anim = Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true });
      animRef.current = anim;
      anim.start(({ finished }) => {
        if (animRef.current === anim) animRef.current = null;
        if (!finished || !mountedRef.current) return;
        show(q);
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
      });
    }
  }, [opacity]);

  // When reduce-motion preference changes mid-cycle, stop any in-flight animation and reschedule.
  useEffect(() => {
    const q = currentQuoteRef.current;
    if (!q || q.durationMs === 0) return;
    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
      opacity.setValue(1);
    }
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(advance, reduceMotion ? REDUCED_MOTION_MS : q.durationMs);
  }, [reduceMotion, advance, opacity]);

  // Pick and show the first quote immediately on mount, then start the cycle.
  useEffect(() => {
    const { quote: q, nextState } = nextQuote(stateRef.current, Math.random);
    stateRef.current = nextState;
    setCurrentQuote(q);
    currentQuoteRef.current = q;
    timerRef.current = setTimeout(advance, reduceMotionRef.current ? REDUCED_MOTION_MS : q.durationMs);
    return () => {
      if (animRef.current) { animRef.current.stop(); animRef.current = null; }
      if (timerRef.current) clearTimeout(timerRef.current);
    };
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
