// Old vs new script setup (#170): the same wishes through the setup before
// #170 (cheap model, short-line prompt) and the one in config/limits.json now.
// Checks rules (grammar slogans, sexual terms, length) and asks a judge model
// to score how visual the scene is and whether every sentence parses.
//
//   npm run eval:compare
//
// The key comes from OPENROUTER_API_KEY, or from the proxy in cloud sessions.
// Writes evals/scripts-compare.snapshot.md and prints a summary. Costs a few
// US cents: it reports the cost per script for each setup.
import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { writeScript, scriptModels } = await import("@/lib/server/writer");
const { OPENROUTER } = await import("@/lib/server/openrouter");
const prompt = await import("@/lib/prompt");
const { LEGACY_MAX_CHARS, LEGACY_MAX_TOKENS, LEGACY_MODEL, LEGACY_SYSTEM, legacyCleanLines } = await import("./legacy-setup");
const { default: limits } = await import("@/config/limits.json");

const { CLOSING, grammarIssue, sexualIn, wishAsksForIntimacy, wishMessage, splitRefrain } = prompt;
const KEY = process.env.OPENROUTER_API_KEY ?? "sk-or-proxy-injected";
const JUDGE_MODEL = "google/gemini-2.5-flash";

type Kind = "neutral" | "attraction" | "wealth" | "health" | "intimacy";
export const WISHES: Array<{ kind: Kind; wish: string }> = [
  { kind: "neutral", wish: "I want to own a small house by the sea" },
  { kind: "neutral", wish: "I want to heal my relationship with my sister" },
  { kind: "neutral", wish: "I want to finish writing my book" },
  { kind: "neutral", wish: "I want to feel calm and confident when I speak in public" },
  { kind: "neutral", wish: "I want to sleep deeply through the night" },
  { kind: "neutral", wish: "I want to run a marathon this year" },
  { kind: "attraction", wish: "I want women to approach me and show interest in me" },
  { kind: "attraction", wish: "I want women to find me attractive when I walk into a party" },
  { kind: "wealth", wish: "I want my business to reach $10k a month" },
  { kind: "wealth", wish: "I want to be debt free and have savings I never worry about" },
  { kind: "health", wish: "I want to be healthy, strong and full of energy" },
  { kind: "health", wish: "I want my back pain to be gone" },
  { kind: "intimacy", wish: "I want a deeply intimate, passionate evening with my wife" },
];

type Setup = "old" | "new";
type Row = {
  setup: Setup;
  kind: Kind;
  wish: string;
  lines: string[];
  source: string;
  model: string;
  costUsd: number | null;
  ms: number;
  words: number;
  grammar: string | null;
  sexual: string | null;
  visual?: number;
  parses?: number;
  tense?: number;
  why?: string;
};

type Chat = { choices?: Array<{ message?: { content?: string } }>; usage?: { cost?: number } };

