// Translates the user's first-person wish into second-person present-tense
// statements for the "Your words" mode.
//
// The model receives the original sentences as a JSON array and returns a
// JSON object {"lines": [...], "title": "2-5 words"}.
// A fallback applies when the model is unavailable or its output fails
// the post-checks. The fallback uses the existing regex transforms, so the
// request never fails because the translation step failed.
import "server-only";
import examples from "@/config/translate-examples.json";
import { OPENROUTER } from "@/lib/server/openrouter";
import { firstToSecond, rewriteWant } from "@/lib/prompt";

export const TRANSLATE_VERSION = "translate-v1";

// The model that runs this step. Chosen from eval-translate.mjs: cheapest
// model that scores ≥95% on the 57-wish corpus.
export const TRANSLATE_MODEL = "meta-llama/llama-3.1-8b-instruct";

// Helper line shown under the "Your words" toggle in the UI.
export const YOUR_WORDS_HELPER = "Your words, spoken to you.";

// Function words that are allowed to appear in the output even when they were
// not in the input. Content words must overlap ≥80% between input and output.
const FUNCTION_WORDS = new Set([
  "you", "your", "yours", "yourself", "are", "have", "is", "am", "was", "were",
  "be", "been", "being", "the", "a", "an", "and", "or", "but", "with", "of",
  "in", "on", "to", "for", "by", "from", "at", "as", "not", "no", "it", "its",
  "this", "that", "these", "those", "there", "here", "do", "does", "did",
  "can", "could", "will", "would", "shall", "should", "may", "might", "must",
  "so", "if", "then", "when", "which", "who", "what", "how", "also", "just",
  "already", "now", "still", "ever", "never", "always", "us", "i",
]);

function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !FUNCTION_WORDS.has(w));
}

// Standard Levenshtein edit distance.
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
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

