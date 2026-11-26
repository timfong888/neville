import { describe, expect, it } from "vitest";
import type { AccountState } from "@/lib/api/client";
import { gateCard, isSignedIn, showResetDemo } from "@/lib/createGate";

const user = { id: "u1", name: "Tim", email: "t@example.com", image: null };
const on = (u: AccountState["user"]): AccountState => ({ enabled: true, user: u });

describe("who is signed in (#164)", () => {
  it("is signed in only with accounts on and a user", () => {
    expect(isSignedIn(on(user))).toBe(true);
  });
  it("is signed out with no user, accounts off, or nothing known yet", () => {
    expect(isSignedIn(on(null))).toBe(false);
    expect(isSignedIn({ enabled: false, user })).toBe(false);
    expect(isSignedIn(null)).toBe(false);
  });
});

describe("the card shown when the free creations are used up (#164)", () => {
  it("signed out: the sign-up card with its link, as before", () => {
    expect(gateCard(false)).toEqual({
      title: "Keep this, in a voice you choose",
      body: "A free account saves your manifestations and plays them back to back, on any device.",
      link: { label: "Create a free account", href: "/account" },
    });
  });
  it("signed in: says it is saved, and has no link to sign up", () => {
    const card = gateCard(true);
    expect(card.title).toBe("Saved to your account");
    expect(card.link).toBeNull();
    expect(JSON.stringify(card)).not.toMatch(/free account/i);
  });
});

describe("Reset demo (#164)", () => {
  it("shows in development builds once something was used", () => {
    expect(showResetDemo(true, 1)).toBe(true);
  });
  it("is hidden in any other build", () => {
    expect(showResetDemo(false, 1)).toBe(false);
  });
  it("is hidden when nothing was used", () => {
    expect(showResetDemo(true, 0)).toBe(false);
  });
});
