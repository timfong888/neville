"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { STEPS, markSeen, shouldShow } from "@/lib/onboarding";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The first-run walkthrough (issue #14). Opens once per device; Skip and
 * Start both close it and are remembered. Afterwards a small "How it works"
 * button reopens it.
 */
export default function Onboarding() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [i, setI] = useState(0);
  const dialog = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpen(shouldShow(storage()));
    setReady(true);
  }, []);

  const close = useCallback((how: "done" | "skipped") => {
    markSeen(storage(), how);
    setOpen(false);
    setI(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Everything behind the dialog is inert while it is open, so Tab and
    // Shift+Tab stay inside it and the form underneath cannot be used.
    const host = dialog.current?.closest(".onb-backdrop");
    const others = [...document.body.children].filter((el) => el !== host && !el.hasAttribute("inert"));
    others.forEach((el) => el.setAttribute("inert", ""));
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close("skipped");
      if (e.key === "ArrowRight") setI((n) => Math.min(STEPS.length - 1, n + 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      others.forEach((el) => el.removeAttribute("inert"));
    };
  }, [open, close]);

  if (!ready) return null;
  if (!open) {
    return (
      <button type="button" className="chip howto" onClick={() => setOpen(true)}>
        How it works
      </button>
    );
  }

  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  return createPortal(
    <div className="onb-backdrop">
      <div
        className="onb card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onb-title"
        tabIndex={-1}
        ref={dialog}
      >
        <p className="small muted onb-count">
          Step {i + 1} of {STEPS.length}
        </p>
        <h2 id="onb-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="onb-dots" aria-hidden="true">
          {STEPS.map((s, n) => (
            <span key={s.title} className={n === i ? "on" : ""} />
          ))}
        </div>
        <div className="onb-actions">
          <button type="button" className="btn sm ghost" onClick={() => close("skipped")}>
            Skip
          </button>
          {i > 0 && (
            <button type="button" className="btn sm" onClick={() => setI(i - 1)}>
              Back
            </button>
          )}
          <button
            type="button"
            className="btn sm primary"
            onClick={() => (last ? close("done") : setI(i + 1))}
          >
            {last ? "Start" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
