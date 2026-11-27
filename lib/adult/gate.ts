// Hard-block input gate for adult-tier wishes. Fail closed.
// Called before any model for EVERY account: these blocks have no off switch.
// Never echo a blocked term into logs or error messages; return reason codes only.

import { wishMentionsMinor } from "@/lib/prompt";

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

// Two consecutive title-cased words (3+ chars each) = likely a full person's name.
// Mirrored from lib/image/gate.ts; kept local to avoid coupling.
const PROPER_NAME = /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/;

// Phrases indicating a request to base content on a photo or likeness of a real person.
const LIKENESS =
  /\b(?:looks? like|style of|resembl\w+|impersonat\w+|my (?:photo|picture|selfie|image|face)|uploaded? (?:photo|image)|reference (?:photo|image)|from (?:a |my )?photo|based on (?:a |my |this )?photo|using (?:a |my )?photo)\b/i;

// Violence, gore, harm (mutilation is in PROHIBITED_ACT to give the more specific reason)
const VIOLENCE =
  /\b(?:kill(?:ing|s|ed)?|murder(?:ing|s|er|ed)?|gore|brutal(?:ly|ity)?|slaughter(?:ing|ed|s)?|torture(?:ing|d)?|bleed(?:ing)?|blood(?:y|ied)?|wound(?:ing|ed|s)?|abuse(?:d|r|s|ing)?|assault(?:ed|ing|s)?|stab(?:bing|bed|s)?|chok(?:ing|ed|es?)?|strangle(?:d|ing|s)?|threaten(?:ing|ed)?|harming)\b/i;

// Coercion and non-consent: covers both active ("forced her") and passive ("she was forced"),
// adjective ("non-consensual"), and direct phrase forms.
const NON_CONSENT =
  /\b(?:forc(?:e|ed|ing|es)(?:\s+(?:her|him|them|me|you|into|to)|\s+by\s+(?:me|him|her|them|you))?|coerce(?:d|s|ing)?|coercion|blackmail(?:ed|ing|s)?|non[\s-]?(?:consent\b|consensual)|without (?:her|his|their) consent|against (?:her|his|their) will|rape(?:d|s|r|ing)?|molest(?:ed|ing|s)?|kidnap(?:ped|ping|s)?|drugg(?:ed|ing) (?:her|him|them))\b/i;

// Family or relative roles in a sexual context
// (all roles are included; a future variant could use proximity to sexual terms,
// but fail-closed is safer for MVP)
const FAMILY_ROLE =
  /\b(?:mom|mother|dad|father|sister|brother|aunt|uncle|grandm(?:a|other)|grandf(?:a|ather)|granddad|grandpa|grandma|grandnan|stepmom|stepdad|stepdaughter|stepson|stepsister|stepbrother|stepmother|stepfather|in[\s-]?law|relative|family member)\b/i;

// Prohibited acts: bestiality, genital mutilation, gender-change framing in explicit context
const PROHIBITED_ACT =
  /\b(?:bestialit(?:y|ies)|animal sex|zoophil\w+|mutilat(?:e|ed|ion|ing)|amputat(?:e|ed|ion|ing)|genital mutilat\w+|gender (?:swap|change|transformation|reassignment) (?:sex|explicit|porn|nude|naked))\b/i;

// Minor-coded phrases not caught by wishMentionsMinor
const MINOR_CODED =
  /\b(?:barely legal|just turned 18|look(?:s|ing)? (?:young|like a (?:kid|child|teen|minor|student))|underage|age[\s-]play|loli\w*|shota\w*|petite school(?:girl|boy)?|school[\s-]?girl|school[\s-]?boy)\b/i;

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
  if (wishMentionsMinor(wish) || MINOR_CODED.test(wish)) {
    return { allowed: false, reason: "minor", guidance: GUIDANCE.minor };
  }
  if (PROPER_NAME.test(wish) || LIKENESS.test(wish)) {
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
  if (FAMILY_ROLE.test(wish)) {
    return { allowed: false, reason: "family_role", guidance: GUIDANCE.family_role };
  }
  return { allowed: true };
}
