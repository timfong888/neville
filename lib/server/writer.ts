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
import { DEFAULT_REFRAIN, SYSTEM, cleanLines, grammarIssue, pronounTransform, rewriteWant, sexualIn, speakerFirstPersonIn, splitRefrain, splitTitle, thankYouIn, wishMessage, wishSexualisesFamilyRole, wishSexualisesMinor, wishSexualisesMinorCategory, wishSexualisesMinorRelaxed, withheldMinorTerm } from "@/lib/prompt";
import { scoreVividness, type NameOpts } from "@/lib/script/vividness";
import { classifyScript } from "@/lib/adult/outputGate";

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

/** The adult-tier script models (config/limits.json adultScriptModels), best first. */
export function adultScriptModels(): Promise<string[]> {
  const configured = (limits as unknown as { adultScriptModels?: string[] }).adultScriptModels ?? [];
  return listed(configured);
}

/** The cheap models that vet a listener's own script (config/limits.json vetModels). */
export function vetModels(): Promise<string[]> {
  return listed(limits.vetModels);
}

/** The refrain is spoken and looped too: it passes the same content guards as the script, or the default is used. */
function safeRefrain(refrain: string | null, wish: string): string {
  return refrain && !grammarIssue([refrain]) && !sexualIn([refrain], wish) && !thankYouIn([refrain]) ? refrain : DEFAULT_REFRAIN;
}

export type Script = {
  lines: string[];
  source: "model" | "template" | "exact";
  model?: string;
  /** What OpenRouter charged for the reply, when it said. */
  costUsd?: number | null;
  /** A short phrase to repeat in programming mode (#77); the default one for the template. */
  refrain: string;
  /** Why the template was used; set when source is "template". */
  reason?: string;
  /** 2–5 word noun phrase from the model; absent when missing or invalid, absent for templates. */
  title?: string;
  /** The minor word that caused a withheld result, for use in guidance text. Never the full wish. */
  term?: string;
};

/** Why the last try did not give a script. */
type Failure = { reason: "http_status" | "timeout" | "unusable_reply" | "exception" | "no_model" | "withheld"; status?: number; error?: string };

/** A timeout or abort is a timeout; anything else is an exception, named by class only. */
function classify(e: unknown): Failure {
  const name = e instanceof Error ? e.name : "unknown";
  return name === "TimeoutError" || name === "AbortError" ? { reason: "timeout" } : { reason: "exception", error: name };
}

/** Maps internal failure reasons to public reason codes for telemetry. */
function publicReason(f: Failure): string {
  if (f.reason === "withheld") return "filter_withheld";
  if (f.reason === "timeout") return "writer_timeout";
  if (f.reason === "http_status" && f.status === 429) return "writer_refused";
  return "writer_error";
}

