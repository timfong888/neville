"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyQuoteState, nextQuote, waitLine, type Quote, type QuoteState } from "@/lib/waitingQuotes";

/**
 * Web waiting indicator: an indeterminate spinner and a Neville Goddard quote that fades
 * in and out. Each quote is shown for its own duration (4 s default, 6 s for long ones).
 * After 45 s a patience note replaces the cycle. Respects prefers-reduced-motion.
 */
export function WaitingPhrasesWeb() {
  const stateRef = useRef<QuoteState>(emptyQuoteState());
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentQuote, setCurrentQuote] = useState<Quote | null>(null);
  const [visible, setVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    reduceMotionRef.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      setReduceMotion(e.matches);
      reduceMotionRef.current = e.matches;
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const advance = useCallback(() => {
    const patience = waitLine(Date.now() - startRef.current);
    const rm = reduceMotionRef.current;

    const show = (q: Quote) => {
      setCurrentQuote(q);
      setVisible(true);
      if (q.durationMs > 0) {
        timerRef.current = setTimeout(advance, q.durationMs);
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
      setVisible(false);
      setTimeout(() => show(q), 400);
    }
  }, []);

  // Pick and show the first quote immediately on mount, then start the cycle.
  useEffect(() => {
    const { quote: q, nextState } = nextQuote(stateRef.current, Math.random);
    stateRef.current = nextState;
    setCurrentQuote(q);
    timerRef.current = setTimeout(advance, q.durationMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [advance]);

  if (!currentQuote) return null;

  return (
    <div
      style={{
        transition: reduceMotion ? undefined : "opacity 0.4s ease-in-out",
        opacity: visible ? 1 : 0,
        textAlign: "center",
        marginTop: "1rem",
      }}
      aria-live="polite"
    >
      <p className="lede" style={{ margin: 0 }}>{currentQuote.text}</p>
      {currentQuote.source && (
        <p className="small muted" style={{ margin: "4px 0 0", fontStyle: "italic" }}>
          Neville Goddard
        </p>
      )}
    </div>
  );
}
