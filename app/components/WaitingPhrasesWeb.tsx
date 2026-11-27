"use client";
import { useEffect, useRef, useState } from "react";
import { emptyPhraseState, nextPhrase, waitLine, type PhraseState } from "@/lib/waitingPhrases";

/**
 * Web waiting indicator: an indeterminate spinner and a Neville-voice phrase that
 * fades in and out every 3 s (4 s with prefers-reduced-motion). After 45 s the phrase
 * gives way to a patience note.
 */
export function WaitingPhrasesWeb() {
  const stateRef = useRef<PhraseState>(emptyPhraseState());
  const startRef = useRef(Date.now());
  const [phrase, setPhrase] = useState("");
  const [visible, setVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Pick the first phrase immediately.
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
        setVisible(true);
        clearInterval(id);
        return;
      }

      if (reduceMotion) {
        const { phrase: p, nextState } = nextPhrase(stateRef.current, Math.random);
        stateRef.current = nextState;
        setPhrase(p);
      } else {
        setVisible(false);
        setTimeout(() => {
          const { phrase: p, nextState } = nextPhrase(stateRef.current, Math.random);
          stateRef.current = nextState;
          setPhrase(p);
          setVisible(true);
        }, 400);
      }
    }, intervalMs);

    return () => clearInterval(id);
  }, [reduceMotion]);

  return (
    <p
      className="lede"
      aria-live="polite"
      style={{
        transition: reduceMotion ? undefined : "opacity 0.4s ease-in-out",
        opacity: visible ? 1 : 0,
      }}
    >
      {phrase}
    </p>
  );
}
