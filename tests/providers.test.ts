import { describe, expect, it } from "vitest";
import { googleConfigured, missingAccountVars, providersFor } from "@/lib/server/providers";

const base = { ACCOUNTS_ENABLED: "true", DATABASE_URL: "postgres://x", BLOB_READ_WRITE_TOKEN: "t", BETTER_AUTH_SECRET: "s" };
const google = { GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret" };

describe("sign-in providers", () => {
  it("google needs both of its variables", () => {
    expect(googleConfigured(google)).toBe(true);
    expect(googleConfigured({ GOOGLE_CLIENT_ID: "gid" })).toBe(false);
    expect(googleConfigured({ GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "  " })).toBe(false);
    expect(googleConfigured({})).toBe(false);
  });
  it("lists only what is configured", () => {
    expect(providersFor({}, false)).toEqual([]);
    expect(providersFor({}, true)).toEqual(["apple"]);
    expect(providersFor(google, false)).toEqual(["google"]);
    expect(providersFor(google, true)).toEqual(["google", "apple"]);
  });
});

describe("what accounts still need", () => {
  it("turns on with Apple alone, no Google variables (plan B)", () => {
    expect(missingAccountVars(base, true)).toEqual([]);
  });
  it("still turns on with Google alone, and with both", () => {
    expect(missingAccountVars({ ...base, ...google }, false)).toEqual([]);
    expect(missingAccountVars({ ...base, ...google }, true)).toEqual([]);
  });
  it("stays off with no provider at all, and says so", () => {
    const m = missingAccountVars(base, false);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/sign-in provider/);
  });
  it("stays off without the switch, the database, the store or the auth secret", () => {
    expect(missingAccountVars({ ...base, ACCOUNTS_ENABLED: "no" }, true)).toEqual(["ACCOUNTS_ENABLED=true"]);
    expect(missingAccountVars({ ...base, DATABASE_URL: "" }, true)).toEqual(["DATABASE_URL"]);
    expect(missingAccountVars({ ...base, BLOB_READ_WRITE_TOKEN: undefined }, true)).toEqual(["BLOB_READ_WRITE_TOKEN"]);
    expect(missingAccountVars({ ...base, BETTER_AUTH_SECRET: " " }, true)).toEqual(["BETTER_AUTH_SECRET"]);
  });
  it("reports names only, never a value", () => {
    const out = JSON.stringify(missingAccountVars({ GOOGLE_CLIENT_ID: "gid-VALUE", GOOGLE_CLIENT_SECRET: "gsecret-VALUE", DATABASE_URL: "postgres://user:pw@h" }, false));
    expect(out).not.toMatch(/VALUE|pw@/);
  });
});
