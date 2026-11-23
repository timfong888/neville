// The share API's sign-in rules, with accounts, the database and the text
// model stubbed: signed out, no link is made and nothing can be revoked.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const user = vi.fn();
const create = vi.fn();
const reserve = vi.fn();
const vet = vi.fn();
const recorded = vi.fn();
let generation = true;
vi.mock("@/lib/server/accounts", () => ({ accountsEnabled: () => true, currentUser: () => user() }));
vi.mock("@/lib/server/db", () => ({ dbConfigured: () => true, getPool: () => ({}), withTx: (fn: (db: object) => unknown) => fn({}) }));
vi.mock("@/lib/server/openrouter", () => ({ apiKey: () => "k" }));
vi.mock("@/lib/server/limits", () => ({
  LIMITS: { maxScriptChars: 1000 },
  generationEnabled: () => generation,
  underCeiling: async () => ({ ok: true, usage: 0 }),
}));
vi.mock("@/lib/server/ledger", () => ({ record: async (e: unknown) => recorded(e) }));
vi.mock("@/lib/server/vet", () => ({ vetScript: (...a: unknown[]) => vet(...a) }));
vi.mock("@/lib/server/shareDb", () => ({
  MAX_LINKS_PER_DAY: 20,
  createShare: (...a: unknown[]) => create(...a),
  reserveShareAttempt: (...a: unknown[]) => reserve(...a),
  listShares: async () => [],
  revokeShare: async () => true,
}));

const MID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const post = () =>
  new Request("https://neville.test/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://neville.test" },
    body: JSON.stringify({ title: "Calm", lines: ["Breathe."], manifestationId: MID }),
  });

beforeEach(() => {
  user.mockReset();
  create.mockReset();
  reserve.mockReset().mockResolvedValue({ ok: true });
  vet.mockReset().mockResolvedValue({ ok: true, model: "m", costUsd: 0.0001 });
  recorded.mockReset();
  generation = true;
});

describe("POST /api/share", () => {
  it("signed out: 401 sign_in, and no link is made", async () => {
    user.mockResolvedValue(null);
    const { POST } = await import("@/app/api/share/route");
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("sign_in");
    expect(create).not.toHaveBeenCalled();
    expect(vet).not.toHaveBeenCalled();
  });

  it("a failed sign-in check is 503, not treated as signed out", async () => {
    user.mockRejectedValue(new Error("db down"));
    const { POST } = await import("@/app/api/share/route");
    expect((await POST(post())).status).toBe(503);
    expect(create).not.toHaveBeenCalled();
  });

  it("signed in: makes the link under the account", async () => {
    user.mockResolvedValue({ id: "u-a" });
    create.mockResolvedValue({ ok: true, id: "s".repeat(22) });
    const { POST } = await import("@/app/api/share/route");
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "s".repeat(22) });
    expect(create.mock.calls[0][1]).toBe("u-a");
    expect(recorded).toHaveBeenCalledWith(expect.objectContaining({ route: "share", kind: "vet", model: "m", estUsd: 0.0001 }));
  });

  it("a rejected script is still a paid check: recorded in the ledger, 422, no link", async () => {
    user.mockResolvedValue({ id: "u-a" });
    vet.mockResolvedValue({ ok: false, reason: "rejected", model: "m", costUsd: 0.0001 });
    const { POST } = await import("@/app/api/share/route");
    expect((await POST(post())).status).toBe(422);
    expect(recorded).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("a check that never reached the model is not recorded", async () => {
    user.mockResolvedValue({ id: "u-a" });
    vet.mockResolvedValue({ ok: false, reason: "unavailable" });
    const { POST } = await import("@/app/api/share/route");
    expect((await POST(post())).status).toBe(503);
    expect(recorded).not.toHaveBeenCalled();
  });

  it("over the daily cap: 429, before any paid content check", async () => {
    user.mockResolvedValue({ id: "u-a" });
    reserve.mockResolvedValue({ ok: false, reason: "daily_limit" });
    const { POST } = await import("@/app/api/share/route");
    expect((await POST(post())).status).toBe(429);
    expect(vet).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("not the account's manifestation: 404, before any paid content check", async () => {
    user.mockResolvedValue({ id: "u-a" });
    reserve.mockResolvedValue({ ok: false, reason: "not_found" });
    const { POST } = await import("@/app/api/share/route");
    expect((await POST(post())).status).toBe(404);
    expect(vet).not.toHaveBeenCalled();
  });

  it("kill switch off: 503 before sign-in, quota or any paid check", async () => {
    generation = false;
    user.mockResolvedValue({ id: "u-a" });
    const { POST, GET } = await import("@/app/api/share/route");
    const res = await POST(post());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("off");
    expect(reserve).not.toHaveBeenCalled();
    expect(vet).not.toHaveBeenCalled();
    expect(await (await GET(new Request("https://neville.test/api/share"))).json()).toMatchObject({ enabled: false });
  });

  it("refuses another site's origin", async () => {
    const { POST } = await import("@/app/api/share/route");
    const r = new Request("https://neville.test/api/share", { method: "POST", headers: { Origin: "https://evil.test" }, body: "{}" });
    expect((await POST(r)).status).toBe(403);
  });
});

describe("DELETE /api/share/<id>", () => {
  it("signed out: 401, nothing revoked", async () => {
    user.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/share/[id]/route");
    const res = await DELETE(new Request("https://neville.test/api/share/x", { method: "DELETE" }), { params: Promise.resolve({ id: "s".repeat(22) }) });
    expect(res.status).toBe(401);
  });
});
