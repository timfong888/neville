// vetScript against a stand-in for OpenRouter: no network, no spend.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let server: Server;
const asked: string[] = [];
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
      const { model } = JSON.parse(raw);
      asked.push(model);
      if (limited.has(model)) {
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

async function vet() {
  vi.resetModules();
  asked.length = 0;
  return (await import("@/lib/server/vet")).vetScript("k", ["You are calm.", "It is done."]);
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
});
