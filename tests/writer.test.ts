// writeScript against a stand-in for OpenRouter: no network, no spend.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Reply = "ok" | "thin" | "429" | "500" | "400" | "banned";
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
      if (reply === "429" || reply === "500" || reply === "400") {
        res.statusCode = Number(reply);
        return res.end(JSON.stringify({ error: { message: reply } }));
      }
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

async function write(variant = 0, want = "my journey across Japan") {
  vi.resetModules();
  asked.length = 0;
  const { writeScript } = await import("@/lib/server/writer");
  return writeScript({ key: "k", want, name: "", variant });
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
