// POST /api/admin/login and the admin cookie, without a server.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let POST: (req: Request) => Promise<Response>;
let A: typeof import("@/lib/server/admin");

beforeAll(async () => {
  process.env.ADMIN_TOKEN = "a-long-random-admin-token-for-tests-1234";
  ({ POST } = await import("@/app/api/admin/login/route"));
  A = await import("@/lib/server/admin");
});
afterAll(() => {
  delete process.env.ADMIN_TOKEN;
});
beforeEach(() => A.resetLoginFailures());

const login = (token: string, ip = "10.1.1.1", origin?: string) =>
  POST(
    new Request("https://neville.test/api/admin/login", {
      method: "POST",
      headers: { "x-real-ip": ip, ...(origin ? { origin } : {}) },
      body: new URLSearchParams({ token }),
    }),
  );

describe("admin login", () => {
  it("sets an httpOnly, strict, path-scoped cookie holding a hash, never the token", async () => {
    const res = await login(process.env.ADMIN_TOKEN!);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://neville.test/admin/usage");
    const c = res.headers.get("set-cookie") ?? "";
    expect(c).toMatch(/nv_admin=\d+\.\d+\.[0-9a-f]{64}/);
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=strict/i);
    expect(c).toMatch(/Path=\/admin/);
    expect(c).toMatch(/Secure/i);
    expect(c).not.toContain(process.env.ADMIN_TOKEN!);
    const value = /nv_admin=(\d+\.\d+\.[0-9a-f]{64})/.exec(c)![1];
    expect(A.isAdminCookie(value)).toBe(true);
    expect(A.isAdminCookie("0".repeat(64))).toBe(false);
  });

  it("refuses a wrong token and a cross-origin post", async () => {
    const wrong = await login("nope");
    expect(wrong.headers.get("location")).toContain("wrong=1");
    expect(wrong.headers.get("set-cookie")).toBeNull();
    expect((await login(process.env.ADMIN_TOKEN!, "10.1.1.2", "https://evil.example")).status).toBe(403);
  });

  it("stops a visitor after 10 wrong guesses, even with the right token, and not others", async () => {
    for (let i = 0; i < 10; i++) await login(`guess-${i}`, "10.6.6.6");
    expect((await login(process.env.ADMIN_TOKEN!, "10.6.6.6")).status).toBe(429);
    expect((await login(process.env.ADMIN_TOKEN!, "10.7.7.7")).status).toBe(303);
  });

  it("clears a visitor's wrong guesses after a correct login", async () => {
    for (let i = 0; i < 9; i++) await login(`guess-${i}`, "10.8.8.8");
    expect((await login(process.env.ADMIN_TOKEN!, "10.8.8.8")).status).toBe(303);
    for (let i = 0; i < 9; i++) await login(`again-${i}`, "10.8.8.8");
    expect((await login(process.env.ADMIN_TOKEN!, "10.8.8.8")).status).toBe(303);
  });

  it("expires the session on the server after 12 hours, whatever the browser keeps", () => {
    const t0 = Date.UTC(2026, 10, 20, 6, 0, 0);
    const v = A.adminCookieValue(process.env.ADMIN_TOKEN!, t0);
    expect(A.isAdminCookie(v, t0 + 60_000)).toBe(true);
    expect(A.isAdminCookie(v, t0 + 12 * 3600_000 - 1000)).toBe(true);
    expect(A.isAdminCookie(v, t0 + 12 * 3600_000)).toBe(false);
    expect(A.isAdminCookie(v, t0 + 30 * 24 * 3600_000)).toBe(false);
  });

  it("rejects tampered sessions: a pushed-out expiry, a forged signature, another token", () => {
    const t0 = Date.UTC(2026, 10, 20, 6, 0, 0);
    const v = A.adminCookieValue(process.env.ADMIN_TOKEN!, t0);
    const [iat, exp, mac] = v.split(".");
    const later = String(Number(exp) + 30 * 24 * 3600);
    expect(A.isAdminCookie(`${iat}.${later}.${mac}`, t0 + 13 * 3600_000)).toBe(false);
    expect(A.isAdminCookie(`${iat}.${exp}.${"0".repeat(64)}`, t0 + 60_000)).toBe(false);
    expect(A.isAdminCookie(`${iat}.${exp}`, t0 + 60_000)).toBe(false);
    expect(A.isAdminCookie(A.adminCookieValue("some-other-token-of-similar-length-000", t0), t0 + 60_000)).toBe(false);
    // A session that claims to last longer than 12 hours is refused even if signed.
    const saved = process.env.ADMIN_TOKEN!;
    expect(A.isAdminCookie(v.replace(/^\d+/, String(Number(iat) + 99999)), t0)).toBe(false);
    expect(saved).toBe(process.env.ADMIN_TOKEN);
  });

  it("signs everyone out when ADMIN_TOKEN changes", () => {
    const v = A.adminCookieValue(process.env.ADMIN_TOKEN!);
    const saved = process.env.ADMIN_TOKEN;
    process.env.ADMIN_TOKEN = "a-different-long-random-admin-token-5678";
    expect(A.isAdminCookie(v)).toBe(false);
    process.env.ADMIN_TOKEN = saved;
    expect(A.isAdminCookie(v)).toBe(true);
  });

  it("is a 404 when ADMIN_TOKEN is not set", async () => {
    const saved = process.env.ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    expect((await login("anything")).status).toBe(404);
    process.env.ADMIN_TOKEN = saved;
  });
});
