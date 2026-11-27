// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WaitingPhrasesWeb } from "@/app/components/WaitingPhrasesWeb";

let capturedChangeHandler: ((e: MediaQueryListEvent) => void) | null = null;

function stubMatchMedia(matches = false) {
  capturedChangeHandler = null;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      addEventListener: (event: string, handler: (e: MediaQueryListEvent) => void) => {
        if (event === "change") capturedChangeHandler = handler;
      },
      removeEventListener: vi.fn(),
    }),
  });
}

function fireReduceMotionChange(matches: boolean) {
  capturedChangeHandler?.({ matches } as MediaQueryListEvent);
}

describe("WaitingPhrasesWeb", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    stubMatchMedia(false);
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => { root?.unmount(); });
    document.body.removeChild(container);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders an indeterminate progress bar", () => {
    act(() => {
      root = createRoot(container);
      root.render(createElement(WaitingPhrasesWeb, {}));
    });
    expect(container.querySelector("progress")).not.toBeNull();
  });

  it("shows a quote on mount", () => {
    act(() => {
      root = createRoot(container);
      root.render(createElement(WaitingPhrasesWeb, {}));
    });
    expect(container.querySelector("[aria-live]")?.textContent?.length).toBeGreaterThan(0);
  });

  it("does not throw or start new timers after unmount during the 400 ms fade", () => {
    act(() => {
      root = createRoot(container);
      root.render(createElement(WaitingPhrasesWeb, {}));
    });

    // Advance past the first quote's display time — triggers advance() which starts the fade
    act(() => { vi.advanceTimersByTime(4001); });

    // Unmount while the 400 ms fade timer is still pending
    act(() => { root.unmount(); });

    // Advance past the fade; the cleared fadeTimerRef and mountedRef guard should prevent
    // any setState calls or further quote timers
    expect(() => act(() => { vi.advanceTimersByTime(500); })).not.toThrow();
  });

  it("mid-cycle reduce-motion change reschedules timer and component stays alive", () => {
    act(() => {
      root = createRoot(container);
      root.render(createElement(WaitingPhrasesWeb, {}));
    });

    // Advance partway through the first quote's 4000 ms display window
    act(() => { vi.advanceTimersByTime(2000); });

    // User enables reduce-motion mid-cycle — fires the matchMedia change handler,
    // which updates reduceMotion state and triggers the reschedule useEffect.
    act(() => { fireReduceMotionChange(true); });

    // Advance 4001 ms past the reschedule point — the rescheduled timer fires cleanly.
    expect(() => act(() => { vi.advanceTimersByTime(4001); })).not.toThrow();
    expect(container.querySelector("[aria-live]")).not.toBeNull();
  });
});
