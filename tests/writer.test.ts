// writeScript against a stand-in for OpenRouter: no network, no spend.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Reply = "ok" | "thin" | "banned" | "garbage" | `${number}`;
let server: Server;
let listed = ["google/gemini-2.5-flash-lite", "openai/gpt-4.1-nano"];
/** What each model answers, in turn; the last entry repeats. */
let plan: Record<string, Reply[]> = {};
const asked: Array<{ model: string; user: Record<string, unknown> }> = [];

const GOOD = [
  "Take a slow breath in, and let it go.",
  "Your journey across Japan is complete.",
  "You stand on the platform in Kyoto.",
  "The train doors open with a soft chime.",
  "You smile at the friend who waited for you.",
  "Your journey across Japan is yours.",
  "You are someone who goes where you choose.",
  "Thank you, thank you, thank you.",
  "It is done.",
].join("\n");

const GARBAGE = "Sorry, I cannot write that: the model's own words";

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url?.startsWith("/models")) return res.end(JSON.stringify({ data: listed.map((id) => ({ id })) }));
      const body = JSON.parse(raw);
      asked.push({ model: body.model, user: JSON.parse(body.messages[1].content) });
      const turns = plan[body.model] ?? ["ok"];
      const reply = turns.length > 1 ? turns.shift()! : turns[0];
      if (/^\d{3}$/.test(reply)) {
        res.statusCode = Number(reply);
        return res.end(JSON.stringify({ error: { message: reply } }));
      }
      // A 200 that is not JSON, and carries text that must never reach a log.
      if (reply === "garbage") return res.end(`${GARBAGE} <html>`);
      const content = reply === "thin" ? "You are calm.\nIt is done." : reply === "banned" ? GOOD.replace("Japan is complete", "Japan builds momentum") : GOOD;
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  delete process.env.OPENROUTER_BASE_URL;
});

// Values that must never appear in a log line.
const KEY = "sk-or-test-KEY-4f9a1c";
const NAME = "Zorbulon";

async function write(variant = 0, want = "my journey across Japan") {
  vi.resetModules();
  asked.length = 0;
  const { writeScript } = await import("@/lib/server/writer");
  return writeScript({ key: KEY, want, name: NAME, variant });
}

describe("writeScript", () => {
  it("uses the first model's script when it is good", async () => {
    plan = {};
    const s = await write();
    expect(s.source).toBe("model");
    expect(s.model).toBe("google/gemini-2.5-flash-lite");
    expect(asked).toHaveLength(1);
  });

  it("keeps the listener's own words even when they include a banned phrase", async () => {
    plan = {};
    const s = await write(0, "my journey across Japan");
    expect(s.source).toBe("model");
    expect(s.lines.join(" ")).toMatch(/journey across Japan/);
  });

  it("hands over to the next model on a rate limit, asking for the same version", async () => {
    plan = { "google/gemini-2.5-flash-lite": ["429"] };
    const s = await write(0);
    expect(s).toMatchObject({ source: "model", model: "openai/gpt-4.1-nano" });
    expect(asked.map((a) => a.model)).toEqual(["google/gemini-2.5-flash-lite", "openai/gpt-4.1-nano"]);
    expect(asked[1].user.opening).toBe(asked[0].user.opening);
    expect(asked[1].user).not.toHaveProperty("note");
  });

  it("hands over on a provider error too", async () => {
    plan = { "google/gemini-2.5-flash-lite": ["500"] };
    expect((await write()).model).toBe("openai/gpt-4.1-nano");
  });

  it("asks the same model again, for fresh wording, after an unusable reply", async () => {
    plan = { "google/gemini-2.5-flash-lite": ["thin", "ok"] };
    const s = await write(0);
    expect(s).toMatchObject({ source: "model", model: "google/gemini-2.5-flash-lite" });
    expect(asked).toHaveLength(2);
    expect(asked[1].user.note).toMatch(/Version 2/);
  });

  it("refuses a stock phrase that is not the listener's own, then asks again", async () => {
    plan = { "google/gemini-2.5-flash-lite": ["banned", "ok"] };
    const s = await write(0);
    expect(s.source).toBe("model");
    expect(s.lines.join(" ")).not.toMatch(/momentum/);
    expect(asked).toHaveLength(2);
  });

  it("falls back to the template on a refusal (4xx), without trying another model", async () => {
    plan = { "google/gemini-2.5-flash-lite": ["400"] };
    expect((await write()).source).toBe("template");
    expect(asked).toHaveLength(1);
  });

  it("falls back to the template when the only model is rate-limited", async () => {
    listed = ["google/gemini-2.5-flash-lite"];
    plan = { "google/gemini-2.5-flash-lite": ["429"] };
    const s = await write();
    listed = ["google/gemini-2.5-flash-lite", "openai/gpt-4.1-nano"];
    expect(s.source).toBe("template");
    expect(asked).toHaveLength(1);
  });

  it("stops after two tries", async () => {
    plan = { "google/gemini-2.5-flash-lite": ["thin"] };
    expect((await write()).source).toBe("template");
    expect(asked).toHaveLength(2);
  });
});

