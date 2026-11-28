// Hard-block input gate for adult-tier wishes. Fail closed.
// Called before any model for EVERY account: these blocks have no off switch.
// Never echo a blocked term into logs or error messages; return reason codes only.

import { wishSexualisesMinor } from "@/lib/prompt";

export type BlockReason =
  | "minor"
  | "real_person"
  | "violence"
  | "non_consent"
  | "family_role"
  | "prohibited_act";

export type AdultGateResult =
  | { allowed: true }
  | { allowed: false; reason: BlockReason; guidance: string };

// Two consecutive title-cased Unicode words (3+ chars each) = likely a full person's name.
// The `u` flag enables \p{Lu}/\p{Ll} Unicode property classes for accented characters
// (Beyoncé Knowles, André Garcia, etc.). Mirrored from lib/image/gate.ts; kept local.
const PROPER_NAME = /\b\p{Lu}\p{Ll}{2,}\s+\p{Lu}\p{Ll}{2,}\b/u;

// A single title-cased name after a person-reference or sexual verb — catches single-name
// celebrities (Madonna, Beyoncé, Cher, etc.) that the two-word PROPER_NAME misses.
const SINGLE_NAME_CONTEXT =
  /\b(?:be with|sex with|sleep with|make love to|kiss(?:ing)?|touch(?:ing)?|date(?:ing)?|fantasiz\w+ (?:about|of)|dream(?:ing)? (?:about|of)|pretend (?:to be|you are|i am|i'm)|play as|be like|impersonat\w+)\s+\p{Lu}\p{Ll}{3,}\b/iu;

// Phrases indicating a request to base content on a photo or likeness of a real person.
const LIKENESS =
  /\b(?:looks? like|style of|resembl\w+|impersonat\w+|my (?:photo|picture|selfie|image|face)|uploaded? (?:photo|image)|reference (?:photo|image)|from (?:a |my |this )?(?:photo|selfie|picture|image)|based on (?:a |my |this )?(?:photo|selfie|picture|image)|using (?:a |my |this )?(?:photo|selfie|picture|image))\b/i;

// Violence, gore, harm (mutilation is in PROHIBITED_ACT to give the more specific reason)
const VIOLENCE =
  /\b(?:kill(?:ing|s|ed)?|murder(?:ing|s|er|ed)?|gore|brutal(?:ly|ity)?|slaughter(?:ing|ed|s)?|torture(?:ing|d)?|bleed(?:ing)?|blood(?:y|ied)?|wound(?:ing|ed|s)?|abuse(?:d|r|s|ing)?|assault(?:ed|ing|s)?|stab(?:bing|bed|s)?|chok(?:ing|ed|es?)?|strangl(?:e|ed|es|ing)|threaten(?:ing|ed)?|harming)\b/i;

// Coercion and non-consent: covers both active ("forced her") and passive ("she was forced"),
// adjective ("non-consensual"), and direct phrase forms.
const NON_CONSENT =
  /\b(?:forc(?:e|ed|ing|es)(?:\s+(?:her|him|them|me|you|into|to)|\s+by\s+(?:me|him|her|them|you))?|coerc(?:e|ed|es|ing|ion)|blackmail(?:ed|ing|s)?|non[\s-]?(?:consent\b|consensual)|without (?:her|his|their) consent|against (?:her|his|their) will|rape(?:d|s|r|ing)?|molest(?:ed|ing|s)?|kidnap(?:ped|ping|s)?|drugg(?:ed|ing) (?:her|him|them))\b/i;

// Family or relative role words. Blocking on these alone would refuse innocent wishes
// ("reconnect with my mother"). They are only blocked when a sexual-context signal is
// also present in the wish (see SEXUAL_CONTEXT below and the check in adultGate).
const FAMILY_ROLE =
  /\b(?:mom|mother|dad|father|sister|brother|daughter(?:s)?|son(?:s)?|niece(?:s)?|nephew(?:s)?|cousin(?:s)?|aunt|uncle|grandm(?:a|other)|grandf(?:a|ather)|granddad|grandpa|grandma|grandnan|stepmom|stepdad|stepdaughter|stepson|stepsister|stepbrother|stepmother|stepfather|in[\s-]?law|relative|family member)\b/i;

// Sexual-context signal. Broad enough to catch intent; combined with FAMILY_ROLE for the block.
// A family-word wish that has no sexual-context word passes (non-sexual family is encouraged).
const SEXUAL_CONTEXT =
  /\b(?:sex\w*|erotic\w*|explicit\b|intima\w*|naked|nude|nudity|nudist|seduc\w+|lust\w*|horny|aroused|arouses?|passionate (?:night|evening|kiss|love|sex)|romantic (?:scene|night|evening|encounter)|kissing|mak(?:e|es|ing) love|affair|sensual\w*|desire(?:s|d|ing)?|attracted to|in love with|flirt\w*|pornograph\w*|adult content|sleep(?:ing)? with(?: me| her| him| them| us)?|slept with(?: me| her| him| them| us)?|hook(?:ed|ing)? up with|hooking up|hooked up|fool(?:ing)? around with|messing around with)\b/i;

// Prohibited acts: bestiality, genital mutilation, gender-change framing in explicit context
const PROHIBITED_ACT =
  /\b(?:bestialit(?:y|ies)|animal sex|zoophil\w+|mutilat(?:e|ed|ion|ing)|amputat(?:e|ed|ion|ing)|genital mutilat\w+|gender (?:swap|change|transformation|reassignment) (?:sex|explicit|porn|nude|naked))\b/i;

// Absolute minor indicators: always blocked regardless of sexual context.
// Covers direct age statements under 18, explicit coded terms (loli, shota, etc.),
// school-framing phrases, and the minor-coded terms "girl"/"boy" (issue #219:
// non-negotiable; every person must be stated as an adult 21+).
// Words like "sister", "daughter" that appear in innocent non-sexual family wishes
// are NOT here — they go through wishSexualisesMinor (requires a co-signal) instead.
const AGE_WORDS_EN =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen";
const ABSOLUTE_MINOR = new RegExp(
  "(?<!\\w)(?:" +
    "(?:[1-9]|1[0-7])[- ]?(?:years?[- ]old|yrs?\\.?|y\\.? ?o\\.?|y/o|years? of age)" +
    "|(?:" + AGE_WORDS_EN + ")[- ]?(?:years?[- ]old|years?|yrs?\\.?|y\\.? ?o\\.?)" +
    "|aged? (?:[1-9]|1[0-7])|aged? (?:" + AGE_WORDS_EN + ")" +
    // Bare age declaration: "she is 15", "he was 14", "only 13", "just 16"
    "|(?:(?:she|he|they|i)\\s+(?:is|was|am|are)\\s+|(?:only|just)\\s+)(?:[1-9]|1[0-7])" +
    "|barely legal|just turned 18|underage|minor\\b|child(?:ren)?\\b|kids?\\b" +
    "|teen\\w*|preteen|youth(?:ful)?\\b" +
    "|age[\\s-]play|loli\\w*|shota\\w*" +
    "|petite[\\s-]?school(?:girl|boy)?|school[\\s-]?girl\\b|school[\\s-]?boy\\b" +
    "|look(?:s|ing)? like a (?:kid|child|teen|minor|student)" +
    // Minor-coded terms: unconditional block per issue #219 (every person must be stated adult 21+)
    "|girls?\\b|boys?\\b" +
  ")(?!\\w)",
  "i",
);

const GUIDANCE: Record<BlockReason, string> = {
  minor:
    "Describe the person as a consenting adult aged 21 or older, without any age, school or youth references.",
  real_person:
    "Use a fictional person. Remove any real names, likeness phrases or photo references.",
  violence:
    "Remove harm, threat or injury from the scene. Focus on mutual care and desire between consenting adults.",
  non_consent:
    "All people must be willing participants. Rewrite to show freely given, enthusiastic consent.",
  family_role:
    "Remove family or relative titles. Describe the person by their looks or personality instead.",
  prohibited_act:
    "Remove that act entirely. This platform limits explicit content to fictional consenting adults in safe, legal scenarios.",
};

/**
 * Returns `{ allowed: true }` when the wish passes every hard block.
 * Returns `{ allowed: false, reason, guidance }` on the first failing block.
 *
 * Order: minor → real_person → violence → non_consent → family_role → prohibited_act.
 * Never logs or echoes the blocked term; callers must not log `wish` on refusal.
 */
export function adultGate(wish: string): AdultGateResult {
  // Three-tier minor/family check (order matters):
  // 1. Absolute minor terms (ages under 18, loli, schoolgirl, girl, boy, etc.) always block as "minor".
  // 2. Family/relative role words + sexual context → "family_role" (checked before wishSexualisesMinor
  //    so that "make love to my daughter" routes to family_role, not minor, even though MINOR
  //    includes family words to catch them on non-adult paths in lib/prompt.ts).
  // 3. Remaining wishSexualisesMinor matches (non-family minor words) → "minor".
  if (ABSOLUTE_MINOR.test(wish)) {
    return { allowed: false, reason: "minor", guidance: GUIDANCE.minor };
  }
  if (FAMILY_ROLE.test(wish) && SEXUAL_CONTEXT.test(wish)) {
    return { allowed: false, reason: "family_role", guidance: GUIDANCE.family_role };
  }
  if (wishSexualisesMinor(wish)) {
    return { allowed: false, reason: "minor", guidance: GUIDANCE.minor };
  }
  if (PROPER_NAME.test(wish) || SINGLE_NAME_CONTEXT.test(wish) || LIKENESS.test(wish)) {
    return { allowed: false, reason: "real_person", guidance: GUIDANCE.real_person };
  }
  if (PROHIBITED_ACT.test(wish)) {
    return { allowed: false, reason: "prohibited_act", guidance: GUIDANCE.prohibited_act };
  }
  if (VIOLENCE.test(wish)) {
    return { allowed: false, reason: "violence", guidance: GUIDANCE.violence };
  }
  if (NON_CONSENT.test(wish)) {
    return { allowed: false, reason: "non_consent", guidance: GUIDANCE.non_consent };
  }
  return { allowed: true };
}
