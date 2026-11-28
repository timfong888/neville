// Evaluates the translate prompt against two OpenRouter models on a 40-wish corpus.
// Reports automated check results and a second-model judge verdict per wish.
// Picks the cheapest model that scores ≥95%.
//
// Usage:
//   OPENROUTER_API_KEY=... node scripts/eval-translate.mjs
//   OPENROUTER_API_KEY=... node scripts/eval-translate.mjs --dry   (skips API calls, uses fake output)
//
// Output: a Markdown table suitable for the PR description.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY = process.env.OPENROUTER_API_KEY;
const API = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const DRY = process.argv.includes("--dry");

if (!DRY && !KEY) {
  console.error("OPENROUTER_API_KEY is required. Run with --dry to skip API calls.");
  process.exit(1);
}

const examples = JSON.parse(
  readFileSync(join(__dirname, "../config/translate-examples.json"), "utf8"),
);

// ── Models ───────────────────────────────────────────────────────────────────

const MODELS = [
  {
    id: "meta-llama/llama-3.1-8b-instruct",
    label: "llama-3.1-8b-instruct",
    // OpenRouter pricing as of 2026-11-28 ($/1M tokens)
    priceIn: 0.06,
    priceOut: 0.06,
  },
  {
    id: "openai/gpt-4o-mini",
    label: "gpt-4o-mini",
    priceIn: 0.15,
    priceOut: 0.60,
  },
];

const JUDGE_MODEL = "openai/gpt-4o-mini";

// ── Corpus (40+ wishes, covering all edge cases from issue 284) ───────────────

const CORPUS = [
  // Core want → have/are
  "I want a house.",
  "I want more money.",
  "I want a good job.",
  "I want to have a baby.",
  "I want to be healthy.",
  "I want to be a successful writer.",
  "I want to feel calm.",
  "I want to be a loving father.",
  // Want → verb
  "I want to travel to Japan.",
  "I want to run a marathon.",
  // Hope / will / going to
  "I hope to find love.",
  "I will get a promotion.",
  "I am going to run a marathon.",
  "I am going to become a doctor.",
  // Hedge words
  "Maybe I'll find a good partner someday.",
  "I am trying to lose weight.",
  "I hope to try meditation.",
  // Past tense → present
  "I was promoted at work.",
  "I got my dream job.",
  // Negation and lack
  "I don't have enough money.",
  "I lack confidence.",
  "I am not anxious.",
  // Grammar fixes
  "My wife and I want a vacation.",
  "I did it myself.",
  "This success is mine.",
  // Question
  "Will I ever be healthy?",
  // List
  "I want good health, wealth, and happiness.",
  // Very short
  "I want peace.",
  // Already second person
  "You are healthy and strong.",
  // With thanks
  "I want health, thank you.",
  "I want a calm house, thank you.",
  // First name inside wish
  "I want to meet Sarah at the park.",
  // Mixed language
  "I want to be happy, con mucho amor.",
  // Multi-sentence
  "I want a house. I want to be healthy.",
  // Other realistic wishes
  "I want my business to grow.",
  "I want to fix my relationship.",
  "I wish I could sleep better.",
  "I am calm and confident.",
  "I have a loving family.",
  "I am going to open my own business.",
  "I want to be promoted at work.",
  "I want good health and a loving relationship.",
  // Tricky / edge cases
  "I want a calm house.",
  "I want to feel safe.",
  "I want to earn $100,000 this year.",
  "I want to live in Paris.",
  "I want to have a great friendship with James.",
  // Spelling / typo cases (issue 284 comment)
  "I want yoi to believe in me.",
  "I want to runn every morning.",
  "I want to visit Paries with my family.",
  "I want to be suuccessful.",
  "I want to be heatlhy.",
  "I want helth.",
  // Keep-rare-word cases
  "I want to master Qi Gong.",
  "I want to live in Oaxaca.",
  "I want to learn Python.",
  "I want to understand Wabi-sabi.",
];

// ── Post-checks (mirrors lib/translate.ts) ────────────────────────────────────

const FUNCTION_WORDS = new Set([
  "you", "your", "yours", "yourself", "are", "have", "is", "am", "was", "were",
  "be", "been", "being", "the", "a", "an", "and", "or", "but", "with", "of",
  "in", "on", "to", "for", "by", "from", "at", "as", "not", "no", "it", "its",
  "this", "that", "these", "those", "there", "here", "do", "does", "did",
  "can", "could", "will", "would", "shall", "should", "may", "might", "must",
  "so", "if", "then", "when", "which", "who", "what", "how", "also", "just",
  "already", "now", "still", "ever", "never", "always", "us", "i",
]);

