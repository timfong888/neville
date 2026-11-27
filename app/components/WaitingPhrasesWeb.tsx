"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyQuoteState, nextQuote, waitLine, type Quote, type QuoteState } from "@/lib/waitingQuotes";

const REDUCED_MOTION_MS = 4000;

/**
 * Web waiting indicator: an indeterminate progress bar and a Neville Goddard quote that
 * fades in and out. Each quote is shown for its own duration (4 s default, 6 s for long
 * ones) — except in reduced-motion mode, where every quote shows for a fixed 4 s.
 * After 45 s a patience note replaces the cycle. Respects prefers-reduced-motion.
 */
export function WaitingPhrasesWeb() {
  const stateRef = useRef<QuoteState>(emptyQuoteState());
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const reduceMotionRef = useRef(false);
  const currentQuoteRef = useRef<Quote | null>(null);
  const [currentQuote, setCurrentQuote] = useState<Quote | null>(null);
  const [visible, setVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => () => { mountedRef.current = false; }, []);

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
      if (!mountedRef.current) return;
      setCurrentQuote(q);
      currentQuoteRef.current = q;
      setVisible(true);
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
      setVisible(false);
      fadeTimerRef.current = setTimeout(() => show(q), 400);
    }
  }, []);

  // When reduce-motion preference changes mid-cycle, reschedule the pending timer.
  useEffect(() => {
    const q = currentQuoteRef.current;
    if (!q || q.durationMs === 0) return;
    if (timerRef.current === null && fadeTimerRef.current === null) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    timerRef.current = setTimeout(advance, reduceMotion ? REDUCED_MOTION_MS : q.durationMs);
  }, [reduceMotion, advance]);

  // Pick and show the first quote immediately on mount, then start the cycle.
  useEffect(() => {
    const { quote: q, nextState } = nextQuote(stateRef.current, Math.random);
    stateRef.current = nextState;
    setCurrentQuote(q);
    currentQuoteRef.current = q;
    timerRef.current = setTimeout(advance, reduceMotionRef.current ? REDUCED_MOTION_MS : q.durationMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [advance]);

  if (!currentQuote) return null;

  return (
    <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
      <progress
        aria-label="Loading"
        style={{ width: "100%", maxWidth: "180px", accentColor: "var(--accent, #6c9bff)" }}
      />
      <div
        aria-live="polite"
        style={{
          marginTop: "0.75rem",
          transition: reduceMotion ? undefined : "opacity 0.4s ease-in-out",
          opacity: visible ? 1 : 0,
        }}
      >
        <p className="lede" style={{ margin: 0 }}>{currentQuote.text}</p>
        {currentQuote.source && (
          <p className="small muted" style={{ margin: "4px 0 0", fontStyle: "italic" }}>
            Neville Goddard
          </p>
        )}
      </div>
    </div>
  );
}
