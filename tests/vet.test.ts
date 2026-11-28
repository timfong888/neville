// vetScript against a stand-in for OpenRouter: no network, no spend.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { VET_SYSTEM, VET_SYSTEM_ADULT } from "@/lib/rerecord";

vi.mock("server-only", () => ({}));

let server: Server;
const asked: string[] = [];
const bodies: Array<{ messages: Array<{ role: string; content: string }> }> = [];
let limited = new Set<string>();

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url?.startsWith("/models")) {
        return res.end(JSON.stringify({ data: [{ id: "google/gemini-2.5-flash-lite" }, { id: "openai/gpt-4.1-nano" }] }));
      }
      const parsed = JSON.parse(raw);
      asked.push(parsed.model);
      bodies.push(parsed);
      if (limited.has(parsed.model)) {
        res.statusCode = 429;
        return res.end(JSON.stringify({ error: { message: "temporarily rate-limited upstream" } }));
      }
      res.end(JSON.stringify({ choices: [{ message: { content: "OK" } }], usage: { cost: 0.00001 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
  delete process.env.OPENROUTER_BASE_URL;
});

async function vet(isAdult?: boolean) {
  vi.resetModules();
  asked.length = 0;
  bodies.length = 0;
  const { vetScript } = await import("@/lib/server/vet");
  return vetScript("k", ["You are calm.", "It is done."], isAdult);
}

describe("vetScript", () => {
  it("asks the next configured model when the first is rate-limited", async () => {
    limited = new Set(["google/gemini-2.5-flash-lite"]);
    const out = await vet();
    expect(out).toMatchObject({ ok: true, model: "openai/gpt-4.1-nano" });
    expect(asked).toEqual(["google/gemini-2.5-flash-lite", "openai/gpt-4.1-nano"]);
  });

  it("fails closed when every model it tries is rate-limited", async () => {
    limited = new Set(["google/gemini-2.5-flash-lite", "openai/gpt-4.1-nano"]);
    expect(await vet()).toEqual({ ok: false, reason: "unavailable" });
    expect(asked).toHaveLength(2);
  });

  it("asks only the first model when it answers", async () => {
    limited = new Set();
    expect(await vet()).toMatchObject({ ok: true, model: "google/gemini-2.5-flash-lite" });
    expect(asked).toEqual(["google/gemini-2.5-flash-lite"]);
  });

  it("sends VET_SYSTEM for non-adult tier (default)", async () => {
    limited = new Set();
    await vet();
    expect(bodies[0].messages[0]).toEqual({ role: "system", content: VET_SYSTEM });
  });

  it("sends VET_SYSTEM for non-adult tier (explicit false)", async () => {
    limited = new Set();
    await vet(false);
    expect(bodies[0].messages[0]).toEqual({ role: "system", content: VET_SYSTEM });
  });

  it("sends VET_SYSTEM_ADULT for adult tier", async () => {
    limited = new Set();
    await vet(true);
    expect(bodies[0].messages[0]).toEqual({ role: "system", content: VET_SYSTEM_ADULT });
  });

  it("VET_SYSTEM_ADULT is different from VET_SYSTEM", () => {
    expect(VET_SYSTEM_ADULT).not.toBe(VET_SYSTEM);
    expect(VET_SYSTEM_ADULT).toContain("consenting adults");
  });
});
