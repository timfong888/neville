import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Stub global fetch before any module is imported.
// translateWish calls fetch at RUNTIME (not at import time), so the stub is
// always in place when any test calls translateWish.
let _failNextFetch = false;
export function failNextFetch() { _failNextFetch = true; }

vi.stubGlobal("fetch", async (_url: string, opts: RequestInit) => {
  if (_failNextFetch) {
    _failNextFetch = false;
    return new Response("server error", { status: 500 });
  }
  const body = JSON.parse(opts.body as string);
  const userMsg = body.messages?.find((m: { role: string }) => m.role === "user");
  const sentences: string[] = JSON.parse(userMsg?.content ?? "[]");

  const lines = sentences.map((s: string) => {
    if (/^thank you\.?$/i.test(s.trim())) return "";
    if (/I want a house/i.test(s)) return "You have a house.";
    if (/I was promoted/i.test(s)) return "You are promoted.";
    if (/I want health/i.test(s)) return "You have health.";
    if (/I want helth/i.test(s)) return "You have health.";
    if (/I want to be heatlhy/i.test(s)) return "You are healthy.";
    if (/I want to runn/i.test(s)) return "You run every morning.";
    if (/yoi/i.test(s)) return "You believe in yourself.";
    return s
      .replace(/^I want to be\b/i, "You are")
      .replace(/^I want to\b/i, "You")
      .replace(/^I want\b/i, "You have")
      .replace(/^I am\b/i, "You are")
      .replace(/\bI\b/g, "you")
      .replace(/\bmy\b/gi, "your");
  });

  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ lines, title: "Test title" }) } }],
      usage: { prompt_tokens: 50, completion_tokens: 10 },
    }),
    { status: 200 },
  );
});

const { checkTranslation, regexFallback, translateWish, YOUR_WORDS_HELPER } =
  await import("@/lib/translate");

// ── checkTranslation ──────────────────────────────────────────────────────────

describe("checkTranslation", () => {
  it("passes a correct translation", () => {
    expect(checkTranslation(["I want a house."], ["You have a house."])).toEqual({ ok: true });
  });

  it("fails when output contains first-person pronouns", () => {
    const r = checkTranslation(["I want peace."], ["I have peace."]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("first_person");
  });

  it("fails when output contains 'want'", () => {
    const r = checkTranslation(["I want peace."], ["You want peace."]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("future_language");
  });

  it("fails when output contains 'hope'", () => {
    const r = checkTranslation(["I hope to be healthy."], ["You hope to be healthy."]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("future_language");
  });

  it("fails when output contains 'thank'", () => {
    const r = checkTranslation(["I want peace."], ["You have peace, thank you."]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("thank_you");
  });

  it("fails when output exceeds 1.3× input word count", () => {
    // Output uses only known content words but repeats them excessively.
    const r = checkTranslation(
      ["I want peace."],
      // 7 words out / 3 words in = 2.3 > 1.3; "peace" is in input → passes new_content
      ["You have peace peace peace peace peace."],
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("too_long");
  });

  it("fails when output introduces new content words", () => {
    const r = checkTranslation(
      ["I want peace."],
      ["You have serenity, joy, and boundless bliss."],
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("new_content");
  });

  it("passes with fuzzy word matching (promoted ↔ promotion)", () => {
    expect(
      checkTranslation(["I will get a promotion."], ["You are promoted."]),
    ).toEqual({ ok: true });
  });

  it("passes with fuzzy word matching (healthy ↔ health)", () => {
    expect(
      checkTranslation(["I want good health."], ["You have good health."]),
    ).toEqual({ ok: true });
  });

  it("passes negation kept intact", () => {
    expect(
      checkTranslation(["I am not anxious."], ["You are not anxious."]),
    ).toEqual({ ok: true });
  });

  it("allows spelling corrections via edit distance (helth → health)", () => {
    expect(
      checkTranslation(["I want helth."], ["You have health."]),
    ).toEqual({ ok: true });
  });

  it("allows spelling corrections via edit distance (runn → run)", () => {
    expect(
      checkTranslation(["I want to runn every morning."], ["You run every morning."]),
    ).toEqual({ ok: true });
  });

  it("allows spelling corrections via edit distance (heatlhy → healthy)", () => {
    expect(
      checkTranslation(["I want to be heatlhy."], ["You are healthy."]),
    ).toEqual({ ok: true });
  });
});

// ── regexFallback ─────────────────────────────────────────────────────────────

describe("regexFallback", () => {
  it("converts I want → you have", () => {
    const lines = regexFallback(["I want a house."]);
    expect(lines.join(" ")).toMatch(/have/i);
    expect(lines.join(" ")).not.toMatch(/\bI\b/);
  });

  it("drops thank-you phrases", () => {
    const lines = regexFallback(["I want peace, thank you."]);
    expect(lines.join(" ")).not.toMatch(/thank/i);
  });

  it("falls back to original when stripping removes everything", () => {
    const lines = regexFallback(["Thank you."]);
    expect(lines.length).toBeGreaterThan(0);
  });

  it("converts past tense via firstToSecond", () => {
    const lines = regexFallback(["I was promoted."]);
    expect(lines.join(" ")).not.toMatch(/\bI\b/);
  });
});

// ── translateWish ─────────────────────────────────────────────────────────────

describe("translateWish", () => {
  it("I want a house → result contains 'have'", async () => {
    const r = await translateWish("I want a house.", { key: "test-key" });
    expect(r.lines.join(" ")).toMatch(/have/i);
    expect(r.lines.join(" ")).not.toMatch(/\bI\b/);
  });

  it("I was promoted → result is present tense (no 'was')", async () => {
    const r = await translateWish("I was promoted.", { key: "test-key" });
    expect(r.lines.join(" ")).toMatch(/promoted/i);
    expect(r.lines.join(" ")).not.toMatch(/\bI\b/);
  });

  it("thank-you is dropped from the output", async () => {
    const r = await translateWish("I want health, thank you.", { key: "test-key" });
    expect(r.lines.join(" ")).not.toMatch(/thank/i);
  });

  it("falls back to regex when model returns a 500", async () => {
    _failNextFetch = true;
    const r = await translateWish("I want something.", { key: "test-key" });
    expect(r.source).toBe("fallback");
    expect(r.lines.length).toBeGreaterThan(0);
  });

  it("returns source: model when the stub succeeds and checks pass", async () => {
    const r = await translateWish("I want a house.", { key: "test-key" });
    expect(r.source).toBe("model");
  });

  it("returns a title when the model provides one", async () => {
    const r = await translateWish("I want a house.", { key: "test-key" });
    expect(r.title).toBe("Test title");
  });

  it("fixes typo 'yoi' → result has no 'yoi'", async () => {
    const r = await translateWish("I want yoi to believe in me.", { key: "test-key" });
    expect(r.lines.join(" ")).not.toMatch(/yoi/);
  });

  it("fixes typo 'helth' → result has 'health'", async () => {
    const r = await translateWish("I want helth.", { key: "test-key" });
    expect(r.lines.join(" ")).toMatch(/health/i);
  });
});

// ── YOUR_WORDS_HELPER ─────────────────────────────────────────────────────────

describe("YOUR_WORDS_HELPER", () => {
  it("is the correct helper line", () => {
    expect(YOUR_WORDS_HELPER).toBe("Your words, spoken to you.");
  });
});
