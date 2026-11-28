// First-name rules, shared by the Profile screen and the API route.
// Empty is allowed; the script system then uses "you" only.

export const NAME_STORAGE_KEY = "nv_first_name";
export const MAX_FIRST_NAME = 30;

/** Letters (including accented), spaces, hyphens and apostrophes. Unicode-safe. */
const NAME_RE = /^[\p{L}\s\-']+$/u;

/** Returns an error string, or null when the name is acceptable. Empty string is accepted. */
export function validateFirstName(name: string): string | null {
  if (!name) return null;
  if (name.length > MAX_FIRST_NAME) return "Name must be 30 characters or fewer.";
  if (!NAME_RE.test(name)) return "Name may only contain letters, spaces, hyphens and apostrophes.";
  return null;
}
