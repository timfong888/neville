// Image safety gate. Fail closed: anything uncertain is refused.
// Uses wishMentionsMinor (any minor word) rather than wishSexualisesMinor (minor + intimacy),
// because every depicted person must be stated as an adult regardless of intent.

import { MINOR_CLEAR, wishMentionsMinor, wishSexualisesMinor, wishSexualisesFamilyRole } from "@/lib/prompt";

export type GateResult =
  | { allowed: true }
  | { allowed: false; reason: "minor" | "real_person" | "reference_photo" };

// Two consecutive title-cased words (3+ chars each) = likely a full person's name
// (e.g. "Taylor Swift", "Barack Obama"). Fail closed: false positives are acceptable.
const PROPER_NAME = /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/;

// Phrases that indicate a request to use an uploaded or reference photo of a real person.
const REFERENCE_PHOTO =
  /\b(?:my (?:photo|picture|selfie|image|face)|uploaded? (?:photo|image|picture)|reference (?:photo|image)|from (?:a |my )?photo|based on (?:a |my |this )?photo|using (?:a |my )?photo)\b/i;

/** User-facing guidance for each refusal reason. Never contains wish text. */
export const IMAGE_GUIDANCE: Record<"minor" | "real_person" | "reference_photo", string> = {
  minor: `An image can't be made for this wish. Describe adults only, for example "women in their early twenties".`,
  real_person: `An image can't show a named real person. Describe the kind of person instead.`,
  reference_photo: `An image can't be made from a photo. Describe the person in words instead.`,
};

/**
 * Returns `{ allowed: true }` when an image may be generated for this wish.
 * Returns `{ allowed: false, reason }` with the first failing reason when not.
 *
 * Order: minor → real_person → reference_photo.
 * When opts.relaxed is true, uses MINOR_CLEAR (the narrower minor check) so
 * ambiguous family/relative words pass while clear child-safety terms still refuse.
 * Never calls a network; pure function.
 */
export function imageGate(wish: string, opts?: { relaxed?: boolean }): GateResult {
  const minorHit = opts?.relaxed
    // Relaxed: refuse clear child-safety terms (no intimacy needed) OR any family role
    // combined with intimate/explicit words (issue 219 block 4, every account).
    ? MINOR_CLEAR.test(wish) || wishSexualisesFamilyRole(wish)
    // Strict: refuse any minor word (no intimacy needed — every depicted person must be an adult).
    : (wishMentionsMinor(wish) || wishSexualisesMinor(wish));
  if (minorHit) return { allowed: false, reason: "minor" };
  if (PROPER_NAME.test(wish)) return { allowed: false, reason: "real_person" };
  if (REFERENCE_PHOTO.test(wish)) return { allowed: false, reason: "reference_photo" };
  return { allowed: true };
}
