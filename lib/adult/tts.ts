// Builds the ordered TTS fallback chain for adult-tier accounts.
// Pure: no network, no server-only.

export type AdultVoiceCand = {
  id: string;
  model: string;
  voice: string;
  atomic: boolean;
};

type ConfigCand = { id: string; model: string; voice: string; atomic?: boolean };

/**
 * Returns an ordered list of TTS candidates for an adult-tier request.
 *
 * The requested voice is first. Config fallbacks follow in config order,
 * deduplicated by model+voice pair. Capped at `max` entries total.
 */
export function buildAdultVoiceChain(
  requested: { id: string; model: string; voice: string; atomic?: boolean },
  fallbacks: readonly ConfigCand[],
  max: number,
): AdultVoiceCand[] {
  const seen = new Set<string>();
  const chain: AdultVoiceCand[] = [];

  const push = (c: { id: string; model: string; voice: string; atomic?: boolean }) => {
    if (chain.length >= max) return;
    const key = `${c.model}/${c.voice}`;
    if (seen.has(key)) return;
    seen.add(key);
    chain.push({ id: c.id, model: c.model, voice: c.voice, atomic: c.atomic ?? false });
  };

  push(requested);
  for (const f of fallbacks) push(f);
  return chain;
}
