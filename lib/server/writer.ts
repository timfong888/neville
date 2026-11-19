// Writes the affirmation script with a cheap text model through OpenRouter.
// If the model is unavailable, slow or returns something unusable,
// a built-in neutral script is recorded instead, so a recording never fails
// for want of a script. That script uses none of the visitor's words.
import "server-only";
import limits from "@/config/limits.json";
import { OPENROUTER } from "@/lib/server/openrouter";
import { neutralScript } from "@/lib/script";
import { SYSTEM, cleanLines, wishMessage } from "@/lib/prompt";

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

/** The first configured model that OpenRouter lists; the first configured one if the list cannot be read. */
export async function scriptModel(): Promise<string> {
  const ids = await available();
  return limits.scriptModels.find((m) => !ids || ids.has(m)) ?? limits.scriptModels[0];
}

export type Script = { lines: string[]; source: "model" | "template"; model?: string };

export async function writeScript(opts: { key: string; want: string; name: string; variant: number }): Promise<Script> {
  // The fallback never repeats the wish: see neutralScript.
  const template = (): Script => ({ lines: neutralScript(opts.name), source: "template" });
  try {
    const model = await scriptModel();
    const res = await fetch(`${OPENROUTER}/chat/completions`, {
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
            content: wishMessage(opts.want, opts.name, opts.variant),
          },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return template();
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const text = json.choices?.[0]?.message?.content;
    const lines = typeof text === "string" ? cleanLines(text, limits.maxScriptChars) : null;
    return lines ? { lines, source: "model", model } : template();
  } catch {
    return template();
  }
}
