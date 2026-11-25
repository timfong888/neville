// Browser-only: the wish and first name being typed on the create page (#100).
// Settings is a separate page, so without this the form starts empty on return.

export const DRAFT_STORAGE_KEY = "nv_draft";
export const MAX_WANT = 280;
export const MAX_NAME = 40;

export type Draft = { want: string; name: string };

const EMPTY: Draft = { want: "", name: "" };

/** The draft as stored, cut to the limits; anything unreadable is empty. Shared with the native app. */
export function parseDraft(raw: string | null): Draft {
  try {
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<Draft>;
    return {
      want: typeof v.want === "string" ? v.want.slice(0, MAX_WANT) : "",
      name: typeof v.name === "string" ? v.name.slice(0, MAX_NAME) : "",
    };
  } catch {
    return EMPTY;
  }
}

export function readDraft(): Draft {
  try {
    return parseDraft(window.localStorage.getItem(DRAFT_STORAGE_KEY));
  } catch {
    return EMPTY;
  }
}

/** Saves what the listener typed; clearing both fields removes the draft. */
export function writeDraft(d: Draft): void {
  try {
    if (!d.want && !d.name) window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    else
      window.localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({ want: d.want.slice(0, MAX_WANT), name: d.name.slice(0, MAX_NAME) }),
      );
  } catch {
    // Private mode or storage full: the form still works, it just isn't kept.
  }
}

/** Removes the draft, e.g. when the listener deletes everything on this device. */
export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* nothing stored */
  }
}

/** Whether a typed wish or name is kept on this device. */
export const hasDraft = (): boolean => {
  const d = readDraft();
  return !!(d.want || d.name);
};

/**
 * What the form starts with: a shared link (?w=&n=) wins for display but is not
 * saved, so it never replaces the listener's own draft; otherwise the saved draft.
 */
export function startingDraft(search: string): Draft & { shared: boolean } {
  const p = new URLSearchParams(search);
  const w = p.get("w");
  if (w) return { want: w.slice(0, MAX_WANT), name: (p.get("n") ?? "").slice(0, MAX_NAME), shared: true };
  return { ...readDraft(), shared: false };
}
