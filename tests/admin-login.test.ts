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
    expect(c).toMatch(/nv_admin=[0-9a-f]{64}/);
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=strict/i);
    expect(c).toMatch(/Path=\/admin/);
    expect(c).toMatch(/Secure/i);
    expect(c).not.toContain(process.env.ADMIN_TOKEN!);
    const value = /nv_admin=([0-9a-f]{64})/.exec(c)![1];
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

  it("is a 404 when ADMIN_TOKEN is not set", async () => {
    const saved = process.env.ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    expect((await login("anything")).status).toBe(404);
    process.env.ADMIN_TOKEN = saved;
  });
});