describe("writeScript fallback log (#176)", () => {
  const WISH = "my secret wish about pineapples and Zorbulon's mother";
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    vi.restoreAllMocks();
  });

  /** The one [script_fallback] line, parsed; fails if there is not exactly one. */
  function fallback(): Record<string, unknown> {
    const lines = warn.mock.calls.filter((c: unknown[]) => c[0] === "[script_fallback]");
    expect(lines).toHaveLength(1);
    const raw = String(lines[0][1]);
    // Nothing personal, no key, no model text: in this line or anywhere else warned.
    const everything = warn.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n");
    for (const secret of [WISH, "pineapples", NAME, KEY, ...GOOD.split("\n"), "You are calm", GARBAGE, "model's own words"]) {
      expect(everything).not.toContain(secret);
    }
    const o = JSON.parse(raw) as Record<string, unknown>;
    expect(typeof o.elapsedMs).toBe("number");
    expect(o.elapsedMs as number).toBeGreaterThanOrEqual(0);
    return o;
  }

  it.each([400, 401, 402, 403, 404])("logs an http_status %i fallback with the status and model", async (status) => {
    plan = { "google/gemini-2.5-flash-lite": [String(status) as Reply] };
    const s = await write(0, WISH);
    expect(s.source).toBe("template");
    expect(fallback()).toMatchObject({ reason: "http_status", status, model: "google/gemini-2.5-flash-lite", attempt: 1 });
  });

  it("logs the last status when every model is rate-limited or down", async () => {
    plan = { "google/gemini-2.5-flash-lite": ["429"], "openai/gpt-4.1-nano": ["503"] };
    expect((await write(0, WISH)).source).toBe("template");
    expect(fallback()).toMatchObject({ reason: "http_status", status: 503, model: "openai/gpt-4.1-nano", attempt: 2 });
  });

  it("logs a timeout on both tries, with the second model and attempt", async () => {
    const real = globalThis.fetch;
    let chats = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("/chat/completions")) {
        chats++;
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }
      return real(input, init);
    });
    expect((await write(0, WISH)).source).toBe("template");
    expect(chats).toBe(2);
    expect(fallback()).toMatchObject({ reason: "timeout", model: "openai/gpt-4.1-nano", attempt: 2 });
  });

  it("logs two unusable replies, with status 200 and the model asked twice", async () => {
    plan = { "google/gemini-2.5-flash-lite": ["thin"] };
    expect((await write(0, WISH)).source).toBe("template");
    expect(fallback()).toMatchObject({ reason: "unusable_reply", status: 200, model: "google/gemini-2.5-flash-lite", attempt: 2 });
  });

  it("logs an exception by its name only, never its message or the reply body", async () => {
    plan = { "google/gemini-2.5-flash-lite": ["garbage"] };
    expect((await write(0, WISH)).source).toBe("template");
    expect(fallback()).toMatchObject({ reason: "exception", error: "SyntaxError", model: "google/gemini-2.5-flash-lite", attempt: 1 });
  });

  it("logs a timeout that hits while the reply body is read as a timeout, not an exception", async () => {
    const real = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (!String(input).includes("/chat/completions")) return real(input, init);
      return { ok: true, status: 200, json: async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); } } as unknown as Response;
    });
    expect((await write(0, WISH)).source).toBe("template");
    const line = fallback();
    expect(line).toMatchObject({ reason: "timeout", model: "google/gemini-2.5-flash-lite", attempt: 1 });
    expect(line).not.toHaveProperty("error");
  });

  it("logs a dropped connection as an exception", async () => {
    const real = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).includes("/chat/completions")) throw new TypeError(`fetch failed for ${KEY} ${WISH}`);
      return real(input, init);
    });
    expect((await write(0, WISH)).source).toBe("template");
    expect(fallback()).toMatchObject({ reason: "exception", error: "TypeError" });
  });

  it("logs nothing when a model writes the script", async () => {
    plan = {};
    expect((await write()).source).toBe("model");
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs nothing when a handover still ends in a model script", async () => {
    plan = { "google/gemini-2.5-flash-lite": ["429"] };
    expect((await write()).model).toBe("openai/gpt-4.1-nano");
    expect(warn).not.toHaveBeenCalled();
  });
});
