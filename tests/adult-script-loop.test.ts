// Regression test: adult script loop tries every model on unusable_reply (issue #281 F2).
// Tests the real writeAdultScript function; uses mocked limits so our test model names are used.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const MODEL_A = "adult-loop-a/model";
const MODEL_B = "adult-loop-b/model";

// Override adultScriptModels list via limits mock.
vi.mock("@/config/limits.json", () => ({
  default: {
    generationEnabled: true,
    spendCeilingUsd: 10,
    perIpPerDay: 6,
    globalPerDay: 150,
    maxWantChars: 280,
    maxScriptChars: 800,
    scriptMinLines: 2,
    scriptMinWords: 10,
    scriptModels: ["test-std-model"],
    scriptReasoningEffort: "low",
    scriptMaxTokens: 3000,
    scriptTimeoutMs: 10000,
    scriptTryTimeoutMs: 8000,
    vetModels: ["test-vet"],
    adultScriptModels: [MODEL_A, MODEL_B],
    adultTtsFallback: [],
    nameEveryWords: 50,
    nameMin: 5,
    nameMax: 8,
    minGapWords: 10,
  },
}));

// Stop the output gate from blocking the second model's good script.
vi.mock("@/lib/adult/outputGate", () => ({
  classifyScript: () => ({ verdict: "allow" }),
}));

const GOOD_LINES = [
  "You are whole and complete.",
  "You are calm and confident.",
  "You are strong and capable.",
  "You are loved and worthy.",
  "You are here and present.",
  "You are open and willing.",
  "You are clear and at ease.",
  "You are more than enough.",
  "You are free and at peace.",
  "You are exactly where you need to be.",
];

let server: Server;
const attempts: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url?.startsWith("/models")) {
      return res.end(JSON.stringify({ data: [{ id: MODEL_A }, { id: MODEL_B }] }));
    }
    if (req.url?.startsWith("/chat/completions")) {
      let body = "";
      req.on("data", (d: Buffer) => { body += d.toString(); });
      req.on("end", () => {
        const j = JSON.parse(body) as { model?: string };
        attempts.push(j.model ?? "?");
        const content = j.model === MODEL_A
          // Model A returns empty content → unusable_reply (fails cleanLines)
          ? ""
          : `${GOOD_LINES.join("\n")}\n\nRefrain: You are whole.`;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { cost: 0.001 } }));
      });
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${addr.port}`;
  process.env.OPENROUTER_API_KEY = "test-key";
});

afterAll(() => {
  server.close();
  delete process.env.OPENROUTER_BASE_URL;
  delete process.env.OPENROUTER_API_KEY;
});

beforeEach(() => { attempts.length = 0; });

describe("writeAdultScript — model fallback on unusable_reply (#281 F2)", () => {
  it("tries model B after model A returns unusable_reply", async () => {
    const { writeAdultScript } = await import("@/lib/server/writer");
    await writeAdultScript({
      key: "test",
      want: "I am calm and confident",
      name: "Tim",
      variant: 0,
      attemptId: "test-attempt-loop",
    });
    // Both models must have been tried.
    expect(attempts).toContain(MODEL_A);
    expect(attempts).toContain(MODEL_B);
    // Model A before model B.
    expect(attempts.indexOf(MODEL_A)).toBeLessThan(attempts.indexOf(MODEL_B));
  });

  it("returns ok:true with model B's script when model A is unusable", async () => {
    const { writeAdultScript } = await import("@/lib/server/writer");
    const result = await writeAdultScript({
      key: "test",
      want: "I am calm and confident",
      name: "Tim",
      variant: 0,
      attemptId: "test-attempt-ok",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.script.model).toBe(MODEL_B);
      expect(result.script.lines.length).toBeGreaterThan(0);
    }
  });
});
