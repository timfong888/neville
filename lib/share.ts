// Public share links. Framework-free: no Next, React or browser APIs.

import { MAX_TITLE, cleanTitle } from "@/lib/library/model";

export type ShareInput = { title: string; lines: string[]; voiceName: string };

/** What the public page shows. No wish text, no first name, no ids of the owner. */
export type PublicShare = { id: string; title: string; lines: string[]; voiceName: string; createdAt: number };

/** What the owner's device keeps, per manifestation, to show and revoke the link. */
export type HeldShare = { shareId: string; ownerToken: string; createdAt: number };

export const SHARE_ID = /^[A-Za-z0-9_-]{22}$/;
export const OWNER_TOKEN = /^[A-Za-z0-9_-]{43}$/;

type Parsed = { ok: true; value: ShareInput } | { ok: false; error: string };

/** Validates a share request. `maxChars` caps the script, as for recordings. */
export function parseShare(body: unknown, maxChars: number): Parsed {
  if (!body || typeof body !== "object") return { ok: false, error: "Send JSON." };
  const b = body as { title?: unknown; lines?: unknown; voiceName?: unknown };
  const title = typeof b.title === "string" ? cleanTitle(b.title).slice(0, MAX_TITLE) : "";
  if (!title) return { ok: false, error: "A title is needed." };
  if (!Array.isArray(b.lines) || !b.lines.every((l) => typeof l === "string")) {
    return { ok: false, error: "Send the script as a list of lines." };
  }
  const lines = (b.lines as string[]).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!lines.length || lines.length > 40) return { ok: false, error: "The script needs 1 to 40 lines." };
  if (lines.join(" ").length > maxChars) return { ok: false, error: `Shared scripts can be up to ${maxChars} characters.` };
  const voiceName = typeof b.voiceName === "string" ? b.voiceName.replace(/[^\p{L}\p{N} .'-]/gu, "").slice(0, 40) : "";
  return { ok: true, value: { title, lines, voiceName } };
}

const KEY = "nv_shares_v1";

type KV = Pick<Storage, "getItem" | "setItem">;

/** Shares this device made, keyed by manifestation id. Malformed entries are dropped. */
export function readHeld(store: KV | null | undefined): Record<string, HeldShare> {
  try {
    const raw = JSON.parse(store?.getItem(KEY) ?? "{}") as Record<string, unknown>;
    const out: Record<string, HeldShare> = {};
    for (const [k, v] of Object.entries(raw ?? {})) {
      const h = v as Partial<HeldShare>;
      if (h && typeof h.shareId === "string" && SHARE_ID.test(h.shareId) && typeof h.ownerToken === "string" && OWNER_TOKEN.test(h.ownerToken)) {
        out[k] = { shareId: h.shareId, ownerToken: h.ownerToken, createdAt: Number(h.createdAt) || 0 };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Stores or (with null) forgets the share for one manifestation. Returns false if storage refused. */
export function writeHeld(store: KV | null | undefined, manifestationId: string, held: HeldShare | null): boolean {
  try {
    const all = readHeld(store);
    if (held) all[manifestationId] = held;
    else delete all[manifestationId];
    store?.setItem(KEY, JSON.stringify(all));
    return !!store;
  } catch {
    return false;
  }
}
