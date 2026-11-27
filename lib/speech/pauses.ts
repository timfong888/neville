// Splits long sentences into natural-pause phrases and assigns pause
// lengths between them. Used by the manifest route before synthesis.
// Framework-free: no Next, React or browser APIs.
import config from "@/config/pauses.json";

export type PauseConfig = {
  phraseMs: number;
  sentenceMs: number;
  refrainMs: number;
  maxWords: number;
};

export const PAUSE_DEFAULTS: PauseConfig = config;

/**
 * Split a sentence that exceeds `maxWords` at natural pause points:
 * commas, and / as / while / then at word boundaries.
 * Short sentences are returned unchanged as a single-element array.
 */
export function splitPhrase(sentence: string, maxWords = PAUSE_DEFAULTS.maxWords): string[] {
  const trimmed = sentence.trim();
  if (trimmed.split(/\s+/).length <= maxWords) return [trimmed];

  const result: string[] = [];
  let remaining = trimmed;

  while (remaining.split(/\s+/).length > maxWords) {
    // Build a window of maxWords+1 words to find the best cut inside maxWords.
    const window = remaining.split(/\s+/).slice(0, maxWords + 1).join(" ");

    // Prefer the last comma; fall back to the last conjunction.
    const commas = [...window.matchAll(/,/g)];
    const conjs = [...window.matchAll(/\s(?:and|as|while|then)\s/gi)];

    let cut = -1;
    if (commas.length > 0) cut = commas[commas.length - 1].index! + 1;
    else if (conjs.length > 0) cut = conjs[conjs.length - 1].index!;

    if (cut <= 0 || cut >= remaining.length) {
      // No natural split found; break after exactly maxWords.
      cut = remaining.split(/\s+/).slice(0, maxWords).join(" ").length;
    }

    const phrase = remaining.slice(0, cut).trim();
    if (!phrase) break;
    result.push(phrase);
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) result.push(remaining);
  return result.length > 1 ? result : [trimmed];
}

export type PauseType = "phrase" | "sentence" | "refrain";

export type Segment = {
  text: string;
  /**
   * Pause to follow this segment. The last segment's value is ignored by
   * `segmentsToPausedLines` (there is no gap after the final line).
   */
  pauseAfter: PauseType;
};

/**
 * Expand script lines into segments. Long sentences are split into phrases;
 * each phrase is its own segment. `tailCount` trailing lines are refrain entries
 * and get `refrainMs` before them (the last segment of the body gets "refrain").
 */
export function segmentLines(
  lines: string[],
  tailCount = 0,
  maxWords = PAUSE_DEFAULTS.maxWords,
): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < lines.length; i++) {
    const isRefrain = tailCount > 0 && i >= lines.length - tailCount;
    const phrases = splitPhrase(lines[i], maxWords);
    for (let j = 0; j < phrases.length; j++) {
      const isLastPhrase = j === phrases.length - 1;
      out.push({
        text: phrases[j],
        pauseAfter: isRefrain ? "refrain" : isLastPhrase ? "sentence" : "phrase",
      });
    }
  }
  return out;
}

/**
 * Flatten segments into lines and per-gap pause values (ms).
 * `pauseMsPerGap[i]` is the pause after `lines[i]`; the array has
 * `lines.length - 1` entries.
 */
export function segmentsToPausedLines(
  segments: Segment[],
  cfg: PauseConfig = PAUSE_DEFAULTS,
): { lines: string[]; pauseMsPerGap: number[] } {
  const lines = segments.map((s) => s.text);
  const pauseMsPerGap = segments.slice(0, -1).map((s) => {
    if (s.pauseAfter === "phrase") return cfg.phraseMs;
    if (s.pauseAfter === "refrain") return cfg.refrainMs;
    return cfg.sentenceMs;
  });
  return { lines, pauseMsPerGap };
}
