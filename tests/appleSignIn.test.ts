import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { appleAudience, appleNonceProblem, appleUserFromFullName, makeNoncePair, nonceFromBytes } from "@/lib/appleSignIn";

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

describe("appleNonceProblem", () => {
  const nonce = "a".repeat(64);
  const apple = (idToken: unknown) => ({ provider: "apple", idToken });
  it("refuses an Apple ID-token sign-in with no nonce, an empty one, a short one or a non-string", () => {
    for (const idToken of [{ token: "t" }, { token: "t", nonce: "" }, { token: "t", nonce: "abc" }, { token: "t", nonce: 12 }]) {
      expect(appleNonceProblem("/sign-in/social", apple(idToken))).not.toBeNull();
    }
  });
  it("accepts one with a full-length nonce", () => {
    expect(appleNonceProblem("/sign-in/social", apple({ token: "t", nonce }))).toBeNull();
  });
  it("leaves the web redirect flow, other providers and other paths alone", () => {
    expect(appleNonceProblem("/sign-in/social", { provider: "apple" })).toBeNull();
    expect(appleNonceProblem("/sign-in/social", { provider: "google", idToken: { token: "t" } })).toBeNull();
    expect(appleNonceProblem("/sign-out", apple({ token: "t" }))).toBeNull();
    expect(appleNonceProblem(undefined, null)).toBeNull();
  });
  it("accepts the nonce the app actually makes", async () => {
    const { raw } = await makeNoncePair(new Uint8Array(32).fill(1), sha);
    expect(appleNonceProblem("/sign-in/social", apple({ token: "t", nonce: raw }))).toBeNull();
  });
});

describe("appleAudience", () => {
  it("is the Services ID alone when no bundle id is set, so the app's token is refused", () => {
    expect(appleAudience("com.example.web", undefined)).toEqual(["com.example.web"]);
    expect(appleAudience("com.example.web", "")).toEqual(["com.example.web"]);
    expect(appleAudience("com.example.web", "  \n")).toEqual(["com.example.web"]);
  });
  it("adds the trimmed bundle id when set, keeping the Services ID", () => {
    expect(appleAudience("com.example.web", "pckg.neville\n")).toEqual(["com.example.web", "pckg.neville"]);
  });
});

describe("Apple code before account deletion (#125 review P1)", () => {
  const fail = (code?: string) => async () => {
    throw Object.assign(new Error("sheet failed"), code ? { code } : {});
  };
  it("stops when the person cancels the sheet", async () => {
    const { deletionCodeFromSheet } = await import("@/lib/appleSignIn");
    expect(await deletionCodeFromSheet(fail("ERR_REQUEST_CANCELED"))).toEqual({ proceed: false });
  });
  it("stops on any other sheet error: no deletion without a way to revoke", async () => {
    const { deletionCodeFromSheet } = await import("@/lib/appleSignIn");
    expect(await deletionCodeFromSheet(fail("ERR_REQUEST_FAILED"))).toEqual({ proceed: false });
    expect(await deletionCodeFromSheet(fail())).toEqual({ proceed: false });
  });
  it("stops when Apple returns no authorization code", async () => {
    const { deletionCodeFromSheet } = await import("@/lib/appleSignIn");
    expect(await deletionCodeFromSheet(async () => ({ authorizationCode: null }))).toEqual({ proceed: false });
    expect(await deletionCodeFromSheet(async () => ({}))).toEqual({ proceed: false });
    expect(await deletionCodeFromSheet(async () => ({ authorizationCode: "" }))).toEqual({ proceed: false });
  });
  it("goes ahead with the code on success, and with none where there is no sheet", async () => {
    const { deletionCodeFromSheet } = await import("@/lib/appleSignIn");
    expect(await deletionCodeFromSheet(async () => ({ authorizationCode: "c.1" }))).toEqual({ proceed: true, code: "c.1" });
    expect(await deletionCodeFromSheet(null)).toEqual({ proceed: true, code: null });
  });
});
