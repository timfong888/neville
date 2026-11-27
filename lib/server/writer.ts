// Writes the affirmation script with a cheap text model through OpenRouter.
// If the model is unavailable, slow or returns something unusable,
// a built-in neutral script is recorded instead, so a recording never fails
// for want of a script. That script uses none of the visitor's words.
import "server-only";
import limits from "@/config/limits.json";
import { OPENROUTER } from "@/lib/server/openrouter";
import { alertFailure } from "@/lib/server/alertFailure";
import { captureEvent } from "@/lib/server/telemetry";
import { neutralScript } from "@/lib/script";
import { DEFAULT_REFRAIN, SYSTEM, cleanLines, grammarIssue, sexualIn, splitRefrain, wishMessage, wishSexualisesMinor, wishSexualisesMinorCategory } from "@/lib/prompt";

type Catalog = { at: number; ids: Set<string> };
let catalog: Catalog | null = null;

async function available(): Promise<Set<string> | null> {
  if (catalog && Date.now() - catalog.at < 3_600_000) return catalog.ids;
  try {
    const res = await fetch(`${OPENROUTER}/models`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Array<{ id?: string }> };
    catalog = { at: Date.now(), ids: new Set((json.data ?? []).map((m) => m.id ?? "")) };
    return catalog.ids;
  } catch {
    return null;
  }
}

/** The models in `configured` that OpenRouter lists, in order; all of them if the list cannot be read. */
async function listed(configured: string[]): Promise<string[]> {
  const ids = await available();
  const found = configured.filter((m) => !ids || ids.has(m));
  return found.length ? found : configured;
}

/** The script models (config/limits.json scriptModels), best first. */
export function scriptModels(): Promise<string[]> {
  return listed(limits.scriptModels);
}

/** The cheap models that vet a listener's own script (config/limits.json vetModels). */
export function vetModels(): Promise<string[]> {
  return listed(limits.vetModels);
}

/** The refrain is spoken and looped too: it passes the same content guards as the script, or the default is used. */
function safeRefrain(refrain: string | null, wish: string): string {
  return refrain && !grammarIssue([refrain]) && !sexualIn([refrain], wish) ? refrain : DEFAULT_REFRAIN;
}

export type Script = {
  lines: string[];
  source: "model" | "template";
  model?: string;
  /** What OpenRouter charged for the reply, when it said. */
  costUsd?: number | null;
  /** A short phrase to repeat in programming mode (#77); the default one for the template. */
  refrain: string;
  /** Why the template was used; set when source is "template". */
  reason?: string;
};

/** Why the last try did not give a script. */
type Failure = { reason: "http_status" | "timeout" | "unusable_reply" | "exception" | "no_model" | "withheld"; status?: number; error?: string };

/** A timeout or abort is a timeout; anything else is an exception, named by class only. */
function classify(e: unknown): Failure {
  const name = e instanceof Error ? e.name : "unknown";
  return name === "TimeoutError" || name === "AbortError" ? { reason: "timeout" } : { reason: "exception", error: name };
}

export async function writeScript(opts: { key: string; want: string; name: string; variant: number; toneNote?: string }): Promise<Script> {
  const started = Date.now();
  // Where the last try got to, so a fallback can say why (#176).
  let attempt = 0;
  let model: string | undefined;
  let failure: Failure = { reason: "no_model" };
  // Billed so far across tries that gave no script, so the one that did reports the whole cost.
  let cost = 0;
  let priced = false;
  // The fallback never repeats the wish: see neutralScript. It logs one line
  // saying why, from numbers and names only: never the wish, the name, the
  // model's reply, an error message (some echo the body) or the key.
  const template = (extra: Record<string, unknown> = {}): Script => {
    console.warn("[script_fallback]", JSON.stringify({ ...failure, ...extra, model: model ?? null, attempt, elapsedMs: Date.now() - started }));
    if (failure.reason !== "withheld") {
      alertFailure("script_failed", { route: "manifest", reason: failure.reason, model: model ?? null, ...("status" in failure ? { status: failure.status } : {}), elapsedMs: Date.now() - started });
    } else {
      captureEvent("script_withheld", { route: "manifest" });
    }
    return { lines: neutralScript(opts.name), source: "template", reason: failure.reason, costUsd: priced ? cost : null, refrain: DEFAULT_REFRAIN };
  };
  // A romantic or sexual wish about someone under 18 is never sent to a model (#170).
  if (wishSexualisesMinor(opts.want)) {
    failure = { reason: "withheld" };
    const category = wishSexualisesMinorCategory(opts.want);
    return template(category ? { category } : {});
  }
  try {
    const models = await scriptModels();
    // Up to two tries within the time box (config/limits.json scriptTimeoutMs). A model that is rate-limited or down
    // (429, 5xx) hands over to the next configured model; a reply that is
    // unusable (too thin, or a stock phrase) is asked again for fresh wording.
    // The recording still needs the rest of the minute: the route allows 60 s.
    const deadline = Date.now() + limits.scriptTimeoutMs;
    let m = 0;
    // Bumped only after an unusable reply, so a handover after a rate limit
    // still asks for the version the listener chose.
    let variant = opts.variant;
    for (let i = 0; i < 2 && m < models.length; i++) {
      const left = deadline - Date.now();
      if (i > 0 && left < limits.scriptTimeoutMs / 5) break;
      attempt = i + 1;
      model = models[m];
      let res: Response;
      try {
        res = await fetch(`${OPENROUTER}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${opts.key}`, "Content-Type": "application/json", "X-Title": "Neville" },
          body: JSON.stringify({
            model,
            max_tokens: limits.scriptMaxTokens,
            temperature: 0.8,
            reasoning: { effort: limits.scriptReasoningEffort },
            usage: { include: true },
            messages: [
              { role: "system", content: SYSTEM },
              {
                role: "user",
                content: wishMessage(opts.want, opts.name, variant, opts.toneNote),
              },
            ],
          }),
          signal: AbortSignal.timeout(Math.min(limits.scriptTryTimeoutMs, left)),
        });
      } catch (e) {
        failure = classify(e);
        m++; // timed out or dropped: try the next model
        continue;
      }
      if (!res.ok) {
        failure = { reason: "http_status", status: res.status };
        if (res.status === 429 || res.status >= 500) {
          m++;
          continue;
        }
        return template();
      }
      let json: { choices?: Array<{ message?: { content?: unknown } }>; usage?: { cost?: unknown } };
      try {
        json = await res.json();
      } catch (e) {
        // The abort signal stays live while the body is read: a slow reply that
        // times out here hands over to the next model like one that never started.
        failure = classify(e);
        if (failure.reason !== "timeout") return template();
        m++;
        continue;
      }
      const text = json.choices?.[0]?.message?.content;
      const parts = typeof text === "string" ? splitRefrain(text, opts.want) : null;
      const lines = parts ? cleanLines(parts.script, limits.maxScriptChars, opts.want, { lines: limits.scriptMinLines, words: limits.scriptMinWords }) : null;
      if (typeof json.usage?.cost === "number") {
        cost += json.usage.cost;
        priced = true;
      }
      if (lines) return { lines, source: "model", model, costUsd: priced ? cost : null, refrain: safeRefrain(parts?.refrain ?? null, opts.want) };
      failure = { reason: "unusable_reply", status: res.status };
      variant++;
    }
    return template();
  } catch (e) {
    // The abort signal stays live while the body is read, so a timeout can surface here too.
    failure = classify(e);
    return template();
  }
}