async function chat(body: Record<string, unknown>): Promise<Chat> {
  const res = await fetch(`${OPENROUTER}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", "X-Title": "Neville eval" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  return (await res.json()) as Chat;
}

/** The setup before #170: old prompt, old model, old token limit, no reasoning flag, the old 700-character trim. */
async function old(wish: string): Promise<Pick<Row, "lines" | "source" | "model" | "costUsd" | "ms">> {
  const t0 = Date.now();
  const j = await chat({
    model: LEGACY_MODEL,
    max_tokens: LEGACY_MAX_TOKENS,
    temperature: 0.8,
    usage: { include: true },
    messages: [
      { role: "system", content: LEGACY_SYSTEM },
      { role: "user", content: wishMessage(wish, "", 0) },
    ],
  });
  const text = j.choices?.[0]?.message?.content;
  const parts = typeof text === "string" ? splitRefrain(text, wish) : null;
  // The old cleaner, as it was: the new slogan and sexual-term checks are measured on its output, not applied to it.
  const lines = parts ? legacyCleanLines(parts.script, LEGACY_MAX_CHARS, wish) : null;
  return { lines: lines ?? [], source: lines ? "model" : "unusable", model: LEGACY_MODEL, costUsd: j.usage?.cost ?? null, ms: Date.now() - t0 };
}

async function now(wish: string): Promise<Pick<Row, "lines" | "source" | "model" | "costUsd" | "ms">> {
  const t0 = Date.now();
  const s = await writeScript({ key: KEY, want: wish, name: "", variant: 0 });
  return { lines: s.lines, source: s.source, model: s.model ?? "template", costUsd: s.costUsd ?? null, ms: Date.now() - t0 };
}

async function judge(wish: string, lines: string[]): Promise<{ visual: number; parses: number; tense: number; why: string }> {
  const j = await chat({
    model: JUDGE_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'You grade a spoken affirmation script for a manifestation app. "visual": 2 if it builds a concrete scene with specific seen, heard and touched details (light, colour, sound, texture, how people look); 1 if it has a few images among abstractions; 0 if it is mostly slogans and abstractions. "parses": 2 if every sentence is grammatical and means something; 1 if one sentence is odd or empty; 0 if two or more are. "tense": the number of sentences in the past or future tense (the script must be present tense; the refrain and thanks lines do not count). Reply as JSON: {"visual": 0|1|2, "parses": 0|1|2, "tense": <count>, "why": "<15 words, name the worst sentence if any"}',
      },
      { role: "user", content: JSON.stringify({ wish, script: lines }) },
    ],
  });
  try {
    const v = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    return { visual: Number(v.visual) || 0, parses: Number(v.parses) || 0, tense: Number(v.tense) || 0, why: String(v.why ?? "") };
  } catch {
    return { visual: 0, parses: 0, tense: 0, why: "judge reply unreadable" };
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const usd = (n: number) => `$${n.toFixed(4)}`;

// Why any new script fell back to the template: the writer's own log line, which has numbers and names only.
const fallbacks: string[] = [];
const warn = console.warn;
console.warn = (...a: unknown[]) => {
  if (a[0] === "[script_fallback]") fallbacks.push(String(a[1]));
  else warn(...a);
};

describe("script setup, old vs new (#170)", async () => {
  const models = await scriptModels();
  const plan = WISHES.flatMap((w) => (["old", "new"] as const).map((setup) => ({ ...w, setup })));
  const rows: Row[] = await pool(plan, 3, async (c) => {
    const r = c.setup === "old" ? await old(c.wish) : await now(c.wish);
    const body = r.lines.filter((l) => l !== CLOSING);
    const j = r.source === "model" ? await judge(c.wish, body) : { visual: 0, parses: 0, tense: 0, why: r.source };
    return {
      ...c,
      ...r,
      words: r.lines.join(" ").split(/\s+/).filter(Boolean).length,
      grammar: grammarIssue(body),
      sexual: sexualIn(body, c.wish),
      ...j,
    };
  });

  const by = (s: Setup) => rows.filter((r) => r.setup === s);
  const table = (["old", "new"] as const)
    .map((s) => {
      const r = by(s);
      const ok = r.filter((x) => x.source === "model");
      return `| ${s} | ${s === "old" ? LEGACY_MODEL : models.join(", ")} | ${ok.length}/${r.length} | ${Math.round(avg(ok.map((x) => x.words)))} | ${avg(ok.map((x) => x.visual ?? 0)).toFixed(2)} | ${avg(ok.map((x) => x.parses ?? 0)).toFixed(2)} | ${ok.reduce((n, x) => n + (x.tense ?? 0), 0)} | ${ok.filter((x) => x.grammar).length} | ${ok.filter((x) => x.sexual).length} | ${usd(avg(r.map((x) => x.costUsd ?? 0)))} | ${(avg(r.map((x) => x.ms)) / 1000).toFixed(1)} s |`;
    })
    .join("\n");

  writeFileSync(
    "evals/scripts-compare.snapshot.md",
    `# Script setup, old vs new (#170)\n\nPrompt ${prompt.METHOD_VERSION}. Effort ${limits.scriptReasoningEffort}. Judge ${JUDGE_MODEL} (0 to 2). Regenerate with \`npm run eval:compare\`.\n\n` +
      `| setup | model | from model | words | visual | parses | tense slips | slogans | sexual terms | cost per script | time |\n|---|---|---|---|---|---|---|---|---|---|---|\n${table}\n\n` +
      (fallbacks.length ? `Template fallbacks in the new setup:\n\n${fallbacks.map((f) => `- \`${f}\``).join("\n")}\n\n` : "") +
      rows
        .map(
          (r) =>
            `## ${r.setup} · ${r.kind} · ${r.wish}\n\nmodel: ${r.model} · source: ${r.source} · ${r.words} words · ${usd(r.costUsd ?? 0)} · visual ${r.visual}/2 · parses ${r.parses}/2 · tense slips ${r.tense} (${r.why})${r.grammar ? ` · SLOGAN: ${r.grammar}` : ""}${r.sexual ? ` · SEXUAL: ${r.sexual}` : ""}\n\n${r.lines.map((l) => `> ${l}`).join("\n")}\n`,
        )
        .join("\n"),
  );
  console.log(`\n${table}\n`);

  const fresh = by("new");
  it("has at least 12 wishes, covering neutral, attraction, wealth, health and intimacy", () => {
    expect(WISHES.length).toBeGreaterThanOrEqual(12);
    for (const k of ["neutral", "attraction", "wealth", "health", "intimacy"] as Kind[]) expect(WISHES.some((w) => w.kind === k), k).toBe(true);
  });
  it("new scripts come from the model, not the template", () => {
    const fell = fresh.filter((r) => r.source !== "model").map((r) => r.wish);
    expect(fell.length, fell.join("\n")).toBeLessThanOrEqual(1);
  });
  it("a neutral wish never yields a sexual term", () => {
    const hits = fresh.filter((r) => !wishAsksForIntimacy(r.wish) && sexualIn(r.lines, r.wish));
    expect(hits.map((r) => `${r.wish}: ${sexualIn(r.lines, r.wish)}`)).toEqual([]);
    // Only the wish that names romance or intimacy may have sensual words.
    expect(WISHES.filter((w) => wishAsksForIntimacy(w.wish)).map((w) => w.wish)).toEqual(["I want a deeply intimate, passionate evening with my wife"]);
  });
  it("no new script has an explicit term, even when the wish asks for intimacy", () => {
    const explicit = fresh.filter((r) => sexualIn(r.lines, "I want an intimate romantic evening"));
    // Sensual words are fine here (the wish asked); explicit ones are not.
    const bad = explicit.filter((r) => /\b(?:nude|naked|breasts?|nipples?|genitals?|orgasm\w*|intercourse|sex\w*|erotic\w*)\b/i.test(r.lines.join(" ")));
    expect(bad.map((r) => r.wish)).toEqual([]);
  });
  it("no new script has a slogan or stacked abstract nouns", () => {
    expect(fresh.filter((r) => r.grammar).map((r) => `${r.wish}: ${r.grammar}`)).toEqual([]);
  });
  it("new scripts end on the closing line, are longer than the old cap, and short enough to record (npm run eval:audio)", () => {
    for (const r of fresh.filter((x) => x.source === "model")) {
      expect(r.lines.at(-1), r.wish).toBe(CLOSING);
      expect(r.words, r.wish).toBeGreaterThan(70);
      expect(r.lines.join(" ").length, r.wish).toBeLessThanOrEqual(limits.maxScriptChars);
    }
  });
  it("new scripts are at least as visual and as grammatical as the old ones, by the judge", () => {
    const m = (s: Setup, k: "visual" | "parses") => avg(by(s).filter((r) => r.source === "model").map((r) => r[k] ?? 0));
    expect(m("new", "visual")).toBeGreaterThanOrEqual(m("old", "visual"));
    expect(m("new", "parses")).toBeGreaterThanOrEqual(m("old", "parses"));
  });
  it("costs stay well under the spend ceiling", () => {
    const perScript = avg(fresh.map((r) => r.costUsd ?? 0));
    expect(perScript).toBeLessThan(limits.spendCeilingUsd / 50);
  });
});
