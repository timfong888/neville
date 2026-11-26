import { describe, expect, it } from "vitest";
import type { AccountState } from "@/lib/api/client";
import { canCreate, freeNote, gateCard, isSignedIn, showResetDemo } from "@/lib/createGate";

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
  it("signed in: no card at all, so no sign-up link", () => {
    expect(gateCard(true)).toBeNull();
  });
});

describe("who may create (#164)", () => {
  it("signed out: two free creations on this device, then refused", () => {
    expect(canCreate(false, 0)).toBe(true);
    expect(canCreate(false, 1)).toBe(true);
    expect(canCreate(false, 2)).toBe(false);
    expect(canCreate(false, 9)).toBe(false);
  });
  it("signed in: the device count never refuses", () => {
    expect(canCreate(true, 0)).toBe(true);
    expect(canCreate(true, 2)).toBe(true);
    expect(canCreate(true, 50)).toBe(true);
  });
});

describe("the free-creations line (#164)", () => {
  it("signed out: the count, or that they are used", () => {
    expect(freeNote(false, 1)).toBe("1 free creation left without an account.");
    expect(freeNote(false, 2)).toBe("You have used your free creations. Create a free account to keep going.");
  });
  it("signed in: no line about free creations", () => {
    expect(freeNote(true, 5)).toBe("");
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
