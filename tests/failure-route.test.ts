// Tests for GET /api/admin/failures — auth (Bearer + cookie) and response shape.
// Regression: this file cannot exist on main (endpoint doesn't exist there) so all tests fail on main.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({ waitUntil: vi.fn() }));

vi.mock("@/lib/server/failureStore", () => ({
  todayUTC: () => "2026-11-27",
  failureSummaryRedis: async (_day: string) => null,
  failureSummaryMemory: () => ({
    "2026-11-27": {
      "voice_failed:http_status": { count: 2, sampleIds: ["req_1", "req_2"] },
    },
  }),
}));

let GET: (req: Request) => Promise<Response>;
let A: typeof import("@/lib/server/admin");

beforeAll(async () => {
  process.env.ADMIN_TOKEN = "failure-route-test-token-1234";
  ({ GET } = await import("@/app/api/admin/failures/route"));
  A = await import("@/lib/server/admin");
});

afterAll(() => {
  delete process.env.ADMIN_TOKEN;
});

const req = (opts?: { cookie?: string; bearer?: string }) =>
  new Request("https://neville.test/api/admin/failures", {
    headers: {
      ...(opts?.cookie ? { cookie: opts.cookie } : {}),
      ...(opts?.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}),
    },
  });

describe("GET /api/admin/failures", () => {
  it("returns 401 without any credentials", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns 401 with a wrong Bearer token", async () => {
    const res = await GET(req({ bearer: "not-the-right-token" }));
    expect(res.status).toBe(401);
  });

  it("returns 200 with a valid Bearer ADMIN_TOKEN", async () => {
    const res = await GET(req({ bearer: process.env.ADMIN_TOKEN }));
    expect(res.status).toBe(200);
    const body = await res.json() as { day: string; summary: Record<string, unknown> };
    expect(body.day).toBe("2026-11-27");
    expect(body.summary).toBeDefined();
  });

  it("returns the failure summary keyed by reason", async () => {
    const res = await GET(req({ bearer: process.env.ADMIN_TOKEN }));
    const body = await res.json() as { day: string; summary: Record<string, { count: number; sampleIds: string[] }> };
    const entry = body.summary["voice_failed:http_status"];
    expect(entry).toBeDefined();
    expect(entry.count).toBe(2);
    expect(entry.sampleIds).toContain("req_1");
  });

  // Regression for the cookie-path P1: the login now sets Path=/ so the cookie
  // is sent by browsers to /api/admin/* as well as /admin/*. This test proves
  // the endpoint accepts a cookie issued by the current login route.
  it("returns 200 with the root-path admin cookie issued by the login route", async () => {
    const cookieVal = A.adminCookieValue(process.env.ADMIN_TOKEN!);
    const res = await GET(req({ cookie: `nv_admin=${cookieVal}` }));
    expect(res.status).toBe(200);
  });

  it("returns 401 with an expired admin cookie", async () => {
    const longAgo = Date.now() - 25 * 3600 * 1000; // 25 h ago — beyond 12 h SESSION_SECONDS
    const cookieVal = A.adminCookieValue(process.env.ADMIN_TOKEN!, longAgo);
    const res = await GET(req({ cookie: `nv_admin=${cookieVal}` }));
    expect(res.status).toBe(401);
  });
});
