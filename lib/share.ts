// Public share links. Framework-free: no Next, React or browser APIs.

import { MAX_TITLE, cleanTitle } from "@/lib/library/model";

export type ShareInput = { title: string; lines: string[]; voiceName: string; manifestationId: string | null };

/** What the public page shows. No wish text, no first name, no ids of the owner. */
export type PublicShare = { id: string; title: string; lines: string[]; voiceName: string; createdAt: number };

/**
 * What the owner's device keeps for each link it made, to show and revoke it.
 * `from` is the copy it was made from: a device copy, or the account's copy.
 * `pending` marks a revoke that could not reach the server (links switched
 * off) and is retried later; its manifestation may already be deleted.
 */
export type HeldShare = {
  shareId: string;
  ownerToken: string;
  createdAt: number;
  manifestationId: string;
  from: "device" | "account";
  pending?: boolean;
};

export const SHARE_ID = /^[A-Za-z0-9_-]{22}$/;
export const OWNER_TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** Manifestation ids are UUIDs, or older device ids; never trusted beyond matching. */
export const MANIFESTATION_ID = /^[A-Za-z0-9-]{1,64}$/;

type Parsed = { ok: true; value: ShareInput } | { ok: false; error: string };

/** Validates a share request. `maxChars` caps the script, as for recordings. */
export function parseShare(body: unknown, maxChars: number): Parsed {
  if (!body || typeof body !== "object") return { ok: false, error: "Send JSON." };
  const b = body as { title?: unknown; lines?: unknown; voiceName?: unknown; manifestationId?: unknown };
  const title = typeof b.title === "string" ? cleanTitle(b.title).slice(0, MAX_TITLE) : "";
  if (!title) return { ok: false, error: "A title is needed." };
  if (!Array.isArray(b.lines) || !b.lines.every((l) => typeof l === "string")) {
    return { ok: false, error: "Send the script as a list of lines." };
  }
  const lines = (b.lines as string[]).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!lines.length || lines.length > 40) return { ok: false, error: "The script needs 1 to 40 lines." };
  if (lines.join(" ").length > maxChars) return { ok: false, error: `Shared scripts can be up to ${maxChars} characters.` };
  const voiceName = typeof b.voiceName === "string" ? b.voiceName.replace(/[^\p{L}\p{N} .'-]/gu, "").slice(0, 40) : "";
  const manifestationId = typeof b.manifestationId === "string" && MANIFESTATION_ID.test(b.manifestationId) ? b.manifestationId : null;
  return { ok: true, value: { title, lines, voiceName, manifestationId } };
}

const KEY = "nv_shares_v2";
const LEGACY_KEY = "nv_shares_v1";

type KV = Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "removeItem">>;

function valid(h: Partial<HeldShare> | null | undefined): h is HeldShare {
  return !!h && typeof h.shareId === "string" && SHARE_ID.test(h.shareId) && typeof h.ownerToken === "string" && OWNER_TOKEN.test(h.ownerToken);
}

/**
 * Every link this device made, keyed by share id, so two tabs sharing the
 * same manifestation never overwrite each other's token. Entries from the
 * older per-manifestation format are read as made from a device copy.
 * Malformed entries are dropped.
 */
export function readHeld(store: KV | null | undefined): HeldShare[] {
  const out = new Map<string, HeldShare>();
  try {
    const legacy = JSON.parse(store?.getItem(LEGACY_KEY) ?? "{}") as Record<string, Partial<HeldShare>>;
    for (const [mid, h] of Object.entries(legacy ?? {})) {
      if (valid(h) && MANIFESTATION_ID.test(mid)) {
        out.set(h.shareId, { shareId: h.shareId, ownerToken: h.ownerToken, createdAt: Number(h.createdAt) || 0, manifestationId: mid, from: "device" });
      }
    }
  } catch {
    /* unreadable legacy entries are ignored */
  }
  try {
    const raw = JSON.parse(store?.getItem(KEY) ?? "{}") as Record<string, Partial<HeldShare>>;
    for (const h of Object.values(raw ?? {})) {
      if (valid(h) && typeof h.manifestationId === "string" && MANIFESTATION_ID.test(h.manifestationId)) {
        out.set(h.shareId, {
          shareId: h.shareId,
          ownerToken: h.ownerToken,
          createdAt: Number(h.createdAt) || 0,
          manifestationId: h.manifestationId,
          from: h.from === "account" ? "account" : "device",
          ...(h.pending ? { pending: true } : {}),
        });
      }
    }
  } catch {
    /* unreadable entries are ignored */
  }
  return [...out.values()];
}

function save(store: KV | null | undefined, all: HeldShare[]): boolean {
  try {
    if (!store) return false;
    store.setItem(KEY, JSON.stringify(Object.fromEntries(all.map((h) => [h.shareId, h]))));
    store.removeItem?.(LEGACY_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Remembers one more link. Re-reads storage first, so other tabs' links stay. */
export function addHeld(store: KV | null | undefined, held: HeldShare): boolean {
  return save(store, [...readHeld(store).filter((h) => h.shareId !== held.shareId), held]);
}

/** Forgets a link once it is revoked (or already gone). */
export function removeHeld(store: KV | null | undefined, shareId: string): boolean {
  return save(store, readHeld(store).filter((h) => h.shareId !== shareId));
}

/** Keeps a link's token for a later retry, because revoking it could not reach the server. */
export function markPending(store: KV | null | undefined, shareId: string): boolean {
  return save(store, readHeld(store).map((h) => (h.shareId === shareId ? { ...h, pending: true } : h)));
}

/**
 * The links to revoke when a manifestation is deleted. From a device copy,
 * links made from the account's copy of the same id stay: that copy still
 * exists. From the account, every link to it goes.
 */
export function linksToRevoke(all: HeldShare[], manifestationId: string, fromDevice: boolean): HeldShare[] {
  return all.filter((h) => h.manifestationId === manifestationId && !(fromDevice && h.from === "account"));
}

/** The links a manifestation's panel shows: on a device copy, only those made from a device copy. */
export function linksShown(all: HeldShare[], manifestationId: string, fromDevice: boolean): HeldShare[] {
  return linksToRevoke(all, manifestationId, fromDevice)
    .filter((h) => !h.pending)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * What a revoke response means. "gone": the link no longer works (revoked,
 * or already gone), so forget it. "deferred": public links are switched off,
 * so nothing was deleted and nothing can be served; keep the token and retry.
 * "failed": anything else; nothing should be deleted on top of it.
 */
export function revokeOutcome(status: number, code: string | undefined): "gone" | "deferred" | "failed" {
  if (status === 200 || status === 404) return "gone";
  if (status === 503 && code === "links_off") return "deferred";
  return "failed";
}
