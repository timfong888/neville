// Output gate (P3): keyword-based classifier for adult-tier script output.
// Applied to the finished script before speech synthesis.
// "Unsure" (any match) → refuse, log verdict only, never log content.
//
// TODO (SAT-219 P3): Replace with an ML classifier before customer access.
// Tim, 2026-11-27: "Don't block shipping the feature yet but make sure there
// is a clear ticket that is P1 and required to ship."

export type OutputCategory = "minor" | "real_person" | "family_role" | "violence" | "non_consent";

export type OutputVerdict =
  | { verdict: "pass" }
  | { verdict: "refuse"; category: OutputCategory };

// Patterns applied to model-generated text; broader than input patterns since
// models can paraphrase. Any match = refuse (fail closed).

// Two consecutive title-cased Unicode words (3+ chars each) in model output strongly suggests
// a real named person was introduced. The `u` flag enables \p{Lu}/\p{Ll} for accented chars.
const REAL_PERSON_OUT =
  /\b\p{Lu}\p{Ll}{2,}\s+\p{Lu}\p{Ll}{2,}\b/u;

// Family or relative role words must never appear in adult-tier output; the content is sexual
// by nature so any family reference is a hard block (no sexual-context co-signal required here).
const FAMILY_ROLE_OUT =
  /\b(?:mom|mother|dad|father|sister|brother|daughter|son|niece|nephew|cousin|aunt|uncle|grandm(?:a|other)|grandf(?:a|ather)|granddad|grandpa|grandma|stepmom|stepdad|stepdaughter|stepson|stepsister|stepbrother|stepmother|stepfather|in[\s-]?law|relative)\b/i;

const MINOR_OUT =
  /\b(?:child(?:ren)?|minor\b|underage|teen(?:age(?:r|d)?)?|youth|young (?:girl|boy) |schoolgirl|schoolboy|girl(?:ish)?\b|boy(?:ish)?\b|kid(?:s)?\b|(?:[1-9]|1[0-7])[- ]?year[s ]?[- ]?old|loli\w*)\b/i;

const VIOLENCE_OUT =
  /\b(?:blood(?:y|ied)?|wound(?:ed|s)?|gore\b|brutal(?:ly)?|murder(?:ed|s)?|torture(?:d|ing)?|stab(?:bed|bing)?|choke(?:d|ing)?|strangle(?:d|ing)?|kill(?:ed|ing)|mutilat(?:e|ed|ion|ing))\b/i;

const NON_CONSENT_OUT =
  /\b(?:forc(?:e|ed|ing)(?:\s+(?:her|him|them|into)|\s+by\b)?|coerce(?:d|s)?|against (?:her|his|their) will|without (?:her|his|their) consent|non[\s-]?(?:consent\b|consensual)|rape(?:d|s)?|molest(?:ed|ing)?)\b/i;

/** Classify a finished script. Any match → refuse. Never logs content. */
export function classifyScript(lines: string[]): OutputVerdict {
  const text = lines.join(" ");
  if (MINOR_OUT.test(text)) return { verdict: "refuse", category: "minor" };
  if (REAL_PERSON_OUT.test(text)) return { verdict: "refuse", category: "real_person" };
  if (FAMILY_ROLE_OUT.test(text)) return { verdict: "refuse", category: "family_role" };
  if (VIOLENCE_OUT.test(text)) return { verdict: "refuse", category: "violence" };
  if (NON_CONSENT_OUT.test(text)) return { verdict: "refuse", category: "non_consent" };
  return { verdict: "pass" };
}
