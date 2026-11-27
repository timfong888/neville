// Pure scorer: no I/O, no model calls. Used in writer.ts as a post-check.
export type VividnessResult = { pass: boolean; reasons: string[] };

const SENSES = new Set([
  // sight
  "see","look","light","bright","glow","gleam","shimmer","dark","shadow",
  "colour","color","gold","silver","shine","glitter","flicker","watch",
  // sound
  "hear","sound","voice","quiet","silence","ring","buzz","hum",
  "whisper","laugh","click","rustle","echo","chime",
  // touch / temperature
  "touch","hold","warm","cool","cold","hot","soft","smooth","rough",
  "weight","heavy","grip","press","solid","loose","tight","firm",
  // smell / taste
  "smell","scent","taste","sweet","fresh","salt","air","breath",
  // body feeling — small concrete sensations
  "chest","shoulders","hands","face","skin","ease","tension","jaw",
  "steady","calm","inhale","exhale","sink","rise",
]);

// Words implying the wish is not yet real.
const HEDGE = /\b(will|someday|want|hope|try|maybe|wish)\b/i;
// A short line that is only a bare claim, e.g. "The house is yours."
const BARE_CLAIM = /\b(?:is|are)\s+yours\b/i;
// At least some present-tense verbs must appear.
const PRESENT =
  /\b(?:is|are|have|has|feel|feels|see|sees|hear|hears|hold|holds|stand|stands|sit|sits|walk|walks|open|opens|notice|notices|look|looks|breathe|breathes|know|knows|smile|smiles|rest|rests|carry|carries|shine|shines|turn|turns|glow|glows|step|steps)\b/i;
// Thanks language is banned from scripts.
const THANKS =
  /\b(thank\s+you|thanks|grateful|gratitude|appreciate|blessed|give\s+thanks)\b/i;

/** Word-level positions (0-indexed) where `name` appears in the joined lines. */
export function namePositions(lines: string[], name: string): number[] {
  if (!name.trim()) return [];
  const esc = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc}$`, "i");
  const positions: number[] = [];
  let offset = 0;
  for (const line of lines) {
    const tokens = line.split(/\s+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      const bare = tokens[i].replace(/[^a-zA-Z''-]/g, "");
      if (re.test(bare)) positions.push(offset + i);
    }
    offset += tokens.length;
  }
  return positions;
}

export interface NameOpts {
  nameMin: number;
  nameMax: number;
  minGapWords: number;
}

type Placement = "start" | "end" | "middle";

function namePlacementInLine(line: string, name: string): Placement | null {
  const tokens = line.split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const esc = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc}$`, "i");
  const bare = (t: string) => t.replace(/[^a-zA-Z''-]/g, "");
  if (re.test(bare(tokens[0]))) return "start";
  if (re.test(bare(tokens[tokens.length - 1]))) return "end";
  for (const t of tokens) {
    if (re.test(bare(t))) return "middle";
  }
  return null;
}

export function scoreVividness(
  lines: string[],
  name = "",
  nameOpts?: NameOpts,
): VividnessResult {
  const reasons: string[] = [];
  const script = lines.join(" ");

  // 1. No hedge / future words anywhere in the script.
  const hm = HEDGE.exec(script);
  if (hm) reasons.push(`hedge_word:${hm[1].toLowerCase()}`);

  // 2. At least 2 sense words across the whole scene.
  const words = script.toLowerCase().split(/\W+/).filter(Boolean);
  if (words.filter((w) => SENSES.has(w)).length < 2) reasons.push("too_few_sense_words");

  // 3. No single sentence longer than 12 words.
  for (const line of lines) {
    if (line.trim().split(/\s+/).filter(Boolean).length > 12) {
      reasons.push("sentence_too_long");
      break;
    }
  }

  // 4. No bare claim line of ≤ 6 words (e.g. "The bitcoin is yours.").
  for (const line of lines) {
    const wc = line.trim().split(/\s+/).length;
    if (wc <= 6 && BARE_CLAIM.test(line)) {
      reasons.push("bare_claim");
      break;
    }
  }

  // 5. At least some present-tense verbs present.
  if (!PRESENT.test(script)) reasons.push("no_present_tense");

  // 6. No thanks language (keeps the listener inside the scene).
  const tm = THANKS.exec(script);
  if (tm) reasons.push(`thanks_language:${tm[1].toLowerCase().replace(/\s+/g, "_")}`);

  // 7. Name frequency: count, spacing, and placement variety.
  if (name && nameOpts) {
    // Scripts under 60 words use a lower minimum so short scripts can pass.
    const effectiveMin = words.length < 60 ? Math.min(3, nameOpts.nameMin) : nameOpts.nameMin;
    const pos = namePositions(lines, name);
    if (pos.length < effectiveMin || pos.length > nameOpts.nameMax) {
      reasons.push(`name_count:${pos.length}`);
    }
    if (pos.length >= 2) {
      const minGap = Math.min(...pos.slice(1).map((p, i) => p - pos[i]));
      if (minGap < nameOpts.minGapWords) reasons.push("name_too_close");
    }
    // All placements the same type (all start / all end / all middle) means no variety.
    const placements: Placement[] = [];
    for (const line of lines) {
      const p = namePlacementInLine(line, name);
      if (p !== null) placements.push(p);
    }
    if (placements.length >= 2 && placements.every((p) => p === placements[0])) {
      reasons.push("name_placement_uniform");
    }
  }

  return { pass: reasons.length === 0, reasons };
}
