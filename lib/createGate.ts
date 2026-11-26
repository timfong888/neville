// What the Create screen shows about accounts (#164). Pure rules; the screens only draw them.
import type { AccountState } from "@/lib/api/client";
import { freeBanner, freeLeft } from "@/lib/create";

/** Signed in means accounts are on and the server named a user. Unknown (not yet asked) counts as signed out. */
export const isSignedIn = (account: AccountState | null): boolean => !!account?.enabled && !!account.user;

export type GateCard = { title: string; body: string; link: { label: string; href: "/account" } };

/** The card under a refused tap. Only a signed-out user is ever refused, so a signed-in user gets none. */
export const gateCard = (signedIn: boolean): GateCard | null =>
  signedIn
    ? null
    : {
        title: "Keep this, in a voice you choose",
        body: "A free account saves your manifestations and plays them back to back, on any device.",
        link: { label: "Create a free account", href: "/account" },
      };

/**
 * Whether one more creation may start. The free count is for this device without an account;
 * a signed-in user is not held to it. The server still limits by visitor and by total spend.
 */
export const canCreate = (signedIn: boolean, used: number): boolean => signedIn || freeLeft(used) > 0;

export type Access = "checking" | "allowed" | "blocked";

/**
 * Whether Create may start. `checked` is true once an account lookup has finished, answered or failed.
 * Until then, with nothing known, Create waits rather than guess signed out. A failed lookup falls back
 * to the device count, so Create is never stuck waiting.
 */
export const createAccess = (account: AccountState | null, checked: boolean, used: number): Access =>
  !account && !checked ? "checking" : canCreate(isSignedIn(account), used) ? "allowed" : "blocked";

/** The line under the wish about free creations. Empty when signed in; says what lifts the limit when used up. */
export const freeNote = (signedIn: boolean, used: number): string =>
  signedIn ? "" : freeLeft(used) > 0 ? freeBanner(used) : `${freeBanner(used)} Create a free account to keep going.`;

/** "Reset demo" is a test aid: development builds only, and only once something was used. */
export const showResetDemo = (isDev: boolean, used: number): boolean => isDev && used > 0;
