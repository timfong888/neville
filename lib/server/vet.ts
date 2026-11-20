// Asks the cheap text model whether a person's own script is fine to record.
// Fails closed: no answer means no recording.
import "server-only";
import { OPENROUTER } from "@/lib/server/openrouter";
import { scriptModel } from "@/lib/server/writer";
import { VET_SYSTEM, verdict } from "@/lib/rerecord";

export type Vet =
  | { ok: true; model: string; costUsd: number | null }
  | { ok: false; reason: "rejected"; model: string; costUsd: number | null }
  | { ok: false; reason: "unavailable" };

export async function vetScript(key: string, lines: string[]): Promise<Vet> {
  try {
    const model = await scriptModel();
    const res = await fetch(`${OPENROUTER}/chat/completions`, {
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
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { cost?: unknown };
    };
    const reply = json.choices?.[0]?.message?.content;
    if (typeof reply !== "string") return { ok: false, reason: "unavailable" };
    const costUsd = typeof json.usage?.cost === "number" ? json.usage.cost : null;
    return verdict(reply) ? { ok: true, model, costUsd } : { ok: false, reason: "rejected", model, costUsd };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
