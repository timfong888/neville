// Image prompt builder for wish visualisation. Framework-free: no React, no network.

const AVOID_LIST =
  "Avoid: plastic skin, over-smoothing, deformed fingers, extra limbs, duplicate people, CG look, watermarks, logos.";

const CAMERA_SPEC =
  "Photographer positioned front-slightly-offset (approx 1.5-2m), smartphone 26-35mm equivalent view." +
  " Realistic skin texture, natural ambient light, slight phone sharpening and grain, authentic documentary feel.";

// Normalise gender words so every person in the prompt is stated as an adult.
// The image prompt states this explicitly so the provider never guesses the age.
const ADULT_SUBSTITUTIONS: [RegExp, string][] = [
  // "women" / "woman" → "adult women / woman in their early twenties"
  [/\bwomen\b/gi, "adult women in their early twenties"],
  [/\bwoman\b/gi, "adult woman in her early twenties"],
  // "men" / "man" (but not "many", "manner", "manage" etc.)
  [/\bmen\b/gi, "adult men in their early twenties"],
  [/\bman\b/gi, "adult man in his early twenties"],
  // "people" / "person" → adults
  [/\bpeople\b/gi, "adults"],
  [/\bperson\b/gi, "adult person"],
];

/** Substitute gender/person words so every subject is stated as an adult. */
function adultify(text: string): string {
  let out = text;
  for (const [re, sub] of ADULT_SUBSTITUTIONS) out = out.replace(re, sub);
  return out;
}

/**
 * Build a single 9:16 photo prompt from a wish.
 *
 * Returns a prompt that:
 * - Requests one standalone 9:16 vertical photo
 * - Specifies a raw phone-camera look
 * - States every person as an adult in their early twenties
 * - Ends with a standard avoid list for the known failure modes
 */
export function imagePrompt(wish: string): string {
  const subject = adultify(wish.trim());
  return (
    "Generate a standalone 9:16 vertical ultra-realistic photo with the texture of a raw shot from a real smartphone main camera." +
    " Generate only one complete photo; strictly no collages, multi-grid layouts, sets or storyboards." +
    ` Theme and subject: ${subject}.` +
    ` ${CAMERA_SPEC}` +
    ` ${AVOID_LIST}`
  );
}
