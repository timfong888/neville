// Framework-free paywall helpers. No React Native imports.
import { ApiError, type CreditsResponse, type PackInfo } from "@/lib/api/client";

export type { CreditsResponse, PackInfo };

export type PaywallError =
  | { type: "sign_in" }
  | { type: "no_credits"; balance?: number }
  | { type: "timeout"; creditReturned?: boolean };

/**
 * Inspects a caught error and returns a PaywallError when it is a paywall signal.
 * Returns null when paywallOn is false, or for non-paywall errors.
 */
export function detectPaywallError(e: unknown, paywallOn: boolean): PaywallError | null {
  if (!paywallOn) return null;
  if (!(e instanceof ApiError)) return null;
  if (e.status === 401 && e.code === "sign_in_required") return { type: "sign_in" };
  if (e.status === 402 && e.code === "no_credits") {
    const balance = typeof e.data?.balance === "number" ? e.data.balance : undefined;
    return { type: "no_credits", balance };
  }
  if (e.status === 504 && e.code === "timeout") {
    const creditReturned = e.data?.creditReturned === true ? true : undefined;
    return { type: "timeout", creditReturned };
  }
  return null;
}

/** True when the paywall sheet should be shown to this user. Testers (unlimited) never see it. */
export function shouldShowPaywall(credits: CreditsResponse | null): boolean {
  if (!credits) return false;
  return credits.paywallEnabled && !credits.unlimited;
}

/** True for the pack the server designates as best value. */
export function isBestValue(pack: PackInfo): boolean {
  return pack.id === "pack10";
}
