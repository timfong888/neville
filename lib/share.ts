// Public share links. Framework-free: no Next, React or browser APIs.

import { MAX_TITLE, cleanTitle } from "@/lib/library/model";

/** The frozen copy a link stores, taken from the account's saved manifestation. */
export type ShareInput = { title: string; lines: string[]; voiceName: string; manifestationId: string };

/** What the public page shows. No wish text, no first name, no ids of the owner. */
export type PublicShare = { id: string; title: string; lines: string[]; voiceName: string; createdAt: number };

/** One of the maker's own links, as their manifestation's panel lists it. */
export type OwnLink = { id: string; createdAt: number };

export const SHARE_ID = /^[A-Za-z0-9_-]{22}$/;
/** Account manifestation ids are UUIDs. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A request to share names only the account manifestation; its text comes from the saved copy. */
export function parseShare(body: unknown): { ok: true; manifestationId: string } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Send JSON." };
  const mid = (body as { manifestationId?: unknown }).manifestationId;
  return typeof mid === "string" && UUID.test(mid) ? { ok: true, manifestationId: mid } : { ok: false, error: "Which manifestation?" };
}

type Stored = { title: unknown; lines: unknown; voiceName: unknown };

/**
 * The copy to freeze from a saved manifestation, normalised and capped the way
 * a share always was: a title, 1 to 40 lines within `maxChars`, and a voice
 * name of letters, digits and simple punctuation. An error when it cannot be shared.
 */
export function frozenCopy(stored: Stored, maxChars: number): { ok: true; title: string; lines: string[]; voiceName: string } | { ok: false; error: string } {
  const title = typeof stored.title === "string" ? cleanTitle(stored.title).slice(0, MAX_TITLE) : "";
  if (!title) return { ok: false, error: "It needs a title before it can be shared." };
  const raw = Array.isArray(stored.lines) ? stored.lines.filter((l): l is string => typeof l === "string") : [];
  const lines = raw.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!lines.length || lines.length > 40) return { ok: false, error: "Shared scripts need 1 to 40 lines." };
  if (lines.join(" ").length > maxChars) return { ok: false, error: `Shared scripts can be up to ${maxChars} characters.` };
  const voiceName = typeof stored.voiceName === "string" ? stored.voiceName.replace(/[^\p{L}\p{N} .'-]/gu, "").slice(0, 40) : "";
  return { ok: true, title, lines, voiceName };
}
