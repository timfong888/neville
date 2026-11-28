// Voice row display helpers. Framework-free: no React, no native modules.
// Used by both native and web pickers.

export type VoiceForDisplay = {
  id: string;
  name: string;
  provider: string;
  model: string;
  generate: boolean;
  gender?: "male" | "female";
  pitch?: "Low" | "Medium" | "High";
  language?: string;
};

/**
 * Build the note line under a voice's name.
 * Production (showModel=false): shows gender, pitch, language only.
 * Testing (showModel=true): appends the provider name.
 */
export function voiceRowNote(v: VoiceForDisplay, showModel = false): string {
  const parts: string[] = [];
  if (v.gender) parts.push(v.gender === "female" ? "Female" : "Male");
  if (v.pitch) parts.push(v.pitch);
  if (v.language) parts.push(v.language.toUpperCase());
  if (showModel && v.provider) parts.push(v.provider);
  return parts.join(" · ");
}

/**
 * Filter a voice list to voices whose language matches, plus voices with no
 * language set (they are language-agnostic and appear in every language group).
 */
export function filterVoicesByLanguage<T extends { language?: string }>(
  voices: T[],
  language: string,
): T[] {
  return voices.filter((v) => !v.language || v.language === language);
}

/**
 * Resolve the active voice id against a language-filtered list.
 * - If the current id is still in the filtered list, return it with no notice.
 * - Otherwise fall back to `defaultId` (or the first generate=true filtered voice),
 *   and return a one-line notice for the UI to display.
 */
export function resolveVoiceForLanguage(
  voiceId: string,
  voices: (VoiceForDisplay & { generate: boolean })[],
  language: string,
  defaultId: string,
): { id: string; notice: string | null } {
  const filtered = filterVoicesByLanguage(voices, language);
  const inList = filtered.find((v) => v.id === voiceId && v.generate);
  if (inList) return { id: voiceId, notice: null };

  const fallback =
    filtered.find((v) => v.id === defaultId && v.generate) ??
    filtered.find((v) => v.generate);

  const id = fallback?.id ?? voiceId;
  const name = fallback?.name ?? id;
  const notice = `Switched to ${name} — your previous voice isn't available in ${language.toUpperCase()}.`;
  return { id, notice };
}