function contentWords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !FUNCTION_WORDS.has(w));
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function wordMatches(outWord, inSet) {
  if (inSet.has(outWord)) return true;
  if (outWord.length < 3) return false;
  if (outWord.length >= 4) {
    const p = outWord.slice(0, 4);
    for (const w of inSet) {
      if (w.length >= 4 && w.slice(0, 4) === p) return true;
    }
  }
  for (const w of inSet) {
    if (w.length < 3) continue;
    if (Math.abs(outWord.length - w.length) > 2) continue;
    const maxDist = Math.max(outWord.length, w.length) >= 7 ? 2 : 1;
    if (editDistance(outWord, w) <= maxDist) return true;
  }
  return false;
}

function checkTranslation(inputSentences, outputSentences) {
  if (!Array.isArray(outputSentences) || outputSentences.some((s) => typeof s !== "string")) {
    return { ok: false, reason: "not_array" };
  }
  const outputText = outputSentences.join(" ");
  const inputText = inputSentences.join(" ");

  if (/\b(?:I|me|my|mine|myself)\b/.test(outputText)) {
    return { ok: false, reason: "first_person" };
  }
  if (/\b(?:want|wish|hope|going to|someday)\b/i.test(outputText)) {
    return { ok: false, reason: "future_language" };
  }
  if (/\bthank\b/i.test(outputText)) {
    return { ok: false, reason: "thank_you" };
  }

  const inWords = new Set(contentWords(inputText));
  const outWords = contentWords(outputText);
  if (outWords.length > 0) {
    const matched = outWords.filter((w) => wordMatches(w, inWords)).length;
    if (matched / outWords.length < 0.8) {
      return { ok: false, reason: "new_content" };
    }
  }

  const inCount = inputText.split(/\s+/).filter(Boolean).length;
  const outCount = outputText.split(/\s+/).filter(Boolean).length;
  if (inCount > 0 && outCount / inCount > 1.3) {
    return { ok: false, reason: "too_long" };
  }

  return { ok: true };
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildSystemPrompt() {
  const translationExamples = examples
    .map((e) => `Input: ${JSON.stringify(e.input)}\nOutput lines: ${JSON.stringify(e.output)}`)
    .join("\n\n");

  return `You translate first-person affirmations into second-person present-tense statements for a hypnosis app.

The user sends a JSON array of strings — their own sentences. Return a JSON object in this exact format:
{"lines": ["translated sentence 1", "translated sentence 2"], "title": "2 to 5 word title"}

No other text, no explanation, no markdown, no code fences.

If a sentence contains only a thank-you phrase and nothing else, return an empty string "" for that position in lines.

Translation rules:
1. Speak to the listener as "you". Never use "I", "me", "my", "mine" or "myself" in any output sentence.
2. Present tense, already true. Never "you will", "you want", "you hope", "you wish", "you are going to", "someday", "try" or "maybe".
3. Use only the user's own words. Add no new scenes, adjectives, senses or people. Allowed additions: grammatical function words only (you, your, are, have, is, the, a, an, and, with, of, in, on, to, not).
4. Turn wants, hopes, plans and "going to":
   - For things the user wants → "you have [thing]"
   - For states or qualities → "you are [state]"
   - For actions → "you [verb]"
5. Lacks: "I don't have X" or "I lack X" → "you have X". "I am not X" → "you are not X" — keep the negation; never invent a positive the user did not name.
6. Drop thank-you phrases ("thank you", "thanks", "thank-you"). If the sentence contains only thanks, return "".
7. Drop hedges: "maybe", "try", "someday", "one day", and similar future-doubt words.
8. Fix grammar after pronoun changes: "my wife and I" → "you and your wife"; "I was promoted" → "you are promoted".
9. Keep names, numbers, foreign words, technical terms and proper nouns unchanged.
10. At most 1.3 times the word count of the input sentence.
11. Already second-person input ("you are…"): keep it as is.
12. Fix obvious typos and spelling errors — the user may have typed "yoi" for "you", "helathy" for "healthy", "runn" for "run". Correct the intended word. Do not change rare words, proper nouns or foreign terms that appear intentional.

Title rules:
- 2 to 5 words: a noun phrase about the content.
- Do not start with "you are" or "you have".
- Do not use the first words of the first line as the title.

Full examples (input → output with title):
Input: ["I want a house."]
{"lines": ["You have a house."], "title": "Home of your own"}

Input: ["I want to be healthy."]
{"lines": ["You are healthy."], "title": "Strength and health"}

Input: ["I want yoi to believe in me."]
{"lines": ["You believe in yourself."], "title": "Self-belief"}

Input: ["I want helth."]
{"lines": ["You have health."], "title": "Good health"}

Worked examples (translation only — the lines field):

${translationExamples}`;
}

const SYSTEM_PROMPT = buildSystemPrompt();

// ── Judge prompt ──────────────────────────────────────────────────────────────

function judgePrompt(input, output) {
  return `You are a strict evaluator for a hypnosis affirmation translator.

The translator receives a user's first-person wish and must return a second-person present-tense statement that:
- Uses "you" (not "I", "me", "my", "mine", "myself")
- Is in present tense (not "you will", "you want", "you hope", "you are going to", "someday")
- Contains no thank-you phrases
- Uses only the user's own content words (no invented adjectives, scenes, or people)
- Is at most 1.3x the word count of the input
- May silently fix obvious typos ("yoi" → "you", "helth" → "health", "runn" → "run"). This is allowed and expected.

Input (original wish): ${JSON.stringify(input)}
Output (translated): ${JSON.stringify(output)}

Reply with exactly one line:
PASS — if all rules are met
FAIL: [one-line reason] — if any rule is broken`;
}

// ── API calls ─────────────────────────────────────────────────────────────────

function splitWish(want) {
  const raw = want.trim();
  const parts = raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && /\w/.test(s));
  return parts.length ? parts : [raw];
}

