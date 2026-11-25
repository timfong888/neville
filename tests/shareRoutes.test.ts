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
const listed = vi.fn();
const released = vi.fn();
let budgetOk = true;
vi.mock("@/lib/server/accounts", () => ({
  accountsEnabled: () => true,
  currentUser: () => user(),
  PRIMARY_ORIGIN: "https://getneville.vercel.app",
  LEGACY_ORIGINS: [],
}));
vi.mock("@/lib/server/db", () => ({ dbConfigured: () => true, getPool: () => ({}), withTx: (fn: (db: object) => unknown) => fn({}) }));
vi.mock("@/lib/server/openrouter", () => ({ apiKey: () => "k" }));
vi.mock("@/lib/server/limits", () => ({
  LIMITS: { maxScriptChars: 1000 },
  generationEnabled: () => generation,
  underCeiling: async () =>
    budgetOk ? { ok: true, usage: 0 } : { ok: false, refusal: { code: "budget", error: "Paused.", status: 503 } },
}));
vi.mock("@/lib/server/ledger", () => ({ record: async (e: unknown) => recorded(e) }));
vi.mock("@/lib/server/vet", () => ({ vetScript: (...a: unknown[]) => vet(...a) }));
vi.mock("@/lib/server/shareDb", () => ({
  MAX_LINKS_PER_DAY: 20,
  createShare: (...a: unknown[]) => create(...a),
  reserveShareAttempt: (...a: unknown[]) => reserve(...a),
  releaseShareAttempt: async (...a: unknown[]) => released(...a),
  listShares: (...a: unknown[]) => listed(...a),
  revokeShare: async () => true,
}));

const MID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SAVED = { manifestationId: MID, title: "Saved", lines: ["Saved line."], voiceName: "" };
const post = () =>
  new Request("https://neville.test/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://neville.test" },
    body: JSON.stringify({ title: "Calm", lines: ["Breathe."], manifestationId: MID }),
  });

beforeEach(() => {
  user.mockReset();
  create.mockReset();
  reserve.mockReset().mockResolvedValue({ ok: true, copy: SAVED, attemptId: "7" });
  released.mockReset();
  budgetOk = true;
  vet.mockReset().mockResolvedValue({ ok: true, model: "m", costUsd: 0.0001 });
  recorded.mockReset();
  generation = true;
  listed.mockReset().mockResolvedValue([]);
});

describe("POST /api/share", () => {
  it("spend ceiling reached: refused before an attempt is used", async () => {
    user.mockResolvedValue({ id: "u-a" });
    budgetOk = false;
    const { POST } = await import("@/app/api/share/route");
    expect((await POST(post())).status).toBe(503);
    expect(reserve).not.toHaveBeenCalled();
    expect(vet).not.toHaveBeenCalled();
  });

  it("content check never reached the model: 503, and the attempt is given back", async () => {
    user.mockResolvedValue({ id: "u-a" });
    vet.mockResolvedValue({ ok: false, reason: "unavailable" });
    const { POST } = await import("@/app/api/share/route");
    const res = await POST(post());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("vet_unavailable");
    expect(released).toHaveBeenCalledWith({}, "u-a", "7");
    expect(recorded).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("content check rejected it: 422, and the attempt still counts", async () => {
    user.mockResolvedValue({ id: "u-a" });
    vet.mockResolvedValue({ ok: false, reason: "rejected", model: "m", costUsd: 0.0001 });
    const { POST } = await import("@/app/api/share/route");
    expect((await POST(post())).status).toBe(422);
    expect(released).not.toHaveBeenCalled();
    expect(recorded).toHaveBeenCalled();
  });

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
    // The request's own title and lines are ignored: the saved copy is vetted and stored.
    expect(vet.mock.calls[0][1]).toEqual(["Saved", "Saved line."]);
    expect(create.mock.calls[0][2]).toEqual(SAVED);
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
    expect(await (await GET(new Request("https://neville.test/api/share"))).json()).toMatchObject({ enabled: true, canCreate: false });
  });

  it("kill switch off: the maker still sees their existing links, so they can revoke them", async () => {
    generation = false;
    user.mockResolvedValue({ id: "u-a" });
    listed.mockResolvedValue([{ id: "s".repeat(22), createdAt: 1 }]);
    const { GET } = await import("@/app/api/share/route");
    const res = await GET(new Request(`https://neville.test/api/share?manifestation=${MID}`));
    expect(await res.json()).toMatchObject({ enabled: true, canCreate: false, links: [{ id: "s".repeat(22) }] });
  });

  it("refuses another site's origin", async () => {
    const { POST } = await import("@/app/api/share/route");
    const r = new Request("https://neville.test/api/share", { method: "POST", headers: { Origin: "https://evil.test" }, body: "{}" });
    expect((await POST(r)).status).toBe(403);
  });

  it("refuses a request with no Origin, as the other account routes do", async () => {
    user.mockResolvedValue({ id: "u-a" });
    const { POST } = await import("@/app/api/share/route");
    const r = new Request("https://neville.test/api/share", { method: "POST", body: JSON.stringify({ manifestationId: MID }) });
    expect((await POST(r)).status).toBe(403);
    expect(reserve).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/share/<id>", () => {
  const del = (origin?: string) =>
    new Request("https://neville.test/api/share/x", { method: "DELETE", headers: origin ? { Origin: origin } : {} });
  const params = { params: Promise.resolve({ id: "s".repeat(22) }) };

  it("signed out: 401, nothing revoked", async () => {
    user.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/share/[id]/route");
    expect((await DELETE(del("https://neville.test"), params)).status).toBe(401);
  });

  it("signed in from the site or the native app: revoked", async () => {
    user.mockResolvedValue({ id: "u-a" });
    const { DELETE } = await import("@/app/api/share/[id]/route");
    expect((await DELETE(del("https://neville.test"), params)).status).toBe(200);
    expect((await DELETE(del("neville://"), params)).status).toBe(200);
  });

  it("refuses another site's origin and a missing Origin before checking sign-in", async () => {
    user.mockResolvedValue({ id: "u-a" });
    const { DELETE } = await import("@/app/api/share/[id]/route");
    expect((await DELETE(del("https://evil.test"), params)).status).toBe(403);
    expect((await DELETE(del(), params)).status).toBe(403);
    expect(user).not.toHaveBeenCalled();
  });
});
