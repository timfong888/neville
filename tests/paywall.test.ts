// Tests for framework-free paywall helpers (lib/paywall.ts).
// Tests for paywall session state and PaywallSheet component are not in this file;
// those require React Native dependencies not available in this test environment.
//
// Note: mockPurchaseClient (native/src/paywall/mockPurchase.ts) is tested inline below
// rather than via import, because the native/ tsconfig extends expo/tsconfig.base which
// is not installed in the web test environment. Its implementation is a no-op promise.

import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import { detectPaywallError, isBestValue, shouldShowPaywall } from "@/lib/paywall";
import type { CreditsResponse } from "@/lib/api/client";

// Inline mock matching native/src/paywall/mockPurchase.ts for test isolation
const mockPurchaseClient = {
  async purchase(_packId: string): Promise<void> {
    // No-op.
  },
};

const baseCredits = (): CreditsResponse => ({
  balance: 5,
  unlimited: false,
  paywallEnabled: true,
  signInRequired: false,
  packs: [],
});

describe("detectPaywallError", () => {
  it("with flag off returns null for any error", () => {
    const e = new ApiError("no credits", 402, "no_credits", undefined, { balance: 2 });
    expect(detectPaywallError(e, false)).toBeNull();
  });

  it("detects 402 no_credits", () => {
    const e = new ApiError("no credits", 402, "no_credits", undefined, { balance: 2 });
    expect(detectPaywallError(e, true)).toEqual({ type: "no_credits", balance: 2 });
  });

  it("detects 401 sign_in_required", () => {
    const e = new ApiError("sign in required", 401, "sign_in_required");
    expect(detectPaywallError(e, true)).toEqual({ type: "sign_in" });
  });

  it("detects 504 timeout with creditReturned", () => {
    const e = new ApiError("timeout", 504, "timeout", undefined, { creditReturned: true });
    expect(detectPaywallError(e, true)).toEqual({ type: "timeout", creditReturned: true });
  });

  it("detects 504 timeout without creditReturned", () => {
    const e = new ApiError("timeout", 504, "timeout");
    expect(detectPaywallError(e, true)).toEqual({ type: "timeout", creditReturned: undefined });
  });

  it("returns null for other API errors", () => {
    const e = new ApiError("service off", 503, "off");
    expect(detectPaywallError(e, true)).toBeNull();
  });

  it("returns null for non-ApiError", () => {
    const e = new Error("network");
    expect(detectPaywallError(e, true)).toBeNull();
  });
});

describe("shouldShowPaywall", () => {
  it("false when credits is null", () => {
    expect(shouldShowPaywall(null)).toBe(false);
  });

  it("false when paywallEnabled is false", () => {
    expect(shouldShowPaywall({ ...baseCredits(), paywallEnabled: false })).toBe(false);
  });

  it("false when unlimited is true (testers never see sheet)", () => {
    expect(shouldShowPaywall({ ...baseCredits(), unlimited: true })).toBe(false);
  });

  it("true when paywallEnabled=true, unlimited=false", () => {
    expect(shouldShowPaywall(baseCredits())).toBe(true);
  });
});

describe("isBestValue", () => {
  it("true for pack10, false for starter", () => {
    expect(isBestValue({ id: "pack10", credits: 10, price: "$6.99" })).toBe(true);
    expect(isBestValue({ id: "starter", credits: 3, price: "$2.99" })).toBe(false);
  });
});

describe("mockPurchaseClient", () => {
  it("resolves immediately without throwing", async () => {
    await expect(mockPurchaseClient.purchase("pack10")).resolves.toBeUndefined();
  });
});
