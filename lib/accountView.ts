// Who is signed in, as every screen sees it (#164). Pure: the native store wires it to the API and to React.
import type { AccountState } from "@/lib/api/client";

/** `checked` is true once a lookup has finished, or has waited too long; until then nothing is known. */
export type AccountView = { account: AccountState | null; checked: boolean };

export type AccountViewOptions = {
  /** How long the first lookup may take before Create stops waiting for it and uses the device count. */
  waitMs?: number;
  /** Tests inject their own. */
  setTimer?: (f: () => void, ms: number) => unknown;
};

export function createAccountView(lookup: () => Promise<AccountState>, opts: AccountViewOptions = {}) {
  const waitMs = opts.waitMs ?? 5000;
  const setTimer = opts.setTimer ?? ((f: () => void, ms: number) => setTimeout(f, ms));
  let view: AccountView = { account: null, checked: false };
  let latest = 0;
  const subs = new Set<() => void>();
  const put = (next: AccountView) => {
    view = next;
    subs.forEach((f) => f());
  };

  return {
    get: (): AccountView => view,
    subscribe: (f: () => void) => (subs.add(f), () => void subs.delete(f)),

    /**
     * Asks who is signed in. Only the latest ask writes, so a slow older answer cannot undo a newer one.
     * A failed ask keeps what was known, marks the lookup finished, and rejects so the caller can say why; a replaced ask resolves quietly.
     * A first ask that hangs is marked finished after `waitMs`; its answer still lands if it comes later.
     */
    async refresh(): Promise<AccountState | null> {
      const mine = ++latest;
      if (!view.checked) setTimer(() => void (!view.checked && put({ ...view, checked: true })), waitMs);
      try {
        const next = await lookup();
        if (mine === latest) put({ account: next, checked: true });
        return next;
      } catch (e) {
        // A replaced lookup reports nothing: a newer one is answering, and the view is its to set.
        if (mine !== latest) return view.account;
        put({ ...view, checked: true });
        throw e;
      }
    },

    /** After a sign-out or delete: signed out now, whatever the next lookup says, and no earlier lookup can undo it. */
    clearUser(): void {
      latest++;
      put({ account: { ...(view.account ?? { enabled: true }), user: null }, checked: true });
    },
  };
}