function parseModelOutput(content) {
  const tryParse = (text) => {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return { lines: parsed.filter((s) => typeof s === "string") };
      if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.lines)) {
          return {
            lines: parsed.lines.filter((s) => typeof s === "string"),
            title: typeof parsed.title === "string" ? parsed.title : undefined,
          };
        }
        const arr = Object.values(parsed).find(Array.isArray);
        if (arr) return { lines: arr.filter((s) => typeof s === "string") };
      }
      return null;
    } catch { return null; }
  };
  const direct = tryParse(content);
  if (direct) return direct;
  const fenceMatch = /```(?:json)?\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/.exec(content);
  if (fenceMatch) { const r = tryParse(fenceMatch[1]); if (r) return r; }
  const objMatch = /(\{[\s\S]*?"lines"[\s\S]*?\})/.exec(content);
  if (objMatch) { const r = tryParse(objMatch[1]); if (r) return r; }
  const arrMatch = /(\[[\s\S]*?\])/.exec(content);
  if (arrMatch) { const r = tryParse(arrMatch[1]); if (r) return r; }
  return null;
}

async function callModel(model, messages, maxTokens = 400) {
  if (DRY) return { content: '["You have a house."]', promptTokens: 100, completionTokens: 10 };
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://neville.app",
      "X-Title": "Neville Eval",
    },
    body: JSON.stringify({ model, messages, temperature: 0, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "";
  const usage = json.usage ?? {};
  return {
    content,
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Eval runner ───────────────────────────────────────────────────────────────

async function evalModel(model) {
  const results = [];
  let totalPromptTok = 0;
  let totalCompletionTok = 0;

  for (let i = 0; i < CORPUS.length; i++) {
    const wish = CORPUS[i];
    const sentences = splitWish(wish);

    // Translate call
    let parsed = null;
    let translateErr = null;
    let promptTok = 0;
    let completionTok = 0;
    try {
      const r = await callModel(
        model.id,
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(sentences) },
        ],
        400,
      );
      promptTok = r.promptTokens;
      completionTok = r.completionTokens;
      totalPromptTok += promptTok;
      totalCompletionTok += completionTok;
      parsed = parseModelOutput(r.content);
    } catch (e) {
      translateErr = e.message;
    }

    const outputStrings = parsed ? parsed.lines.filter((s) => s.trim().length > 0) : [];
    const titleOk = parsed?.title ? /^\S+(\s+\S+){1,4}$/.test(parsed.title.trim()) && !/^you\s+(are|have)\b/i.test(parsed.title) : false;
    const autoCheck = outputStrings.length > 0
      ? checkTranslation(sentences, outputStrings)
      : { ok: false, reason: translateErr ?? "empty_output" };

    // Judge call (only when automated checks passed)
    let judgeVerdict = "SKIP";
    let judgeReason = "";
    if (autoCheck.ok) {
      try {
        const judgeRes = await callModel(
          JUDGE_MODEL,
          [{ role: "user", content: judgePrompt(wish, outputStrings.join(" ")) }],
          80,
        );
        totalPromptTok += judgeRes.promptTokens;
        totalCompletionTok += judgeRes.completionTokens;
        const jLine = judgeRes.content.trim().split("\n")[0] ?? "";
        if (jLine.startsWith("PASS")) {
          judgeVerdict = "PASS";
        } else {
          judgeVerdict = "FAIL";
          judgeReason = jLine.replace(/^FAIL[:\s]*/i, "").trim();
        }
      } catch (e) {
        judgeVerdict = "ERR";
        judgeReason = e.message;
      }
    } else {
      judgeVerdict = "AUTO_FAIL";
      judgeReason = autoCheck.reason ?? "";
    }

    const pass = autoCheck.ok && judgeVerdict === "PASS";

    results.push({
      wish,
      output: outputStrings.join(" "),
      title: parsed?.title ?? "",
      titleOk,
      autoOk: autoCheck.ok,
      autoReason: autoCheck.reason ?? "",
      judgeVerdict,
      judgeReason,
      pass,
    });

    process.stdout.write(`  [${i + 1}/${CORPUS.length}] ${pass ? "✓" : "✗"}  ${wish.slice(0, 50)}\n`);

    if (!DRY && i < CORPUS.length - 1) await sleep(300); // gentle rate limiting
  }

  const passCount = results.filter((r) => r.pass).length;
  const autoPassCount = results.filter((r) => r.autoOk).length;
  const judgePassCount = results.filter((r) => r.judgeVerdict === "PASS").length;
  const titlePassCount = results.filter((r) => r.titleOk).length;
  const passRate = passCount / results.length;
  const titlePassRate = titlePassCount / results.length;

  // Cost estimate
  const costIn = (totalPromptTok / 1_000_000) * model.priceIn;
  const costOut = (totalCompletionTok / 1_000_000) * model.priceOut;
  const totalCost = costIn + costOut;
  const costPerCall = totalCost / CORPUS.length;

  return { results, passCount, autoPassCount, judgePassCount, titlePassCount, passRate, titlePassRate, costPerCall, totalCost };
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\nNeville translate eval — ${CORPUS.length} wishes, ${MODELS.length} models\n`);

