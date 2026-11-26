// Image safety gate. Fail closed: anything uncertain is refused.
// Reuses wishSexualisesMinor and the MINOR word list from lib/prompt.ts without change.

import { wishSexualisesMinor } from "@/lib/prompt";

export type GateResult =
  | { allowed: true }
  | { allowed: false; reason: "minor" | "real_person" | "reference_photo" };

// Two consecutive title-cased words (3+ chars each) = likely a full person's name
// (e.g. "Taylor Swift", "Barack Obama"). Fail closed: false positives are acceptable.
const PROPER_NAME = /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/;

// Phrases that indicate a request to use an uploaded or reference photo of a real person.
const REFERENCE_PHOTO =
  /\b(?:my (?:photo|picture|selfie|image|face)|uploaded? (?:photo|image|picture)|reference (?:photo|image)|from (?:a |my )?photo|based on (?:a |my |this )?photo|using (?:a |my )?photo)\b/i;

/**
 * Returns `{ allowed: true }` when an image may be generated for this wish.
 * Returns `{ allowed: false, reason }` with the first failing reason when not.
 *
 * Order: minor → real_person → reference_photo.
 * Never calls a network; pure function.
 */
export function imageGate(wish: string): GateResult {
  if (wishSexualisesMinor(wish)) return { allowed: false, reason: "minor" };
  if (PROPER_NAME.test(wish)) return { allowed: false, reason: "real_person" };
  if (REFERENCE_PHOTO.test(wish)) return { allowed: false, reason: "reference_photo" };
  return { allowed: true };
}
