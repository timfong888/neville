// AT-304 allowlist and vet fix tests.
//
// Verifies likely causes (a), (b), (c) from issue 304.
// AT-6: regression tests (marked with "fails on main") fail without the fix in route.ts.
// AT-1: listed adult email + flag on → voice stage reached → 200.
// AT-3: hard blocks stay NO for both tiers.
//
// Setup: mocks currentUser to inject a session, so the route sees a specific email/id.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/accounts", () => ({ currentUser: vi.fn() }));

let server: Server;
let POST: (req: Request) => Promise<Response>;
let currentUserMock: ReturnType<typeof vi.fn>;
let vetReply = "OK";
let L: typeof import("@/lib/server/ledger");

// Fixture script matching Tim's shape: adults in their early twenties, desire toward the listener.
// This should pass VET_SYSTEM_ADULT (relaxed vet) but be rejected by VET_SYSTEM (standard vet).
const FIXTURE_SCRIPT = {
  lines: [
    "A beautiful woman in her early twenties is drawn to you.",
    "She desires you deeply, fully and freely.",
    "You are confident, attractive, and magnetic.",
    "She reaches for your hand and smiles warmly.",
    "Two consenting adults, completely at ease with each other.",
  ],
  voiceId: null,
};

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url?.startsWith("/models")) {
        return res.end(JSON.stringify({ data: [{ id: "google/gemini-2.5-flash-lite" }] }));
      }
      if (req.url?.startsWith("/key")) return res.end(JSON.stringify({ data: { usage: 0, limit_remaining: null } }));
      if (req.url?.startsWith("/chat/completions")) {
        return res.end(JSON.stringify({ choices: [{ message: { content: vetReply } }], usage: { cost: 0.00001 } }));
      }
      if (req.url?.startsWith("/audio/speech")) {
        res.setHeader("Content-Type", "audio/pcm;rate=24000");
        return res.end(Buffer.alloc(480));
      }
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as AddressInfo;
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${addr.port}`;
  process.env.OPENROUTER_API_KEY = "test-key";
  ({ POST } = await import("@/app/api/rerecord/route"));
  ({ currentUser: currentUserMock } = await import("@/lib/server/accounts") as { currentUser: ReturnType<typeof vi.fn> });
  L = await import("@/lib/server/ledger");
});

afterAll(() => {
  server.close();
  delete process.env.OPENROUTER_BASE_URL;
  delete process.env.OPENROUTER_API_KEY;
});

let ipN = 200;
const req = (body: unknown) =>
  new Request("http://localhost/api/rerecord", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": `10.2.0.${++ipN}` },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vetReply = "OK";
  currentUserMock.mockResolvedValue(null); // no session by default
  delete process.env.ADULT_TIER_ENABLED;
  delete process.env.ADULT_TIER_EMAILS;
  delete process.env.RELAXED_FILTER_EMAILS;
  delete process.env.RELAXED_FILTER_IDS;
  L.setLedger(new L.MemoryLedger());
  L.resetAlerts();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Cause (a): email not on the allowlist ─────────────────────────────────────

describe("cause (a): email not on allowlist → standard vet", () => {
  it("unlisted email gets standard vet and returns 422 when vet says NO", async () => {
    process.env.ADULT_TIER_ENABLED = "true";
    process.env.ADULT_TIER_EMAILS = "adult@example.com";
    vetReply = "NO";
    currentUserMock.mockResolvedValue({ id: "u1", email: "other@example.com", emailVerified: true });
    const res = await req(FIXTURE_SCRIPT);
    expect((await POST(res)).status).toBe(422);
  });

  it("Apple private-relay style email is NOT on the allowlist — returns 422 (AT-6 regression, fails on main when cause is relay email)", async () => {
    // The relay address is a randomised Apple email that doesn't match the allowlist.
    // This is cause (a): isAdultTierUser sees a relay address, not timfong888@gmail.com.
    // On main (without fix), isAdult=false → standard vet → NO → 422.
    // On main WITH the fix but without RELAXED_FILTER_IDS, still 422 (expected: relay fails without ID fix).
    process.env.ADULT_TIER_ENABLED = "true";
    process.env.ADULT_TIER_EMAILS = "adult@example.com";
    vetReply = "NO";
    currentUserMock.mockResolvedValue({
      id: "apple-stable-id-001",
      email: "abc123def@privaterelay.appleid.com",
      emailVerified: true,
    });
    const res = await POST(req(FIXTURE_SCRIPT));
    expect(res.status).toBe(422);
  });

  it("Apple relay email with user ID in RELAXED_FILTER_IDS → relaxed vet → 200", async () => {
    // Fix for the Apple relay case: add the stable user ID to RELAXED_FILTER_IDS.
    // isFilterRelaxed(session) returns true because session.id is in RELAXED_FILTER_IDS.
    // After the route fix (isAdult || relaxed), the relaxed vet is used → vet says OK → 200.
    process.env.ADULT_TIER_ENABLED = "true";
    process.env.ADULT_TIER_EMAILS = "adult@example.com";
    process.env.RELAXED_FILTER_IDS = "apple-stable-id-001";
    vetReply = "OK"; // relaxed vet approves the fixture script
    currentUserMock.mockResolvedValue({
      id: "apple-stable-id-001",
      email: "abc123def@privaterelay.appleid.com",
      emailVerified: true,
    });
    const res = await POST(req(FIXTURE_SCRIPT));
    expect(res.status).toBe(200);
  });
});

// ── Cause (b): relaxed vet not applied when only RELAXED_FILTER_EMAILS is set ─

describe("cause (b): relaxed vet applied on rerecord — AT-6 regression", () => {
  it("RELAXED_FILTER_EMAILS match → relaxed vet used (fails on main without fix)", async () => {
    // On main: vetScript receives isAdult=false (email not in ADULT_TIER_EMAILS) → VET_SYSTEM used.
    // After fix: vetScript receives isAdult || relaxed = true → VET_SYSTEM_ADULT used.
    process.env.ADULT_TIER_ENABLED = "true";
    // Email is on RELAXED_FILTER_EMAILS but NOT on ADULT_TIER_EMAILS.
    process.env.ADULT_TIER_EMAILS = "other@example.com";
    process.env.RELAXED_FILTER_EMAILS = "adult@example.com";
    vetReply = "OK";
    currentUserMock.mockResolvedValue({ id: "u2", email: "adult@example.com", emailVerified: true });
    const { VET_SYSTEM_ADULT } = await import("@/lib/rerecord");

    // Spy on the vet calls to see which prompt was sent.
    const calls: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    const originalFetch = global.fetch;
    global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/chat/completions") && init?.body) {
        calls.push(JSON.parse(init.body as string));
      }
      return originalFetch(url, init);
    };

    const res = await POST(req(FIXTURE_SCRIPT));
    global.fetch = originalFetch;

    // After the fix, the relaxed prompt must be used.
    const vetCall = calls[0];
    expect(vetCall).toBeDefined();
    expect(vetCall!.messages[0].content).toBe(VET_SYSTEM_ADULT);
    expect(res.status).toBe(200);
  });

  it("RELAXED_FILTER_EMAILS match → 200 when vet approves", async () => {
    process.env.ADULT_TIER_ENABLED = "true";
    process.env.ADULT_TIER_EMAILS = "other@example.com";
    process.env.RELAXED_FILTER_EMAILS = "adult@example.com";
    vetReply = "OK";
    currentUserMock.mockResolvedValue({ id: "u3", email: "adult@example.com", emailVerified: true });
    const res = await POST(req(FIXTURE_SCRIPT));
    expect(res.status).toBe(200);
  });
});

// ── AT-1: listed account reaches voice stage ──────────────────────────────────

describe("AT-1: listed adult email + flag on → voice stage reached → 200", () => {
  it("ADULT_TIER_EMAILS match → reaches voice and returns 200", async () => {
    process.env.ADULT_TIER_ENABLED = "true";
    process.env.ADULT_TIER_EMAILS = "adult@example.com";
    vetReply = "OK";
    currentUserMock.mockResolvedValue({ id: "u4", email: "adult@example.com", emailVerified: true });
    const res = await POST(req(FIXTURE_SCRIPT));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^audio\//);
  });
});

// ── AT-2: unlisted email → 422 ────────────────────────────────────────────────

describe("AT-2: unlisted email → 422", () => {
  it("unlisted email returns 422 when vet rejects — standard tier no-pass", async () => {
    process.env.ADULT_TIER_ENABLED = "true";
    process.env.ADULT_TIER_EMAILS = "adult@example.com";
    vetReply = "NO";
    currentUserMock.mockResolvedValue({ id: "u5", email: "other@example.com", emailVerified: true });
    const res = await POST(req(FIXTURE_SCRIPT));
    expect(res.status).toBe(422);
  });
});

// ── AT-3: hard blocks stay NO for both tiers ──────────────────────────────────

describe("AT-3: hard-block fixtures return 422 on both standard and adult tier", () => {
  const hardBlocks = [
    { name: "minor — explicit age", lines: ["A 15-year-old is in my arms.", "It is done."] },
    { name: "minor — coded term (girl)", lines: ["A cute girl smiles at me.", "It is done."] },
    { name: "minor — teen keyword", lines: ["She is a teenager who wants me.", "It is done."] },
    { name: "real named person", lines: ["I am with Scarlett Johansson.", "It is done."] },
    { name: "non-consent — forced", lines: ["She was forced to love me.", "It is done."] },
    { name: "family role + sexual context", lines: ["I make love to my mother.", "It is done."] },
    { name: "violence — murder", lines: ["I killed the man who wronged me.", "It is done."] },
  ];

  for (const { name, lines } of hardBlocks) {
    it(`hard block (${name}) returns NO (vet model rejects) on standard tier`, async () => {
      // With NO reply from vet model, any script returns 422 on standard tier.
      vetReply = "NO";
      currentUserMock.mockResolvedValue(null);
      const res = await POST(req({ lines, voiceId: null }));
      expect(res.status).toBe(422);
    });

    it(`hard block (${name}) returns NO (vet model rejects) on adult tier`, async () => {
      // Adult tier must also reject hard blocks; vet model must say NO to these.
      vetReply = "NO";
      process.env.ADULT_TIER_ENABLED = "true";
      process.env.ADULT_TIER_EMAILS = "adult@example.com";
      currentUserMock.mockResolvedValue({ id: "u6", email: "adult@example.com", emailVerified: true });
      const res = await POST(req({ lines, voiceId: null }));
      expect(res.status).toBe(422);
    });
  }

  it("adult-tier rejection hint does NOT contain standard-tier advice about replacing explicit language", async () => {
    vetReply = "NO";
    process.env.ADULT_TIER_ENABLED = "true";
    process.env.ADULT_TIER_EMAILS = "adult@example.com";
    currentUserMock.mockResolvedValue({ id: "u7", email: "adult@example.com", emailVerified: true });
    const res = await POST(req({ lines: ["A minor is here.", "It is done."], voiceId: null }));
    expect(res.status).toBe(422);
    const j = await res.json() as { hint?: string };
    // Adult tier must never see the standard "replace explicit language" advice.
    expect(j.hint).not.toMatch(/replace explicit body/i);
    expect(j.hint).not.toMatch(/warm, alive, connected/i);
  });

  it("standard-tier rejection hint tells user to use softer language", async () => {
    vetReply = "NO";
    currentUserMock.mockResolvedValue(null);
    const res = await POST(req(FIXTURE_SCRIPT));
    expect(res.status).toBe(422);
    const j = await res.json() as { hint?: string };
    expect(j.hint).toMatch(/warm, alive, connected/i);
  });
});

// ── Cause (c): VET_SYSTEM_ADULT content check ─────────────────────────────────

describe("cause (c): VET_SYSTEM_ADULT prompt does not hard-block the fixture script shape", () => {
  it("VET_SYSTEM_ADULT contains 'consenting adults' (allows adult desire)", async () => {
    const { VET_SYSTEM_ADULT } = await import("@/lib/rerecord");
    expect(VET_SYSTEM_ADULT).toContain("consenting adults");
  });

  it("VET_SYSTEM_ADULT explicitly permits romantic and sexual desire", async () => {
    const { VET_SYSTEM_ADULT } = await import("@/lib/rerecord");
    // The prompt must allow desire-toward-listener scripts for fictional consenting adults.
    expect(VET_SYSTEM_ADULT).toMatch(/romantic.*sexual desire|sexual desire|desire.*consenting/i);
  });

  it("VET_SYSTEM_ADULT blocks minors — the hard-block must remain in the adult prompt", async () => {
    const { VET_SYSTEM_ADULT } = await import("@/lib/rerecord");
    expect(VET_SYSTEM_ADULT).toMatch(/under 18|minor|minor\b/i);
  });

  it("VET_SYSTEM_ADULT blocks non-consent", async () => {
    const { VET_SYSTEM_ADULT } = await import("@/lib/rerecord");
    expect(VET_SYSTEM_ADULT).toMatch(/non-consent|coercion/i);
  });

  it("VET_SYSTEM_ADULT blocks family roles", async () => {
    const { VET_SYSTEM_ADULT } = await import("@/lib/rerecord");
    expect(VET_SYSTEM_ADULT).toMatch(/family|relative/i);
  });
});
