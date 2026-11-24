// Placeholder script writer for the Demo 1 prototype.
// The real app sends the same inputs to an LLM through the model router.
// This runs in the browser and costs nothing.

const FIRST_TO_SECOND: Array<[RegExp, string]> = [
  [/\bI am\b/gi, "you are"],
  [/\bI'm\b/gi, "you're"],
  [/\bI've\b/gi, "you've"],
  [/\bI'll\b/gi, "you'll"],
  [/\bmyself\b/gi, "yourself"],
  [/\bmine\b/gi, "yours"],
  [/\bmy\b/gi, "your"],
  [/\bme\b/gi, "you"],
  [/\bI\b/g, "you"],
];

const LEADING = [
  /^i (really )?(want|wish|would like|'d like|hope|need)( for)?\s+/i,
  /^i'd (really )?(like|love)\s+/i,
  /^(my goal is|my dream is|i dream of|i am manifesting|i'm manifesting)\s+/i,
];

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Turn a free-text wish into a present-tense "you" statement. */
export function toYouStatement(raw: string): string {
  let s = raw.trim().replace(/[.!?\s]+$/g, "");
  for (const re of LEADING) s = s.replace(re, "");
  for (const [re, to] of FIRST_TO_SECOND) s = s.replace(re, to);
  s = s.trim();
  if (!s) return "you are living the life you chose";

  if (/^to be\s+/i.test(s)) return "you are " + s.replace(/^to be\s+/i, "");
  if (/^to have\s+/i.test(s)) return "you have " + s.replace(/^to have\s+/i, "");
  if (/^to\s+/i.test(s)) return "you " + s.replace(/^to\s+/i, "");
  if (/^(you|your)\b/i.test(s)) return s.charAt(0).toLowerCase() + s.slice(1);
  if (/^(being|becoming)\s+/i.test(s))
    return "you are " + s.replace(/^(being|becoming)\s+/i, "");
  return "you have " + s;
}

export function titleFor(raw: string): string {
  const core = toYouStatement(raw);
  const words = core.split(/\s+/).slice(0, 7).join(" ");
  return capitalise(words) + (core.split(/\s+/).length > 7 ? "…" : "");
}

type Line = (core: string, name: string) => string;

const withName = (name: string, rest: string) =>
  name ? `${name}, ${rest}` : capitalise(rest);

const VARIANTS: Line[][] = [
  [
    (_c, n) => withName(n, "take a slow breath in, and let it go."),
    (c) => `${capitalise(c)}.`,
    () => "It is already done. Feel how natural it is.",
    (c) => `You wake up, and it is simply true: ${c}.`,
    (_c, n) => withName(n, "you no longer hope for this. You live from it."),
    () => "When a doubt rises, you watch it pass like a cloud.",
    () => "You are grateful. You are calm. You are certain.",
    (c) => `${capitalise(c)}. And so it is.`,
  ],
  [
    () => "Close your eyes. Let your shoulders drop.",
    (c, n) => withName(n, `see it clearly now: ${c}.`),
    () => "Notice where you are standing. Notice who is with you.",
    () => "You hear the words people say to you. You feel your own smile.",
    (c) => `This is an ordinary day for you now, because ${c}.`,
    (_c, n) => withName(n, "you earned this by deciding it was yours."),
    () => "You carry this feeling into everything you do today.",
    (c) => `${capitalise(c)}. It is done.`,
  ],
  [
    (_c, n) => withName(n, "breathe in. Hold. And release."),
    () => "A doubt may whisper. You answer it kindly.",
    (c) => `You tell it the truth: ${c}.`,
    () => "You have changed before. You are changing now.",
    (c) => `Every small choice today agrees with this: ${c}.`,
    (_c, n) => withName(n, "you are safe to want this, and safe to have it."),
    () => "The old story is quiet. The new one is loud and clear.",
    (c) => `${capitalise(c)}. You know it. You feel it. You live it.`,
  ],
];

export const VARIANT_COUNT = VARIANTS.length;

export function buildScript(raw: string, name: string, variant: number): string[] {
  const core = toYouStatement(raw);
  const cleanName = name.trim().split(/\s+/)[0] ?? "";
  const v = Number.isSafeInteger(variant) ? variant : 0;
  const lines = VARIANTS[((v % VARIANTS.length) + VARIANTS.length) % VARIANTS.length];
  return lines.map((fn) => fn(core, cleanName));
}

/** Stable small hash, used to pick a visual palette for a wish. */
export function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A calm affirmation that uses none of the listener's own words. The server
 * records this when the text model cannot write the script: the model is what
 * turns an unkind or unsafe wish into something gentle, so without it the wish
 * must not be spoken back.
 */
export function neutralScript(name: string): string[] {
  return [
    name ? `${name}, take a slow breath in, and let it go.` : "Take a slow breath in, and let it go.",
    "You are safe, and you are at ease.",
    "Your shoulders soften, and your breath moves gently.",
    "You have everything you need in this moment.",
    "Good things come to you easily, and you welcome them.",
    "You are kind to yourself and to the people around you.",
    "You feel a quiet warmth in your chest.",
    "You are grateful for this day and for who you are.",
    "And so it is.",
  ];
}
