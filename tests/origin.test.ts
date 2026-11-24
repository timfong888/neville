import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("matches the origin exactly: case, default port, trailing dot and path variants are refused", () => {
    for (const o of [
      "https://GETNEVILLE.vercel.app",
      "https://getneville.vercel.app:443",
      "https://getneville.vercel.app.",
      "https://getneville.vercel.app/",
      "http://getneville.vercel.app",
      "https://getneville.vercel.app:8443",
    ]) {
      expect(sameSiteRequest(req("PUT", o)), o).toBe(false);
    }
  });

  describe("BETTER_AUTH_URL", () => {
    const saved = process.env.BETTER_AUTH_URL;
    afterEach(() => {
      if (saved === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = saved;
    });
    it("adds the origin of the configured URL, not its path", () => {
      process.env.BETTER_AUTH_URL = "https://custom.example/some/path";
      expect(sameSiteRequest(req("PUT", "https://custom.example"))).toBe(true);
      expect(sameSiteRequest(req("PUT", "https://custom.example/some/path"))).toBe(false);
    });
    it("ignores a value that is not a URL, and a blank one", () => {
      process.env.BETTER_AUTH_URL = "not a url";
      expect(sameSiteRequest(req("PUT", "https://evil.example"))).toBe(false);
      process.env.BETTER_AUTH_URL = "   ";
      expect(sameSiteRequest(req("PUT", "https://getneville.vercel.app"))).toBe(true);
    });
  });
});
