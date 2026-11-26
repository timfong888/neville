// What the Create screen shows about accounts (#164). Pure rules; the screens only draw them.
import type { AccountState } from "@/lib/api/client";

/** Signed in means accounts are on and the server named a user. Unknown (not yet asked) counts as signed out. */
export const isSignedIn = (account: AccountState | null): boolean => !!account?.enabled && !!account.user;

export type GateCard = { title: string; body: string; link: { label: string; href: "/account" } | null };

/** The card under a refused tap. A signed-in user is never asked to sign up. */
export const gateCard = (signedIn: boolean): GateCard =>
  signedIn
    ? { title: "Saved to your account", body: "Your manifestations are kept in your account and play back to back, on any device.", link: null }
    : {
        title: "Keep this, in a voice you choose",
        body: "A free account saves your manifestations and plays them back to back, on any device.",
        link: { label: "Create a free account", href: "/account" },
      };

/** "Reset demo" is a test aid: development builds only, and only once something was used. */
export const showResetDemo = (isDev: boolean, used: number): boolean => isDev && used > 0;
