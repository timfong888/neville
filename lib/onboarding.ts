// First-run walkthrough: what each step says and whether this device has seen
// it. Framework-free apart from the storage helpers, which take the storage
// object so tests can pass a stand-in.

export type OnboardingStep = { title: string; body: string };

/** Create, listen, save, playlist: the order the app is used in. */
export const STEPS: readonly OnboardingStep[] = [
  {
    title: "Say what you want",
    body: "Type one wish in your own words. Neville writes a short affirmation about it, in “you” statements, as if it is already yours.",
  },
  {
    title: "Listen",
    body: "It is recorded in the voice you chose in Settings. The words appear as they are spoken. Tap New variation for a fresh take on the same wish.",
  },
  {
    title: "Save it",
    body: "Tap Save to keep it in your Library. You can change its title and words there. Saved items stay on this device.",
  },
  {
    title: "Play them together",
    body: "Put saved manifestations in a playlist, or tap Play all, and they play one after another without you touching the screen.",
  },
];

export const ONBOARDED_KEY = "nv_onboarded_v1";

type KV = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const PROBE = "nv_probe";

/**
 * True when the walkthrough should open. Storage that cannot be read, or can
 * be read but not written (some private modes), counts as seen: we could not
 * remember the answer, so it would open on every visit.
 */
export function shouldShow(store: KV | null | undefined): boolean {
  try {
    if (!store || store.getItem(ONBOARDED_KEY) !== null) return false;
    store.setItem(PROBE, "1");
    store.removeItem(PROBE);
    return true;
  } catch {
    return false;
  }
}

/** Remembers that this device finished or skipped the walkthrough. */
export function markSeen(store: KV | null | undefined, how: "done" | "skipped", now = Date.now()): void {
  try {
    store?.setItem(ONBOARDED_KEY, JSON.stringify({ how, at: now }));
  } catch {
    /* private mode or blocked storage: it may show again next visit */
  }
}
