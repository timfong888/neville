import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { appleUserFromFullName, makeNoncePair, nonceFromBytes } from "@/lib/appleSignIn";

const sha = async (s: string) => createHash("sha256").update(s).digest("hex");

describe("apple nonce", () => {
  it("is hex of the bytes, and refuses a short one", () => {
    expect(nonceFromBytes(new Uint8Array(16).fill(255))).toBe("ff".repeat(16));
    expect(nonceFromBytes(Uint8Array.from({ length: 16 }, (_, i) => i))).toBe("000102030405060708090a0b0c0d0e0f");
    expect(() => nonceFromBytes(new Uint8Array(8))).toThrow();
  });
  it("gives Apple the hash and Better Auth the raw value", async () => {
    const { raw, hashed } = await makeNoncePair(new Uint8Array(32).fill(7), sha);
    expect(raw).toHaveLength(64);
    expect(hashed).toBe(createHash("sha256").update(raw).digest("hex"));
    expect(hashed).not.toBe(raw);
  });
  it("differs per sign-in", async () => {
    const a = await makeNoncePair(Uint8Array.from({ length: 32 }, (_, i) => i), sha);
    const b = await makeNoncePair(Uint8Array.from({ length: 32 }, (_, i) => i + 1), sha);
    expect(a.raw).not.toBe(b.raw);
  });
});

describe("apple name", () => {
  it("passes first and last name", () => {
    expect(appleUserFromFullName({ givenName: " Ada ", familyName: "Lovelace" })).toEqual({ name: { firstName: "Ada", lastName: "Lovelace" } });
  });
  it("keeps only the part Apple sent", () => {
    expect(appleUserFromFullName({ givenName: "Ada", familyName: null })).toEqual({ name: { firstName: "Ada" } });
  });
  it("sends nothing on later sign-ins, when Apple returns no name", () => {
    expect(appleUserFromFullName(null)).toBeUndefined();
    expect(appleUserFromFullName({ givenName: "", familyName: "  " })).toBeUndefined();
  });
});
