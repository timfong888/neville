// Script eval (#78): fixed wishes through the real script writer, checked by
// rules and by a model judge. Costs well under one US cent a run.
//
//   OPENROUTER_API_KEY=... npm run eval:scripts
//
// Writes evals/scripts.snapshot.md so a prompt change shows up as a diff.
import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { writeScript } = await import("@/lib/server/writer");
const { BANNED, METHOD_VERSION, bannedIn } = await import("@/lib/prompt");
const { TONES } = await import("@/lib/delivery");

const KEY = process.env.OPENROUTER_API_KEY ?? "sk-or-proxy-injected";
const CLOSING = "And so it is.";
const JUDGE_MODEL = "google/gemini-2.5-flash";

const WISHES = [
  "I want to own a small house by the sea",
  "I want my business to reach $10k a month",
  "I want to heal my relationship with my sister",
  "I want to feel calm and confident when I speak in public",
  "I want to run a marathon this year",
  "I want a loving partner who shares my faith",
  "I want to sleep deeply through the night",
  "I want to finish writing my book",
];
const TONE_IDS = ["calm", "energetic", "sleep"] as const;
const VARIANTS = [0, 1];

type Case = { wish: string; tone: string; variant: number; lines: string[]; source: string; judge?: number; why?: string };

async function judge(wish: string, lines: string[]): Promise<{ score: number; why: string }> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You grade a short spoken affirmation. Score 2 if it contains one specific moment that could only happen after the wish is already fulfilled, described from inside (the listener in it, feeling it), and it treats the wish as done, not in progress. Score 1 if only one of these holds. Score 0 if neither. Reply as JSON: {"score": 0|1|2, "why": "<12 words"}',
        },
        { role: "user", content: JSON.stringify({ wish, script: lines }) },
      ],
    }),
  });
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  try {
    const v = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    return { score: Number(v.score) || 0, why: String(v.why ?? "") };
  } catch {
    return { score: 0, why: "judge reply unreadable" };
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

const norm = (l: string) => l.toLowerCase().replace(/[^a-z ]/g, "").trim();

/** Body lines that are not the refrain (a line said twice or more) or the closing. */
function bodyLines(lines: string[]): string[] {
  const n = lines.map(norm);
  return n.filter((l, i) => lines[i] !== CLOSING && n.indexOf(l) === n.lastIndexOf(l));
}

/** Share of non-refrain lines two scripts have in common. The refrain may repeat: that is the point. */
function overlap(a: string[], b: string[]): number {
  const A = new Set(bodyLines(a));
  const B = bodyLines(b);
  return B.filter((l) => A.has(l)).length / Math.max(1, Math.min(A.size, B.length));
}

describe(`script eval (${METHOD_VERSION})`, async () => {
  const plan = WISHES.flatMap((wish) => TONE_IDS.flatMap((tone) => VARIANTS.map((variant) => ({ wish, tone, variant }))));
  const cases: Case[] = await pool(plan, 3, async (c) => {
    const toneNote = TONES.find((t) => t.id === c.tone)?.scriptNote;
    const s = await writeScript({ key: KEY, want: c.wish, name: "", variant: c.variant, toneNote });
    const j = s.source === "model" ? await judge(c.wish, s.lines) : { score: 0, why: "template" };
    return { ...c, lines: s.lines, source: s.source, judge: j.score, why: j.why };
  });

  writeFileSync(
    "evals/scripts.snapshot.md",
    `# Script eval snapshot\n\nPrompt ${METHOD_VERSION}. Judge ${JUDGE_MODEL}. Regenerate with \`npm run eval:scripts\`.\n\n` +
      cases
        .map((c) => `## ${c.wish} · ${c.tone} · v${c.variant + 1}\n\nsource: ${c.source} · judge: ${c.judge}/2 (${c.why})\n\n${c.lines.map((l) => `> ${l}`).join("\n")}\n`)
        .join("\n"),
  );

  // A rate-limited provider can push one script to the template; more than one is a real problem.
  it("scripts come from the model, not the template", () => {
    const fell = cases.filter((c) => c.source !== "model").map((c) => `${c.wish}/${c.tone}/v${c.variant + 1}`);
    expect(fell.length, fell.join("\n")).toBeLessThanOrEqual(1);
  });
  const model = cases.filter((c) => c.source === "model");
  it("no banned phrase", () => {
    expect(model.map((c) => bannedIn(c.lines)).filter(Boolean)).toEqual([]);
    expect(BANNED.length).toBeGreaterThan(0);
  });
  it("ends with the closing line, at the right length", () => {
    for (const c of cases) {
      expect(c.lines.at(-1)).toBe(CLOSING);
      expect(c.lines.length).toBeGreaterThanOrEqual(9);
      expect(c.lines.length).toBeLessThanOrEqual(14);
    }
  });
  it("the wish is never on its way", () => {
    // "You are crossing the finish line now" is the moment itself, here and now:
    // fine. Verbs of getting there are what Lesson 1 rules out.
    const onTheWay = /\b(?:is|are)\s+(?:becoming|reaching|healing|growing|building|getting|improving|approaching|working toward|moving toward|on (?:the|your) way)\b/i;
    const hits = model.flatMap((c) => c.lines.filter((l) => onTheWay.test(l)).map((l) => `${c.wish}/${c.tone}: ${l}`));
    expect(hits, hits.join("\n")).toEqual([]);
  });
  it("two versions of the same wish do not repeat each other", () => {
    for (const wish of WISHES) for (const tone of TONE_IDS) {
      const [a, b] = VARIANTS.map((v) => cases.find((c) => c.wish === wish && c.tone === tone && c.variant === v)!);
      expect(overlap(a.lines, b.lines), `${wish}/${tone}`).toBeLessThanOrEqual(0.3);
    }
  });
  it("almost every script has a moment that implies the wish is done, felt from inside", () => {
    const weak = model.filter((c) => (c.judge ?? 0) < 2).map((c) => `${c.wish}/${c.tone}/v${c.variant + 1}: ${c.why}`);
    expect(weak.length, weak.join("\n")).toBeLessThanOrEqual(4); // under 10 % of 48
  });
});
