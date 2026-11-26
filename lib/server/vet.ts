// Asks the cheap text model whether a person's own script is fine to record.
// Fails closed: no answer means no recording.
import "server-only";
import { OPENROUTER } from "@/lib/server/openrouter";
import { vetModels } from "@/lib/server/writer";
import { VET_SYSTEM, verdict } from "@/lib/rerecord";

export type Vet =
  | { ok: true; model: string; costUsd: number | null }
  | { ok: false; reason: "rejected"; model: string; costUsd: number | null }
  | { ok: false; reason: "empty"; model: string; costUsd: number | null }
  | { ok: false; reason: "unavailable" };

export async function vetScript(key: string, lines: string[]): Promise<Vet> {
  let models: string[];
  try {
    models = await vetModels();
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  // A model that is rate-limited or down (429, 5xx, no answer in time) hands
  // over to the next configured one, at most two, within about 12 s in all.
  const deadline = Date.now() + 12_000;
  for (const model of models.slice(0, 2)) {
    const left = deadline - Date.now();
    if (left < 2_000) break;
    let res: Response;
    try {
      res = await fetch(`${OPENROUTER}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Neville" },
        body: JSON.stringify({
          model,
          max_tokens: 3,
          temperature: 0,
          usage: { include: true },
          messages: [
            { role: "system", content: VET_SYSTEM },
            { role: "user", content: JSON.stringify({ lines }) },
          ],
        }),
        signal: AbortSignal.timeout(Math.min(10_000, left)),
      });
    } catch {
      continue;
    }
    if (res.status === 429 || res.status >= 500) continue;
    if (!res.ok) return { ok: false, reason: "unavailable" };
    try {
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: { cost?: unknown };
      };
      const reply = json.choices?.[0]?.message?.content;
      const costUsd = typeof json.usage?.cost === "number" ? json.usage.cost : null;
      // Answered but said nothing usable: billed, so the caller records it, and
      // treated like a refusal so nothing is recorded in a voice.
      if (typeof reply !== "string") return { ok: false, reason: "empty", model, costUsd };
      return verdict(reply) ? { ok: true, model, costUsd } : { ok: false, reason: "rejected", model, costUsd };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }
  return { ok: false, reason: "unavailable" };
}
