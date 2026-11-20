// Expands a one-line wish into settle, scene and closing with a text model
// through OpenRouter. Text only: no audio is made here, so nothing is spent on
// a voice until the person has read and accepted the words.
// Unlike writeScript there is no template fallback: a generic script would
// ignore the person's wish, so a failure is reported instead.
import "server-only";
import limits from "@/config/limits.json";
import { OPENROUTER } from "@/lib/server/openrouter";
import { EXPAND_SYSTEM, type Expansion, expandMessage, parseExpansion } from "@/lib/expand";

export type Expanded =
  | { ok: true; expansion: Expansion; model: string; costUsd: number | null }
  | { ok: false; reason: "unusable" | "unavailable"; model?: string; costUsd: number | null };

export async function expandWish(opts: {
  key: string;
  want: string;
  name: string;
  feel?: string;
  draft?: Pick<Expansion, "settle" | "scene" | "closing">;
  richer?: boolean;
}): Promise<Expanded> {
  let costUsd: number | null = null;
  for (const model of limits.expandModels) {
    try {
      const res = await fetch(`${OPENROUTER}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.key}`, "Content-Type": "application/json", "X-Title": "Neville" },
        body: JSON.stringify({
          model,
          // Room for the three parts plus the lists. Hidden reasoning is off: on a
          // reasoning model it ate the budget and cut the JSON off.
          max_tokens: 1500,
          reasoning: { enabled: false },
          temperature: opts.richer ? 0.9 : 0.8,
          usage: { include: true },
          messages: [
            { role: "system", content: EXPAND_SYSTEM },
            { role: "user", content: expandMessage(opts) },
          ],
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) continue; // try the next configured model
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: { cost?: unknown };
      };
      const c = typeof json.usage?.cost === "number" ? json.usage.cost : null;
      if (c !== null) costUsd = (costUsd ?? 0) + c;
      const expansion = parseExpansion(json.choices?.[0]?.message?.content);
      if (expansion) return { ok: true, expansion, model, costUsd };
      return { ok: false, reason: "unusable", model, costUsd };
    } catch {
      /* try the next configured model */
    }
  }
  return { ok: false, reason: "unavailable", costUsd };
}