const allResults = [];

for (const model of MODELS) {
  console.log(`\n▶ ${model.label} (${model.id})`);
  const r = await evalModel(model);
  allResults.push({ model, ...r });
  console.log(`  Pass: ${r.passCount}/${CORPUS.length} (${(r.passRate * 100).toFixed(1)}%) | Title: ${r.titlePassCount}/${CORPUS.length} (${(r.titlePassRate * 100).toFixed(1)}%) | $/call: $${r.costPerCall.toFixed(5)}`);
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log("\n\n## Eval table\n");
console.log("| Model | Wishes | Auto-pass | Judge-pass | Title-pass | Total-pass | Pass% | $/call | Recommended |");
console.log("|-------|--------|-----------|------------|------------|------------|-------|--------|-------------|");

// Pick cheapest model at ≥95%
const passing = allResults.filter((r) => r.passRate >= 0.95);
passing.sort((a, b) => a.costPerCall - b.costPerCall);
const chosen = passing[0];

for (const r of allResults) {
  const rec = r === chosen ? "✅ chosen" : "";
  console.log(
    `| ${r.model.label} | ${CORPUS.length} | ${r.autoPassCount} | ${r.judgePassCount} | ${r.titlePassCount} | ${r.passCount} | ${(r.passRate * 100).toFixed(1)}% | $${r.costPerCall.toFixed(5)} | ${rec} |`,
  );
}

if (chosen) {
  console.log(`\nChosen model: **${chosen.model.id}** (${(chosen.passRate * 100).toFixed(1)}% pass rate, $${chosen.costPerCall.toFixed(5)}/call)`);
} else {
  console.log("\n⚠️  No model reached 95% pass rate. Refine the prompt and re-run.");
}

// ── Failures detail ───────────────────────────────────────────────────────────

for (const r of allResults) {
  const failures = r.results.filter((res) => !res.pass);
  if (failures.length === 0) continue;
  console.log(`\n### ${r.model.label} failures (${failures.length})\n`);
  for (const f of failures) {
    const reason = f.autoOk ? `judge: ${f.judgeReason}` : `auto: ${f.autoReason}`;
    console.log(`- **"${f.wish}"** → "${f.output}" (${reason})`);
  }
}
