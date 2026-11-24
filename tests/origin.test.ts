import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/accounts", () => ({
  PRIMARY_ORIGIN: "https://getneville.vercel.app",
  LEGACY_ORIGINS: ["https://neville-delta.vercel.app"],
}));

const { sameSiteRequest } = await import("@/lib/server/origin");

const req = (method: string, origin?: string, url = "https://neville-git-x.vercel.app/api/account") =>
  new Request(url, { method, headers: origin ? { origin } : {} });

describe("sameSiteRequest", () => {
  it("lets reads through", () => {
    expect(sameSiteRequest(req("GET"))).toBe(true);
  });
  it("accepts this deployment, production and the old host", () => {
    expect(sameSiteRequest(req("DELETE", "https://neville-git-x.vercel.app"))).toBe(true);
    expect(sameSiteRequest(req("PUT", "https://getneville.vercel.app"))).toBe(true);
    expect(sameSiteRequest(req("PUT", "https://neville-delta.vercel.app"))).toBe(true);
  });
  it("accepts the native app's origin, still refuses lookalikes", () => {
    expect(sameSiteRequest(req("PUT", "neville://"))).toBe(true);
    expect(sameSiteRequest(req("PUT", "neville://evil"))).toBe(false);
    expect(sameSiteRequest(req("PUT", "https://neville.evil.example"))).toBe(false);
  });
  it("refuses another site and a missing Origin", () => {
    expect(sameSiteRequest(req("DELETE", "https://evil.example"))).toBe(false);
    expect(sameSiteRequest(req("DELETE"))).toBe(false);
    expect(sameSiteRequest(req("PUT", "null"))).toBe(false);
  });
});
