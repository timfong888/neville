// Public share links. Framework-free: no Next, React or browser APIs.

import { MAX_TITLE, cleanTitle } from "@/lib/library/model";

/** A link request: always for one of the signed-in account's saved manifestations. */
export type ShareInput = { title: string; lines: string[]; voiceName: string; manifestationId: string };

/** What the public page shows. No wish text, no first name, no ids of the owner. */
export type PublicShare = { id: string; title: string; lines: string[]; voiceName: string; createdAt: number };

/** One of the maker's own links, as their manifestation's panel lists it. */
export type OwnLink = { id: string; createdAt: number };

export const SHARE_ID = /^[A-Za-z0-9_-]{22}$/;
/** Account manifestation ids are UUIDs. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Parsed = { ok: true; value: ShareInput } | { ok: false; error: string };

/** Validates a share request. `maxChars` caps the script, as for recordings. */
export function parseShare(body: unknown, maxChars: number): Parsed {
  if (!body || typeof body !== "object") return { ok: false, error: "Send JSON." };
  const b = body as { title?: unknown; lines?: unknown; voiceName?: unknown; manifestationId?: unknown };
  const manifestationId = typeof b.manifestationId === "string" && UUID.test(b.manifestationId) ? b.manifestationId : "";
  if (!manifestationId) return { ok: false, error: "Which manifestation?" };
  const title = typeof b.title === "string" ? cleanTitle(b.title).slice(0, MAX_TITLE) : "";
  if (!title) return { ok: false, error: "A title is needed." };
  if (!Array.isArray(b.lines) || !b.lines.every((l) => typeof l === "string")) {
    return { ok: false, error: "Send the script as a list of lines." };
  }
  const lines = (b.lines as string[]).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!lines.length || lines.length > 40) return { ok: false, error: "The script needs 1 to 40 lines." };
  if (lines.join(" ").length > maxChars) return { ok: false, error: `Shared scripts can be up to ${maxChars} characters.` };
  const voiceName = typeof b.voiceName === "string" ? b.voiceName.replace(/[^\p{L}\p{N} .'-]/gu, "").slice(0, 40) : "";
  return { ok: true, value: { title, lines, voiceName, manifestationId } };
}
