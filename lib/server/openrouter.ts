// Server-only helpers for OpenRouter. The key never leaves the server:
// nothing in this file returns or logs it.
import "server-only";

export const OPENROUTER = "https://openrouter.ai/api/v1";

export function apiKey(): string | undefined {
  const k = process.env.OPENROUTER_API_KEY?.trim();
  return k ? k : undefined;
}

/** Paid calls are for previews and local dev only until launch guardrails exist. */
export function paidCallsAllowed(): boolean {
  return process.env.VERCEL_ENV !== "production";
}

export type SpeechModel = {
  id: string;
  name: string;
  /** USD per 1M characters when the model is priced per character, else null. */
  usdPerMChars: number | null;
  pricing: Record<string, string>;
  voices: string[];
  /** OpenRouter's own description of the model, trimmed. */
  description: string;
};

type RawModel = {
  id?: string;
  name?: string;
  description?: string;
  pricing?: Record<string, unknown>;
  supported_voices?: unknown;
};

function voiceNames(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x : (x as { id?: string; name?: string })?.id ?? (x as { name?: string })?.name))
    .filter((x): x is string => typeof x === "string" && x.length > 0);
}

/** Lists speech models. Public endpoint: needs no key and costs nothing. */
export async function listSpeechModels(): Promise<{ models: SpeechModel[]; pricingKeys: string[] }> {
  const res = await fetch(`${OPENROUTER}/models?output_modalities=speech`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`models list failed: ${res.status}`);
  const json = (await res.json()) as { data?: RawModel[] };
  const pricingKeys = new Set<string>();
  const models = (json.data ?? []).map((m) => {
    const pricing: Record<string, string> = {};
    for (const [k, v] of Object.entries(m.pricing ?? {})) {
      if (v !== null && v !== undefined && String(v) !== "0") {
        pricing[k] = String(v);
        pricingKeys.add(k);
      }
    }
    // Character-priced speech models carry the per-character price in `prompt`
    // and have no `completion` price. Token-priced ones (Gemini) have both.
    const perChar = pricing.completion ? NaN : Number(pricing.prompt ?? NaN);
    return {
      id: m.id ?? "",
      name: m.name ?? m.id ?? "",
      usdPerMChars: Number.isFinite(perChar) && perChar > 0 ? perChar * 1e6 : null,
      pricing,
      voices: voiceNames(m.supported_voices),
      description: typeof m.description === "string" ? m.description.slice(0, 2000) : "",
    };
  });
  return { models: models.filter((m) => m.id), pricingKeys: [...pricingKeys] };
}