export async function writeScript(opts: { key: string; want: string; name: string; variant: number; toneNote?: string; relaxed?: boolean; attemptId?: string; voiceId?: string; voiceModel?: string }): Promise<Script> {
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
    const code = publicReason(failure);
    console.warn("[script_fallback]", JSON.stringify({ ...failure, ...extra, model: model ?? null, attempt, elapsedMs: Date.now() - started, attempt_id: opts.attemptId ?? null }));
    if (failure.reason !== "withheld") {
      alertFailure("script_failed", { route: "manifest", reason: code, model: model ?? opts.voiceModel ?? null, ...("status" in failure ? { status: failure.status } : {}), elapsedMs: Date.now() - started, attempt_id: opts.attemptId, ...(opts.voiceId ? { voice: opts.voiceId } : {}) });
    } else {
      captureEvent("script_withheld", { route: "manifest", reason: code, attempt_id: opts.attemptId });
    }
    return { lines: neutralScript(opts.name), source: "template", reason: failure.reason, costUsd: priced ? cost : null, refrain: DEFAULT_REFRAIN };
  };
  // A romantic or sexual wish about someone under 18 is never sent to a model (#170).
  // Relaxed accounts use the narrower MINOR_CLEAR list; the check is never fully off.
  const withheld = opts.relaxed ? wishSexualisesMinorRelaxed(opts.want) : (wishSexualisesMinor(opts.want) || wishSexualisesFamilyRole(opts.want));
  if (withheld) {
    failure = { reason: "withheld" };
    const category = wishSexualisesMinorCategory(opts.want);
    const term = withheldMinorTerm(opts.want, opts.relaxed ?? false);
    const s = template({ ...(category ? { category } : {}), ...(opts.relaxed ? { tier: "relaxed" } : {}) });
    return term ? { ...s, term } : s;
  }
  // Rewrite want-language to present tense before the LLM sees the wish.
  // Safety checks always use the original opts.want.
  const rewrittenWant = rewriteWant(opts.want);
  const nameOpts: NameOpts | undefined = opts.name
    ? { nameMin: limits.nameMin, nameMax: limits.nameMax, minGapWords: limits.minGapWords }
    : undefined;
  // Vividness retry state: first passing-content script that failed vividness.
  let vividCandidate: Script | null = null;
  let vividReasons: string[] = [];
  let vividNote: string | undefined;
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
                content: wishMessage(rewrittenWant, opts.name, variant, vividNote ?? opts.toneNote),
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
      const titleParts = parts ? splitTitle(parts.script, opts.name) : null;
      let lines = titleParts ? cleanLines(titleParts.script, limits.maxScriptChars, opts.want, { lines: limits.scriptMinLines, words: limits.scriptMinWords }) : null;
      if (typeof json.usage?.cost === "number") {
        cost += json.usage.cost;
        priced = true;
      }
      if (lines) {
        // Post-check: no first-person speaker words, no thank-you phrases (#255).
        const fpIssue = speakerFirstPersonIn(lines);
        const tyIssue = thankYouIn(lines);
        if (fpIssue || tyIssue) {
          if (i === 0) {
            // First failure: regenerate once.
            failure = { reason: "unusable_reply", status: res.status };
            variant++;
            continue;
          }
          // Second failure: apply deterministic pronoun transform, strip remaining thank-you lines.
          const transformed = pronounTransform(lines);
          lines = transformed.filter(l => !thankYouIn([l]));
          if (!lines.length) {
            failure = { reason: "unusable_reply", status: res.status };
            break;
          }
        }
        const vr = scoreVividness(lines, opts.name, nameOpts);
        const result: Script = {
          lines,
          source: "model",
          model,
          costUsd: priced ? cost : null,
          refrain: safeRefrain(parts?.refrain ?? null, opts.want),
          ...(titleParts?.title ? { title: titleParts.title } : {}),
        };
        if (vr.pass) return result;
        if (!vividCandidate) {
          // First content-valid script failed vividness; retry once with reasons.
          vividCandidate = result;
          vividReasons = vr.reasons;
          vividNote = vr.reasons.join(",");
          console.log("[vividness_retry]", JSON.stringify({ reasons: vr.reasons }));
          failure = { reason: "unusable_reply", status: res.status };
          variant++;
          continue;
        }
        // Second attempt also failed; return the script with fewer issues.
        console.log("[vividness_second_fail]", JSON.stringify({ reasons: vr.reasons }));
        return vr.reasons.length <= vividReasons.length ? result : vividCandidate;
      }
      failure = { reason: "unusable_reply", status: res.status };
      variant++;
    }
    if (vividCandidate) return vividCandidate;
    return template();
  } catch (e) {
    // The abort signal stays live while the body is read, so a timeout can surface here too.
    failure = classify(e);
    return template();
  }
}

// Adult-tier system prompt addendum. Applied on top of SYSTEM when the user is on the
// adult tier. States all people as adults 21+ and permits explicit content between
// fictional consenting adults. Hard blocks (minors, real people, violence, non-consent,
// family roles, prohibited acts) are enforced by the input gate BEFORE this prompt runs.
const ADULT_ADDENDUM = `

Adult tier — additional rules (apply on top of all rules above):
- Every person in the scene is a fictional adult aged 21 or older. Never write anyone younger.
- State their age or write "adult" at least once per scene.
- You may write explicit sexual acts between consenting fictional adults.
- Enthusiastic, freely given consent is always present. Never imply otherwise.
- No real people, no likeness of a real person, no violence, no coercion.`;

const ADULT_SYSTEM = SYSTEM + ADULT_ADDENDUM;

export type AdultScriptResult =
  | { ok: true; script: Script }
  | { ok: false; reason: "output_gate" | "no_model"; category?: string };

/**
 * Write a script for an adult-tier wish. Applies the output gate before returning.
 * On gate refusal: logs verdict (category only, never content) and returns ok:false.
 * Falls back to ok:false/"no_model" when no adult model is configured.
 * Tries every model in adultScriptModels in order within the script time budget.
 */