// Fuzzy word match:
// 1. Exact match.
// 2. Shared 4-char prefix — handles inflections (grow/grows, promote/promoted).
// 3. Edit distance ≤ 1 for words <7 chars, ≤ 2 for ≥7 chars — handles spelling
//    corrections (helthy/healthy, runn/run, yoi/you).
function wordMatches(outWord: string, inSet: Set<string>): boolean {
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

/**
 * Checks whether a translated output passes all post-translation rules.
 * Returns `{ ok: true }` or `{ ok: false, reason: string }`.
 * Run after the model replies; any failure triggers the regex fallback.
 *
 * The overlap check uses fuzzy word matching (prefix + edit distance) so
 * spelling corrections in the output are not flagged as new content.
 */
export function checkTranslation(
  inputSentences: string[],
  outputSentences: string[],
): { ok: boolean; reason?: string } {
  if (!Array.isArray(outputSentences) || outputSentences.some((s) => typeof s !== "string")) {
    return { ok: false, reason: "not_array" };
  }

  const outputText = outputSentences.join(" ");
  const inputText = inputSentences.join(" ");

  // No first-person speaker pronouns
  if (/\b(?:I|me|my|mine|myself)\b/.test(outputText)) {
    return { ok: false, reason: "first_person" };
  }

  // No future / wanting language
  if (/\b(?:want|wish|hope|going to|someday)\b/i.test(outputText)) {
    return { ok: false, reason: "future_language" };
  }

  // No thank-you phrases
  if (/\bthank\b/i.test(outputText)) {
    return { ok: false, reason: "thank_you" };
  }

  // Content word overlap ≥80%
  const inWords = new Set(contentWords(inputText));
  const outWords = contentWords(outputText);
  if (outWords.length > 0) {
    const matched = outWords.filter((w) => wordMatches(w, inWords)).length;
    if (matched / outWords.length < 0.8) {
      return { ok: false, reason: "new_content" };
    }
  }

  // Length ratio ≤1.3
  const inCount = inputText.split(/\s+/).filter(Boolean).length;
  const outCount = outputText.split(/\s+/).filter(Boolean).length;
  if (inCount > 0 && outCount / inCount > 1.3) {
    return { ok: false, reason: "too_long" };
  }

  return { ok: true };
}

/**
 * Regex fallback: applies want-rewrite and pronoun transforms to each
 * sentence. Mirrors the logic of `exactLines` without name placement.
 */
export function regexFallback(sentences: string[]): string[] {
  const stripped = sentences
    .map((s) => s.replace(/\b(?:thank\s+you|thank-you|thanks)[,!.?\s]*/gi, "").trim())
    .filter((s) => s.length > 1 && /\w/.test(s));
  const toUse = stripped.length ? stripped : sentences;
  return toUse.map((s) => firstToSecond(rewriteWant(s)));
}

function validateTitle(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.replace(/^["'`*_]+|["'`*_]+$/g, "").replace(/\s+/g, " ").trim();
  if (!t) return undefined;
  const words = t.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 5) return undefined;
  if (/[…]/.test(t) || /\.{2,}/.test(t)) return undefined;
  if (/^you\s+(are|have)\b/i.test(t)) return undefined;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function splitWish(want: string): string[] {
  const raw = want.trim();
  const parts = raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && /\w/.test(s));
  return parts.length ? parts : [raw];
}

function buildSystemPrompt(): string {
  const translationExamples = (examples as Array<{ input: string[]; output: string[] }>)
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
- 2 to 5 words: a noun phrase about the content of the translated lines.
- Do not start with "you are" or "you have".
- Do not use the first words of the first line as the title.
- No quotes, no ellipsis, no first name.

Full examples (input → output with title):
Input: ["I want a house."]
{"lines": ["You have a house."], "title": "Home of your own"}

Input: ["I want to be healthy."]
{"lines": ["You are healthy."], "title": "Strength and health"}

Input: ["I was promoted at work."]
{"lines": ["You are promoted at work."], "title": "Career advancement"}

Input: ["I want yoi to believe in me."]
{"lines": ["You believe in yourself."], "title": "Self-belief"}

Input: ["I want helth."]
{"lines": ["You have health."], "title": "Good health"}

Worked examples (translation only — the lines field):

${translationExamples}`;
}

// System prompt is built once at module load.
const SYSTEM_PROMPT = buildSystemPrompt();

type ParsedOutput = { lines: string[]; title?: string };

function parseModelOutput(content: string): ParsedOutput | null {
  const tryParse = (text: string): ParsedOutput | null => {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return { lines: parsed.filter((s): s is string => typeof s === "string") };
      }
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        if (Array.isArray(obj.lines)) {
          return {
            lines: (obj.lines as unknown[]).filter((s): s is string => typeof s === "string"),
            title: typeof obj.title === "string" ? obj.title : undefined,
          };
        }
        const vals = Object.values(obj);
        const arr = vals.find((v) => Array.isArray(v));
        if (arr) return { lines: (arr as unknown[]).filter((s): s is string => typeof s === "string") };
      }
      return null;
    } catch {
      return null;
    }
  };

  const direct = tryParse(content);
  if (direct) return direct;

  // Try JSON inside code fences
  const fenceMatch = /```(?:json)?\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*```/.exec(content);
  if (fenceMatch) {
    const r = tryParse(fenceMatch[1]);
    if (r) return r;
  }

  // Try bare JSON object or array in the content
  const objMatch = /(\{[\s\S]*"lines"[\s\S]*?\})/.exec(content);
  if (objMatch) {
    const r = tryParse(objMatch[1]);
    if (r) return r;
  }
  const arrMatch = /(\[[\s\S]*?\])/.exec(content);
  if (arrMatch) {
    const r = tryParse(arrMatch[1]);
    if (r) return r;
  }

  return null;
}

/**
 * Translates `want` from first-person to second-person present-tense lines,
 * and returns a 2–5 word title for the script.
 *
 * Returns `source: "model"` when the LLM succeeded and all post-checks passed;
 * `source: "fallback"` when the model was unavailable or the output failed a
 * check. The request never fails because translation failed.
 *
 * Time budget: 4 seconds (matches the design in issue 284).
 */
export async function translateWish(
  want: string,
  options: { key: string; model?: string; timeoutMs?: number },
): Promise<{ lines: string[]; source: "model" | "fallback"; title?: string }> {
  const { key, model = TRANSLATE_MODEL, timeoutMs = 4000 } = options;
  const sentences = splitWish(want);

  try {
    const res = await fetch(`${OPENROUTER}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://neville.app",
        "X-Title": "Neville Translate",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(sentences) },
        ],
        temperature: 0,
        max_tokens: 400,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      return { lines: regexFallback(sentences), source: "fallback" };
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? "";

    const parsed = parseModelOutput(content);
    if (!parsed) {
      return { lines: regexFallback(sentences), source: "fallback" };
    }

    const outputStrings = parsed.lines.filter((s) => s.trim().length > 0);
    if (outputStrings.length === 0) {
      return { lines: regexFallback(sentences), source: "fallback" };
    }

    const check = checkTranslation(sentences, outputStrings);
    if (!check.ok) {
      return { lines: regexFallback(sentences), source: "fallback" };
    }

    const title = validateTitle(parsed.title);
    return { lines: outputStrings, source: "model", ...(title ? { title } : {}) };
  } catch {
    return { lines: regexFallback(sentences), source: "fallback" };
  }
}
