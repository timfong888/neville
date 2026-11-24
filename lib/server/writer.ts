// Writes the affirmation script with a cheap text model through OpenRouter.
// If the model is unavailable, slow or returns something unusable,
// a built-in neutral script is recorded instead, so a recording never fails
// for want of a script. That script uses none of the visitor's words.
import "server-only";
import limits from "@/config/limits.json";
import { OPENROUTER } from "@/lib/server/openrouter";
import { neutralScript } from "@/lib/script";
import { DEFAULT_REFRAIN, SYSTEM, cleanLines, splitRefrain, wishMessage } from "@/lib/prompt";

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

/** The configured models OpenRouter lists, in order; all of them if the list cannot be read. */
export async function scriptModels(): Promise<string[]> {
  const ids = await available();
  const listed = limits.scriptModels.filter((m) => !ids || ids.has(m));
  return listed.length ? listed : limits.scriptModels;
}

export type Script = {
  lines: string[];
  source: "model" | "template";
  model?: string;
  /** A short phrase to repeat in programming mode (#77); the default one for the template. */
  refrain: string;
};

export async function writeScript(opts: { key: string; want: string; name: string; variant: number; toneNote?: string }): Promise<Script> {
  // The fallback never repeats the wish: see neutralScript.
  const template = (): Script => ({ lines: neutralScript(opts.name), source: "template", refrain: DEFAULT_REFRAIN });
  try {
    const models = await scriptModels();
    // Up to two tries within the time box. A model that is rate-limited or down
    // (429, 5xx) hands over to the next configured model; a reply that is
    // unusable (too thin, or a stock phrase) is asked again for fresh wording.
    // The recording still needs most of the minute.
    const deadline = Date.now() + 14_000;
    let m = 0;
    // Bumped only after an unusable reply, so a handover after a rate limit
    // still asks for the version the listener chose.
    let variant = opts.variant;
    for (let attempt = 0; attempt < 2 && m < models.length; attempt++) {
      const left = deadline - Date.now();
      if (attempt > 0 && left < 4_000) break;
      const model = models[m];
      let res: Response;
      try {
        res = await fetch(`${OPENROUTER}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${opts.key}`, "Content-Type": "application/json", "X-Title": "Neville" },
          body: JSON.stringify({
            model,
            max_tokens: 400,
            temperature: 0.8,
            messages: [
              { role: "system", content: SYSTEM },
              {
                role: "user",
                content: wishMessage(opts.want, opts.name, variant, opts.toneNote),
              },
            ],
          }),
          signal: AbortSignal.timeout(Math.min(12_000, left)),
        });
      } catch {
        m++; // timed out or dropped: try the next model
        continue;
      }
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          m++;
          continue;
        }
        return template();
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
      const text = json.choices?.[0]?.message?.content;
      const parts = typeof text === "string" ? splitRefrain(text, opts.want) : null;
      const lines = parts ? cleanLines(parts.script, limits.maxScriptChars, opts.want) : null;
      if (lines) return { lines, source: "model", model, refrain: parts?.refrain ?? DEFAULT_REFRAIN };
      variant++;
    }
    return template();
  } catch {
    return template();
  }
}