export async function writeAdultScript(opts: { key: string; want: string; name: string; variant: number; attemptId?: string }): Promise<AdultScriptResult> {
  const models = await adultScriptModels();
  if (!models.length) return { ok: false, reason: "no_model" };

  const started = Date.now();
  let failure: Failure = { reason: "no_model" };
  let model: string | undefined;
  let cost = 0;
  let priced = false;

  const template = (): AdultScriptResult => {
    console.warn("[adult_script_fallback]", JSON.stringify({ reason: failure.reason, model: model ?? null, elapsedMs: Date.now() - started, attempt_id: opts.attemptId ?? null }));
    return { ok: false, reason: "no_model" };
  };

  try {
    const deadline = Date.now() + limits.scriptTimeoutMs;
    let variant = opts.variant;
    for (let m = 0; m < models.length; m++) {
      const left = deadline - Date.now();
      if (left < limits.scriptTimeoutMs / 10) break;
      model = models[m];
      const tryStart = Date.now();
      let res: Response;
      try {
        res = await fetch(`${OPENROUTER}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${opts.key}`, "Content-Type": "application/json", "X-Title": "Neville" },
          body: JSON.stringify({
            model,
            max_tokens: limits.scriptMaxTokens,
            temperature: 0.8,
            usage: { include: true },
            messages: [
              { role: "system", content: ADULT_SYSTEM },
              { role: "user", content: wishMessage(opts.want, opts.name, variant) },
            ],
          }),
          signal: AbortSignal.timeout(Math.min(limits.scriptTryTimeoutMs, left)),
        });
      } catch (e) {
        failure = classify(e);
        console.info("[adult_script_try]", JSON.stringify({ attempt_id: opts.attemptId ?? null, model, attempt: m + 1, outcome: failure.reason, ms: Date.now() - tryStart }));
        continue;
      }
      if (!res.ok) {
        failure = { reason: "http_status", status: res.status };
        console.info("[adult_script_try]", JSON.stringify({ attempt_id: opts.attemptId ?? null, model, attempt: m + 1, outcome: "http_status", status: res.status, ms: Date.now() - tryStart }));
        if (res.status === 429 || res.status >= 500) continue;
        return template();
      }
      let json: { choices?: Array<{ message?: { content?: unknown } }>; usage?: { cost?: unknown } };
      try { json = await res.json(); } catch (e) {
        failure = classify(e);
        console.info("[adult_script_try]", JSON.stringify({ attempt_id: opts.attemptId ?? null, model, attempt: m + 1, outcome: failure.reason, ms: Date.now() - tryStart }));
        if (failure.reason !== "timeout") return template();
        continue;
      }
      const text = json.choices?.[0]?.message?.content;
      const parts = typeof text === "string" ? splitRefrain(text, opts.want) : null;
      const titleParts = parts ? splitTitle(parts.script, opts.name) : null;
      // Adult scripts may contain explicit content: skip the sexualIn guard but keep
      // bannedIn (stock phrases) and grammarIssue. cleanLines still enforces length.
      const lines = titleParts
        ? cleanLines(titleParts.script, limits.maxScriptChars, opts.want, { lines: limits.scriptMinLines, words: limits.scriptMinWords })
        : null;
      if (typeof json.usage?.cost === "number") { cost += json.usage.cost; priced = true; }
      if (lines) {
        // Output gate: classify before speech. Any match → refuse, log verdict only.
        const verdict = classifyScript(lines);
        if (verdict.verdict === "refuse") {
          console.warn("[adult_output_gate]", JSON.stringify({ verdict: "refuse", category: verdict.category, model, elapsedMs: Date.now() - started, attempt_id: opts.attemptId ?? null }));
          return { ok: false, reason: "output_gate", category: verdict.category };
        }
        console.info("[adult_script_try]", JSON.stringify({ attempt_id: opts.attemptId ?? null, model, attempt: m + 1, outcome: "ok", ms: Date.now() - tryStart }));
        const script: Script = { lines, source: "model", model, costUsd: priced ? cost : null, refrain: DEFAULT_REFRAIN, ...(titleParts?.title ? { title: titleParts.title } : {}) };
        return { ok: true, script };
      }
      failure = { reason: "unusable_reply", status: res.status };
      console.info("[adult_script_try]", JSON.stringify({ attempt_id: opts.attemptId ?? null, model, attempt: m + 1, outcome: "unusable_reply", ms: Date.now() - tryStart }));
      variant++;
    }
    return template();
  } catch (e) {
    failure = classify(e);
    return template();
  }
}
